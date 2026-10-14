import Peer, { type DataConnection, type PeerOptions } from "peerjs";
import { BrowserHost } from "./peer-host";
import { codePattern, type RoomSocket } from "../worker/room";
import type { TransportSocket } from "./network";

type Entry = { code: string; token: string; id: string };
type Packet =
  | { kind: "join"; token?: string }
  | { kind: "joined"; entry?: Entry; error?: string }
  | { kind: "event"; data: string }
  | { kind: "message"; data: string }
  | { kind: "snapshot-ack"; seq: number }
  | { kind: "closed"; code: number; reason: string };
const prefix = "rally-together-v1-";
const options: PeerOptions = {
  ...(import.meta.env.VITE_PEER_HOST
    ? {
        host: import.meta.env.VITE_PEER_HOST,
        port: Number(import.meta.env.VITE_PEER_PORT || 9000),
        path: "/peerjs",
        secure: false,
      }
    : {}),
  config: {
    iceServers: [
      {
        urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"],
      },
    ],
  },
  debug: 0,
};
const timeoutMessage =
  "Устройства не смогли соединиться. Оставьте вкладку организатора открытой и попробуйте общий Wi-Fi. Некоторые сети требуют TURN.";

class ClientSocket implements TransportSocket {
  readyState = 1;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number; reason: string }) => void) | null = null;
  constructor(
    private transmit: (data: string) => void,
    private shutdown: () => void,
  ) {}
  receive(data: string) {
    if (this.readyState === 1) this.onmessage?.({ data });
  }
  send(data: string) {
    if (this.readyState === 1) this.transmit(data);
  }
  closed(code = 4000, reason = "Потеряна связь с организатором") {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code, reason });
  }
  close() {
    this.shutdown();
    this.closed();
  }
}
class HostSocket implements RoomSocket {
  private attachment: unknown;
  private closed = false;
  constructor(
    private emit: (packet: Packet) => void,
    private disconnect: () => void,
  ) {}
  send(data: string) {
    if (!this.closed) this.emit({ kind: "event", data });
  }
  close(code = 1000, reason = "") {
    if (this.closed) return;
    this.closed = true;
    this.emit({ kind: "closed", code, reason });
    this.disconnect();
  }
  serializeAttachment(value: unknown) {
    this.attachment = structuredClone(value);
  }
  deserializeAttachment() {
    return structuredClone(this.attachment);
  }
}

export class PeerTransport {
  private peer?: Peer;
  private host?: BrowserHost;
  private remote?: DataConnection;
  private entry?: Entry;
  private ended = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private releaseLease?: () => void;
  constructor(private report: (text: string) => void) {}
  private async register(id?: string): Promise<Peer> {
    let brokerToken: string | undefined;
    if (id) {
      brokerToken =
        sessionStorage.getItem("rally-broker:" + id) ?? crypto.randomUUID();
      sessionStorage.setItem("rally-broker:" + id, brokerToken);
    }
    const peer = id
      ? new Peer(id, { ...options, token: brokerToken })
      : new Peer(options);
    this.peer = peer;
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        peer.destroy();
        reject(
          Error("Сервер соединения не отвечает. Повторите попытку позже."),
        );
      }, 20000);
      const opened = () => {
        clearTimeout(timer);
        peer.off("error", failed);
        resolve();
      };
      const failed = (error: { type: string }) => {
        clearTimeout(timer);
        peer.destroy();
        reject(
          Error(
            error.type === "unavailable-id"
              ? "Комната уже открыта в другой вкладке."
              : "Не удалось подключиться к серверу соединения. Проверьте сеть.",
          ),
        );
      };
      peer.once("open", opened);
      peer.once("error", failed);
    });
    peer.on("error", (error) => {
      if (!this.ended && error.type !== "peer-unavailable")
        this.report("Сервер соединения потерял связь. Переподключаемся…");
    });
    peer.on("disconnected", () => {
      if (!this.ended)
        this.reconnectTimer = setTimeout(() => {
          if (!peer.destroyed && peer.disconnected) peer.reconnect();
        }, 1000);
    });
    return peer;
  }
  private async lease(code: string) {
    if (!navigator.locks) return;
    await new Promise<void>((resolve, reject) => {
      void navigator.locks
        .request("rally-organizer:" + code, { ifAvailable: true }, (lock) => {
          if (!lock) {
            reject(Error("Комната уже открыта в другой вкладке."));
            return;
          }
          resolve();
          return new Promise<void>((release) => {
            this.releaseLease = release;
          });
        })
        .catch(reject);
    });
  }
  async enter(role?: string, code?: string, token?: string): Promise<Entry> {
    this.ended = false;
    if (role) {
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      code = Array.from(
        crypto.getRandomValues(new Uint8Array(8)),
        (byte) => alphabet[byte % 32],
      ).join("");
      await this.lease(code);
      const peer = await this.register(prefix + code);
      this.host = new BrowserHost(code);
      peer.on("connection", (connection) => this.accept(connection));
      const response = await this.host.run(() =>
        this.host!.engine.fetch(
          new Request("https://room/init", {
            method: "POST",
            body: JSON.stringify({ code, role }),
          }),
        ),
      );
      if (!response.ok) throw Error("Не удалось создать комнату");
      this.entry = (await response.json()) as Entry;
      return this.entry;
    }
    if (!code || !codePattern.test(code))
      throw Error("Код должен содержать 8 латинских букв или цифр");
    // A reload in the organizer's original tab restores its room and resume token.
    if (token && sessionStorage.getItem("rally-host:" + code)) {
      await this.lease(code);
      let peer: Peer | undefined;
      for (let attempt = 0; attempt < 6; attempt++) {
        try {
          peer = await this.register(prefix + code);
          break;
        } catch (error) {
          if (
            (error as Error).message !==
              "Комната уже открыта в другой вкладке." ||
            attempt === 5
          )
            throw error;
          await new Promise((resolve) => setTimeout(resolve, 700));
        }
      }
      this.host = new BrowserHost(code, sessionStorage, true);
      peer!.on("connection", (connection) => this.accept(connection));
      const response = await this.host.run(() =>
        this.host!.engine.fetch(
          new Request("https://room/join", {
            method: "POST",
            body: JSON.stringify({ token }),
          }),
        ),
      );
      if (!response.ok) throw Error("Срок комнаты истёк. Создайте новую.");
      this.entry = (await response.json()) as Entry;
      return this.entry;
    }
    await this.register();
    return this.join(code, token);
  }
  private accept(connection: DataConnection) {
    const host = this.host!;
    let link: HostSocket | undefined;
    let joining = false;
    const timer = setTimeout(() => {
      if (!link) connection.close();
    }, 10000);
    connection.on("data", (raw) => {
      let packet: Packet;
      try {
        if (!raw || typeof raw !== "object" || !("kind" in raw)) {
          connection.close();
          return;
        }
        if (JSON.stringify(raw).length > 24000) {
          connection.close();
          return;
        }
        packet = raw as Packet;
      } catch {
        connection.close();
        return;
      }
      if (packet.kind === "join" && !link && !joining) {
        joining = true;
        void host
          .run(async () => {
            if (host.getWebSockets().length >= 6 || !host.canJoin()) {
              connection.send({
                kind: "joined",
                error: "Слишком много подключений. Подождите минуту.",
              });
              return;
            }
            const response = await host.engine.fetch(
              new Request("https://room/join", {
                method: "POST",
                body: JSON.stringify({ token: packet.token }),
              }),
            );
            const data = (await response.json()) as Entry & { error?: string };
            if (!response.ok) {
              connection.send({ kind: "joined", error: data.error });
              return;
            }
            link = new HostSocket(
              (packet) => connection.send(packet),
              () => {
                setTimeout(() => connection.close(), 100);
              },
            );
            await host.engine.acceptSocket(link);
            clearTimeout(timer);
            connection.send({ kind: "joined", entry: data });
          })
          .catch(() => connection.close());
      } else if (
        packet.kind === "message" &&
        link &&
        typeof packet.data === "string"
      ) {
        void host
          .run(async () => {
            await host.engine.webSocketMessage(link!, packet.data);
            try {
              const message = JSON.parse(packet.data);
              const attachment = link!.deserializeAttachment() as {
                snapshot?: { seq: number };
              };
              if (
                message.type === "snapshot" &&
                attachment.snapshot?.seq === message.seq
              )
                connection.send({
                  kind: "snapshot-ack",
                  seq: message.seq,
                } satisfies Packet);
            } catch {}
          })
          .catch(() => connection.close());
      }
    });
    const closed = () => {
      clearTimeout(timer);
      if (link) {
        host.remove(link);
        void host.run(() => host.engine.webSocketClose(link!)).catch(() => {});
      }
    };
    connection.on("close", closed);
    connection.on("error", () => connection.close());
  }
  private async join(code: string, token?: string): Promise<Entry> {
    const connection = this.peer!.connect(prefix + code, {
      reliable: true,
      serialization: "json",
    });
    this.remote = connection;
    return new Promise<Entry>((resolve, reject) => {
      let settled = false;
      const fail = (message: string) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(Error(message));
        connection.close();
      };
      const timer = setTimeout(() => fail(timeoutMessage), 20000);
      const peerError = (error: { type: string }) => {
        if (error.type === "peer-unavailable")
          fail("Комната не найдена. Проверьте код и вкладку организатора.");
      };
      const cleanup = () => {
        clearTimeout(timer);
        this.peer?.off("error", peerError);
        connection.off("data", joined);
      };
      const joined = (raw: unknown) => {
        const packet = raw as Packet;
        if (packet.kind !== "joined") return;
        if (packet.error || !packet.entry)
          return fail(packet.error || "Не удалось войти в комнату");
        cleanup();
        settled = true;
        this.entry = packet.entry;
        resolve(packet.entry);
      };
      this.peer!.on("error", peerError);
      connection.on("open", () =>
        connection.send({ kind: "join", token } satisfies Packet),
      );
      connection.on("data", joined);
      connection.once("error", () => fail(timeoutMessage));
      connection.once("close", () => {
        if (!settled) fail("Соединение с организатором закрыто");
      });
    });
  }
  async connect(): Promise<TransportSocket> {
    if (this.host) {
      const host = this.host;
      let client: ClientSocket;
      const link = new HostSocket(
        (packet) =>
          queueMicrotask(() => {
            if (packet.kind === "event") client.receive(packet.data);
            if (packet.kind === "closed")
              client.closed(packet.code, packet.reason);
          }),
        () => {
          host.remove(link);
          void host.run(() => host.engine.webSocketClose(link)).catch(() => {});
        },
      );
      client = new ClientSocket(
        (data) => {
          void host
            .run(() => host.engine.webSocketMessage(link, data))
            .catch(() => client.closed());
        },
        () => link.close(4000, "Переподключение"),
      );
      await host.run(() => host.engine.acceptSocket(link));
      return client;
    }
    if (!this.remote?.open)
      await this.join(this.entry!.code, this.entry!.token);
    const connection = this.remote!;
    const client = new ClientSocket(
      (data) => connection.send({ kind: "message", data } satisfies Packet),
      () => connection.close(),
    );
    connection.on("data", (raw) => {
      const packet = raw as Packet;
      if (packet.kind === "event") client.receive(packet.data);
      if (packet.kind === "closed") client.closed(packet.code, packet.reason);
    });
    connection.on("close", () => client.closed());
    connection.on("error", () => client.closed());
    return client;
  }
  ice() {
    return {
      hasTurn: false,
      iceTransportPolicy: "all" as RTCIceTransportPolicy,
      iceServers: options.config!.iceServers!,
    };
  }
  stop() {
    this.ended = true;
    this.releaseLease?.();
    clearTimeout(this.reconnectTimer);
    this.host?.stop();
    setTimeout(() => {
      this.remote?.close();
      this.peer?.destroy();
    }, 150);
  }
}
