import {
  messageSchema,
  elapsed,
  type RoomState,
  type Snapshot,
  type ServerMessage,
} from "../shared/protocol";
import { at, checkpoints } from "../shared/track";
import {
  initial,
  canStart,
  clearRace,
  pause,
  validateMovement,
  advance,
} from "./model";
export interface VoiceConfig {
  STUN_URLS: string;
  TURN_URLS: string;
  TURN_SECRET?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
  VOICE_RELAY_ONLY: string;
}
export interface RoomSocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}
export interface RoomContext {
  storage: {
    get<T>(key: string): Promise<T | undefined>;
    put(key: string, value: unknown): Promise<void>;
    setAlarm(timestamp: number): Promise<void>;
  };
  blockConcurrencyWhile(callback: () => Promise<unknown>): unknown;
  getWebSockets(): RoomSocket[];
  acceptWebSocket(socket: RoomSocket): void;
}
type Attachment = {
  id?: string;
  seen: number;
  window: number;
  count: number;
  lastMove: number;
  lastCall: number;
  snapshot?: Snapshot;
  voice?: boolean;
};
export const json = (v: unknown, status = 200) =>
  Response.json(v, { status, headers: { "Cache-Control": "no-store" } });
export const err = (message: string, status = 400) =>
  json({ error: message }, status);
export const codePattern = /^[A-HJ-NP-Z2-9]{8}$/;
export async function body(r: Request) {
  if (Number(r.headers.get("content-length")) > 4096) throw Error();
  const text = await r.text();
  if (text.length > 4096) throw Error();
  return JSON.parse(text);
}
export class RoomEngine {
  s: RoomState | null = null;
  tokens: Record<string, string> = {};
  resetIds: string[] = [];
  lastReset = 0;
  constructor(
    public ctx: RoomContext,
    public env: VoiceConfig,
  ) {
    ctx.blockConcurrencyWhile(async () => {
      const saved = await ctx.storage.get<{
        s: RoomState;
        tokens: Record<string, string>;
        resetIds: string[];
        lastReset: number;
      }>("room");
      if (saved) {
        this.s = saved.s;
        this.tokens = saved.tokens;
        this.resetIds = saved.resetIds;
        this.lastReset = saved.lastReset;
        const snaps = ctx
          .getWebSockets()
          .map((ws) => (ws.deserializeAttachment() as Attachment).snapshot)
          .filter(Boolean) as Snapshot[];
        for (const snap of snaps)
          if (
            snap.epoch === this.s.epoch &&
            snap.seq > (this.s.snapshot?.seq ?? -1)
          ) {
            this.s.snapshot = snap;
            this.s.progress = snap.progress;
          }
        // При гибернации сокеты живы. После полного рестарта их может не быть:
        // не выдаём сохранённый connected за реальное присутствие игрока.
        const ids = new Set(
          ctx
            .getWebSockets()
            .map((ws) => (ws.deserializeAttachment() as Attachment).id),
        );
        const lost = this.s.players.some((p) => p.connected && !ids.has(p.id));
        this.s.players.forEach((p) => (p.connected = ids.has(p.id)));
        if (lost) {
          if (this.s.phase === "racing" || this.s.phase === "countdown") {
            this.s.elapsed = this.s.snapshot?.time ?? this.s.elapsed;
            this.s.phase = "paused";
            this.s.pausedAt = Date.now();
            this.s.players.forEach((p) => (p.resume = false));
          }
          if (this.s.phase === "ready") this.s.phase = "lobby";
          this.s.players.forEach((p) => (p.ready = false));
          await this.save();
        }
      }
    });
  }
  async save() {
    await this.ctx.storage.put("room", {
      s: this.s,
      tokens: this.tokens,
      resetIds: this.resetIds,
      lastReset: this.lastReset,
    });
  }
  send(ws: RoomSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }
  sockets() {
    return this.ctx
      .getWebSockets()
      .filter((ws) => (ws.deserializeAttachment() as Attachment)?.id);
  }
  broadcast(msg: ServerMessage, except?: RoomSocket) {
    for (const ws of this.sockets()) if (ws !== except) this.send(ws, msg);
  }
  state() {
    if (!this.s) return;
    this.s.serverNow = Date.now();
    for (const ws of this.sockets())
      this.send(ws, {
        type: "state",
        state: this.s,
        you: (ws.deserializeAttachment() as Attachment).id!,
      });
  }
  async schedule() {
    const s = this.s!;
    const due =
      s.phase === "countdown"
        ? s.startAt
        : Math.min(s.expiresAt, Date.now() + 30_000);
    await this.ctx.storage.setAlarm(due);
  }
  async fetch(req: Request) {
    const path = new URL(req.url).pathname,
      now = Date.now();
    if (path === "/init") {
      if (this.s) return err("Код уже использован", 409);
      const data = await body(req);
      if (this.s) return err("Код уже использован", 409);
      this.s = initial(data.code);
      const id = crypto.randomUUID(),
        token = crypto.randomUUID();
      this.s.host = id;
      this.s.players.push({
        id,
        role: data.role,
        name: "Игрок 1",
        ready: false,
        connected: false,
        resume: false,
      });
      this.tokens[token] = id;
      await this.save();
      await this.schedule();
      return json({ code: data.code, token, id });
    }
    if (!this.s) return err("Комната не найдена", 404);
    if (now > this.s.expiresAt)
      return err("Срок комнаты истёк. Создайте новую.", 410);
    if (path === "/join" && req.method === "POST") {
      const data = await body(req);
      if (
        typeof data.token === "string" &&
        Object.hasOwn(this.tokens, data.token)
      )
        return json({
          code: this.s.code,
          token: data.token,
          id: this.tokens[data.token],
        });
      if (this.s.players.length >= 2)
        return err("В комнате уже два игрока", 409);
      if (!["lobby", "ready"].includes(this.s.phase))
        return err("Заезд уже начат. Дождитесь возвращения в лобби.", 409);
      const id = crypto.randomUUID(),
        token = crypto.randomUUID();
      this.tokens[token] = id;
      this.s.players.push({
        id,
        role: this.s.players[0]?.role === "driver" ? "codriver" : "driver",
        name: "Игрок 2",
        ready: false,
        connected: false,
        resume: false,
      });
      if (!this.s.host) this.s.host = id;
      this.s.players.forEach((p) => (p.ready = false));
      this.s.phase = "lobby";
      await this.save();
      this.state();
      return json({ code: this.s.code, token, id });
    }
    if (path === "/ice") {
      const token = req.headers.get("Authorization")?.replace(/^Bearer /, "");
      if (!token || !Object.hasOwn(this.tokens, token))
        return err("Нет доступа", 401);
      const iceServers: RTCIceServer[] = [];
      if (this.env.STUN_URLS)
        iceServers.push({ urls: this.env.STUN_URLS.split(",") });
      if (this.env.TURN_URLS) {
        let username = this.env.TURN_USERNAME,
          credential = this.env.TURN_CREDENTIAL;
        if (this.env.TURN_SECRET) {
          username = `${Math.floor(now / 1000) + 3600}:${this.tokens[token]}`;
          const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(this.env.TURN_SECRET),
            { name: "HMAC", hash: "SHA-1" },
            false,
            ["sign"],
          );
          credential = btoa(
            String.fromCharCode(
              ...new Uint8Array(
                await crypto.subtle.sign(
                  "HMAC",
                  key,
                  new TextEncoder().encode(username),
                ),
              ),
            ),
          );
        }
        if (username && credential)
          iceServers.push({
            urls: this.env.TURN_URLS.split(","),
            username,
            credential,
          });
      }
      return json({
        iceServers,
        iceTransportPolicy:
          this.env.VOICE_RELAY_ONLY === "true" ? "relay" : "all",
        hasTurn: iceServers.some(
          (s) =>
            String(s.urls).includes("turn:") ||
            String(s.urls).includes("turns:"),
        ),
      });
    }
    return err("Адрес не найден", 404);
  }
  async acceptSocket(socket: RoomSocket) {
    this.ctx.acceptWebSocket(socket);
    const now = Date.now();
    socket.serializeAttachment({
      seen: now,
      window: now,
      count: 0,
      lastMove: 0,
      lastCall: 0,
    } satisfies Attachment);
    await this.schedule();
  }
  async webSocketMessage(ws: RoomSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > 24000) {
      ws.close(1009, "Слишком большое сообщение");
      return;
    }
    const a = ws.deserializeAttachment() as Attachment;
    const now = Date.now();
    if (now - a.window > 1000) {
      a.window = now;
      a.count = 0;
    }
    if (++a.count > 45) {
      ws.close(1008, "Слишком много сообщений");
      return;
    }
    a.seen = now;
    ws.serializeAttachment(a);
    let m;
    try {
      m = messageSchema.parse(JSON.parse(raw));
    } catch {
      this.send(ws, { type: "error", message: "Некорректное сообщение" });
      return;
    }
    const s = this.s;
    if (!s || now > s.expiresAt) {
      ws.close(1008, "Комната закрыта");
      return;
    }
    if (m.type === "auth") {
      const id = this.tokens[m.token];
      if (!id) {
        ws.close(1008, "Недействительный ключ входа");
        return;
      }
      for (const other of this.sockets()) {
        const b = other.deserializeAttachment() as Attachment;
        if (b.id === id && other !== ws) {
          b.id = undefined;
          other.serializeAttachment(b);
          other.close(4001, "Открыта другая вкладка");
        }
      }
      a.id = id;
      ws.serializeAttachment(a);
      pause(s, now);
      const p = s.players.find((p) => p.id === id)!;
      p.connected = true;
      p.ready = false;
      p.resume = false;
      if (s.phase === "ready") s.phase = "lobby";
      await this.save();
      this.state();
      for (const other of this.sockets())
        if (other !== ws && (other.deserializeAttachment() as Attachment).voice)
          this.send(ws, { type: "voice-ready" });
      return;
    }
    const p = s.players.find((p) => p.id === a.id);
    if (!p) {
      ws.close(1008, "Сначала войдите в комнату");
      return;
    }
    if (m.type === "ping") {
      this.send(ws, { type: "pong", now });
      return;
    }
    if (m.type === "signal") {
      this.broadcast({ type: "signal", data: m.data }, ws);
      return;
    }
    if (m.type === "voice-ready" || m.type === "voice-stop") {
      a.voice = m.type === "voice-ready";
      ws.serializeAttachment(a);
      this.broadcast({ type: m.type }, ws);
      return;
    }
    if (m.type === "call") {
      if (p.role === "codriver" && now - a.lastCall > 800) {
        a.lastCall = now;
        ws.serializeAttachment(a);
        this.broadcast({ type: "call", call: m.call }, ws);
      }
      return;
    }
    if (s.phase === "countdown" && now >= s.startAt) {
      s.phase = "racing";
      await this.save();
      this.state();
    }
    if (m.type === "snapshot") {
      if (p.role !== "driver" || now - a.lastMove < 45) return;
      const previous = a.snapshot?.epoch === s.epoch ? a.snapshot : s.snapshot;
      const dt = a.lastMove ? Math.min(1, (now - a.lastMove) / 1000) : 0.2;
      const next: Snapshot = {
        ...m,
        progress: s.progress,
        checkpoint: s.checkpoint,
        time: elapsed(s, now),
      };
      const pos = validateMovement(s, previous, next, dt);
      if (!pos) return;
      const before = s.checkpoint;
      const done = advance(s, pos);
      next.progress = s.progress;
      next.checkpoint = s.checkpoint;
      s.snapshot = next;
      a.snapshot = next;
      a.lastMove = now;
      ws.serializeAttachment(a);
      this.broadcast({ type: "snapshot", snapshot: next }, ws);
      if (done) {
        s.elapsed = elapsed(s, now);
        s.phase = "finished";
        s.result = s.elapsed + s.penalty;
        s.best = Math.min(s.best ?? Infinity, s.result);
        await this.save();
        this.state();
      } else if (before !== s.checkpoint) {
        await this.save();
        this.state();
      }
      return;
    }
    if (m.type === "name" && ["lobby", "ready"].includes(s.phase)) {
      p.name = m.name;
    } else if (
      (m.type === "role" || (m.type === "random-roles" && p.id === s.host)) &&
      ["lobby", "ready"].includes(s.phase)
    ) {
      const role =
        m.type === "role"
          ? m.role
          : crypto.getRandomValues(new Uint8Array(1))[0] % 2
            ? "driver"
            : "codriver";
      p.role = role;
      for (const other of s.players) {
        if (other.id !== p.id)
          other.role = role === "driver" ? "codriver" : "driver";
        other.ready = false;
      }
      s.swap = null;
      s.phase = "lobby";
    } else if (m.type === "ready" && ["lobby", "ready"].includes(s.phase)) {
      p.ready = m.value;
      s.phase =
        s.players.length === 2 && s.players.every((p) => p.ready && p.connected)
          ? "ready"
          : "lobby";
    } else if (m.type === "start" && canStart(s, p)) {
      s.phase = "countdown";
      s.startAt = now + 4000;
      s.epoch++;
      s.snapshot = null;
    } else if (m.type === "pause") {
      pause(s, now);
    } else if (
      m.type === "resume" &&
      s.phase === "paused" &&
      s.players.length === 2 &&
      s.players.every((p) => p.connected)
    ) {
      p.resume = true;
      if (s.players.every((p) => p.resume)) {
        s.phase = "countdown";
        s.startAt = now + 3000;
      }
    } else if (
      m.type === "swap" &&
      ["lobby", "ready"].includes(s.phase) &&
      s.players.length === 2
    ) {
      if (s.swap && s.swap !== p.id) {
        s.players.forEach((p) => {
          p.role = p.role === "driver" ? "codriver" : "driver";
          p.ready = false;
        });
        s.swap = null;
        s.phase = "lobby";
      } else s.swap = p.id;
    } else if (
      (m.type === "lobby" || m.type === "restart") &&
      p.id === s.host &&
      ["paused", "finished"].includes(s.phase)
    ) {
      clearRace(s);
    } else if (
      m.type === "reset" &&
      p.role === "driver" &&
      s.phase === "racing" &&
      now - this.lastReset > 5000 &&
      !this.resetIds.includes(m.id)
    ) {
      this.lastReset = now;
      this.resetIds.push(m.id);
      this.resetIds = this.resetIds.slice(-30);
      s.penalty += 5000;
      s.resets++;
      s.recovery++;
      s.epoch++;
      const point = at(s.checkpoint ? checkpoints[s.checkpoint - 1].s : 0);
      s.progress = point.s;
      s.snapshot = null;
      for (const socket of this.sockets()) {
        const b = socket.deserializeAttachment() as Attachment;
        b.snapshot = undefined;
        b.lastMove = 0;
        socket.serializeAttachment(b);
      }
    } else if (m.type === "leave") {
      pause(s, now);
      s.players = s.players.filter((x) => x.id !== p.id);
      for (const token in this.tokens)
        if (this.tokens[token] === p.id) delete this.tokens[token];
      if (s.host === p.id) s.host = s.players[0]?.id ?? "";
      s.players.forEach((p) => (p.ready = false));
      if (["lobby", "ready"].includes(s.phase)) s.phase = "lobby";
      a.id = undefined;
      ws.serializeAttachment(a);
      ws.close(1000, "Вы вышли");
      if (!s.players.length) s.expiresAt = now;
    } else {
      this.send(ws, { type: "error", message: "Действие сейчас недоступно" });
      return;
    }
    await this.save();
    await this.schedule();
    this.state();
  }
  async webSocketClose(ws: RoomSocket) {
    try {
      ws.close();
    } catch {}
    const a = ws.deserializeAttachment() as Attachment;
    if (!this.s || !a.id) return;
    const p = this.s.players.find((p) => p.id === a.id);
    a.id = undefined;
    ws.serializeAttachment(a);
    if (p) {
      p.connected = false;
      p.ready = false;
      p.resume = false;
      pause(this.s, Date.now());
      if (this.s.phase === "ready") this.s.phase = "lobby";
      await this.save();
      this.state();
    }
    await this.schedule();
  }
  async webSocketError(ws: RoomSocket) {
    ws.close(1011, "Ошибка связи");
    await this.webSocketClose(ws);
  }
  async alarm() {
    const s = this.s;
    if (!s) return;
    const now = Date.now();
    if (now >= s.expiresAt) {
      for (const ws of this.ctx.getWebSockets())
        ws.close(1000, "Срок комнаты истёк");
      this.tokens = {};
      s.players = [];
      s.snapshot = null;
      await this.save();
      return;
    }
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment;
      if (now - a.seen > (a.id ? 40000 : 10000)) {
        ws.close(4000, "Нет связи");
        await this.webSocketClose(ws);
      }
    }
    if (s.phase === "countdown" && now >= s.startAt) {
      if (s.players.length === 2 && s.players.every((p) => p.connected)) {
        s.phase = "racing";
      } else pause(s, now);
      await this.save();
      this.state();
    }
    if (s.phase === "paused" && now - s.pausedAt > 120000) {
      clearRace(s);
      await this.save();
      this.state();
    }
    if (
      !this.ctx.getWebSockets().length &&
      ["lobby", "ready"].includes(s.phase)
    ) {
      s.expiresAt = Math.min(s.expiresAt, now + 10 * 60_000);
      await this.save();
      await this.ctx.storage.setAlarm(s.expiresAt);
    } else await this.schedule();
  }
}
