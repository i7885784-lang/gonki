import { DurableObject } from "cloudflare:workers";
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
interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  ASSETS: Fetcher;
  CREATE_LIMIT: RateLimit;
  JOIN_LIMIT: RateLimit;
  STUN_URLS: string;
  TURN_URLS: string;
  TURN_SECRET?: string;
  TURN_USERNAME?: string;
  TURN_CREDENTIAL?: string;
  VOICE_RELAY_ONLY: string;
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
const json = (v: unknown, status = 200) =>
  Response.json(v, { status, headers: { "Cache-Control": "no-store" } });
const err = (message: string, status = 400) => json({ error: message }, status);
const codePattern = /^[A-HJ-NP-Z2-9]{8}$/;
async function body(r: Request) {
  if (Number(r.headers.get("content-length")) > 4096) throw Error();
  const text = await r.text();
  if (text.length > 4096) throw Error();
  return JSON.parse(text);
}
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(req);
    if (req.headers.get("Origin") && req.headers.get("Origin") !== url.origin)
      return err("Запрос с другого сайта запрещён", 403);
    const ip = req.headers.get("CF-Connecting-IP") ?? "local";
    try {
      if (url.pathname === "/api/rooms" && req.method === "POST") {
        if (!(await env.CREATE_LIMIT.limit({ key: ip })).success)
          return err("Слишком много комнат. Подождите минуту.", 429);
        const data = await body(req);
        if (!["driver", "codriver"].includes(data.role))
          return err("Выберите роль");
        for (let i = 0; i < 4; i++) {
          const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
          const bytes = crypto.getRandomValues(new Uint8Array(8));
          const code = Array.from(bytes, (b) => alphabet[b % 32]).join("");
          const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
          const result = await stub.fetch(
            new Request("https://room/init", {
              method: "POST",
              body: JSON.stringify({ code, role: data.role }),
            }),
          );
          if (result.status !== 409) return result;
        }
        return err("Не удалось создать комнату", 503);
      }
      const match = url.pathname.match(
        /^\/api\/rooms\/([^/]+)\/(join|ws|ice)$/,
      );
      if (!match) return err("Адрес не найден", 404);
      const code = match[1].toUpperCase();
      if (!codePattern.test(code))
        return err("Код должен содержать 8 латинских букв или цифр");
      if (
        match[2] === "join" &&
        !(await env.JOIN_LIMIT.limit({ key: ip })).success
      )
        return err("Слишком много попыток. Подождите минуту.", 429);
      if (
        match[2] === "ws" &&
        !(await env.JOIN_LIMIT.limit({ key: ip + ":ws" })).success
      )
        return err("Слишком много подключений", 429);
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(
        new Request("https://room/" + match[2], req),
      );
    } catch {
      return err("Не удалось обработать запрос", 400);
    }
  },
};
export class Room extends DurableObject<Env> {
  s: RoomState | null = null;
  tokens: Record<string, string> = {};
  resetIds: string[] = [];
  lastReset = 0;
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
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
  send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {}
  }
  sockets() {
    return this.ctx
      .getWebSockets()
      .filter((ws) => (ws.deserializeAttachment() as Attachment)?.id);
  }
  broadcast(msg: ServerMessage, except?: WebSocket) {
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
    if (path === "/ws" && req.headers.get("Upgrade") === "websocket") {
      if (this.ctx.getWebSockets().length >= 6)
        return err("Слишком много подключений", 429);
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment({
        seen: now,
        window: now,
        count: 0,
        lastMove: 0,
        lastCall: 0,
      } satisfies Attachment);
      await this.schedule();
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return err("Адрес не найден", 404);
  }
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
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
    if (m.type === "ready" && ["lobby", "ready"].includes(s.phase)) {
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
  async webSocketClose(ws: WebSocket) {
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
  async webSocketError(ws: WebSocket) {
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
