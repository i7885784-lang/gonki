import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { WebSocketServer, WebSocket as NativeSocket } from "ws";
import router, { type RouterEnv } from "../worker/router";
import {
  RoomEngine,
  codePattern,
  err,
  type RoomContext,
  type RoomSocket,
  type VoiceConfig,
} from "../worker/room";

const port = Number(process.env.PORT || 8787);
const assetsRoot = resolve("dist");
const voice: VoiceConfig = {
  STUN_URLS: process.env.STUN_URLS ?? "stun:stun.l.google.com:19302",
  TURN_URLS: process.env.TURN_URLS ?? "",
  TURN_SECRET: process.env.TURN_SECRET,
  TURN_USERNAME: process.env.TURN_USERNAME,
  TURN_CREDENTIAL: process.env.TURN_CREDENTIAL,
  VOICE_RELAY_ONLY: process.env.VOICE_RELAY_ONLY ?? "false",
};
const rooms = new Map<string, NodeRoom>();
const expired = new Map<string, number>();
const MAX_ROOMS = 500;
const tombstoneCleanup = setInterval(() => {
  for (const [code, until] of expired)
    if (until < Date.now()) expired.delete(code);
}, 60000);
tombstoneCleanup.unref();

// One queue per room keeps async HTTP requests, sockets and alarms ordered.
class NodeRoom implements RoomContext {
  engine: RoomEngine;
  private sockets = new Set<NodeSocket>();
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private ready: Promise<unknown> = Promise.resolve();
  private disposed = false;
  storage = {
    get: async <T>(_key: string): Promise<T | undefined> => undefined,
    put: async (_key: string, _value: unknown): Promise<void> => {},
    setAlarm: async (timestamp: number) => {
      if (this.disposed) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(
        () => {
          void this.run(async () => {
            await this.engine.alarm();
            if (this.engine.s && Date.now() >= this.engine.s.expiresAt) {
              clearTimeout(this.timer);
              this.disposed = true;
              rooms.delete(this.code);
              expired.set(this.code, Date.now() + 10 * 60000);
            }
          }).catch(report);
        },
        Math.max(1, timestamp - Date.now()),
      );
      this.timer.unref();
    },
  };
  constructor(public code: string) {
    this.engine = new RoomEngine(this, voice);
  }
  blockConcurrencyWhile(callback: () => Promise<unknown>) {
    this.ready = callback();
  }
  getWebSockets() {
    return [...this.sockets];
  }
  acceptWebSocket(socket: RoomSocket) {
    this.sockets.add(socket as NodeSocket);
  }
  remove(socket: NodeSocket) {
    this.sockets.delete(socket);
  }
  run<T>(callback: () => Promise<T>): Promise<T> {
    const next = this.queue.then(() => this.ready).then(callback);
    this.queue = next.catch(() => {});
    return next;
  }
  close() {
    this.disposed = true;
    clearTimeout(this.timer);
    for (const socket of this.sockets)
      socket.close(1012, "Сервер перезапускается");
  }
}
class NodeSocket implements RoomSocket {
  private attachment: unknown;
  constructor(public socket: NativeSocket) {}
  send(data: string) {
    this.socket.send(data);
  }
  close(code = 1000, reason = "") {
    this.socket.close(code, reason);
  }
  serializeAttachment(value: unknown) {
    this.attachment = structuredClone(value);
  }
  deserializeAttachment() {
    return structuredClone(this.attachment);
  }
}
function report(error: unknown) {
  // Do not log bodies, authentication tokens or WebRTC credentials.
  console.error(
    "Ошибка сервера:",
    error instanceof Error ? error.name : "UnknownError",
  );
}
function rateLimit(max: number) {
  const windows = new Map<string, { until: number; count: number }>();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, window] of windows)
      if (window.until <= now) windows.delete(key);
  }, 60000);
  cleanup.unref();
  return {
    async limit({ key }: { key: string }) {
      const now = Date.now();
      let window = windows.get(key);
      if (!window || window.until <= now) {
        if (windows.size >= 10000) return { success: false };
        window = { until: now + 60000, count: 0 };
        windows.set(key, window);
      }
      return { success: ++window.count <= max };
    },
  };
}
const env: RouterEnv = {
  ...voice,
  CREATE_LIMIT: rateLimit(5),
  JOIN_LIMIT: rateLimit(30),
  ASSETS: { fetch: async () => err("Адрес не найден", 404) },
  ROOMS: {
    idFromName: (code) => code,
    get: (code: string) => ({
      async fetch(request: Request) {
        let room = rooms.get(code);
        if (!room) {
          if (expired.has(code))
            return err(
              "Срок комнаты истёк. Создайте новую.",
              new URL(request.url).pathname === "/init" ? 409 : 410,
            );
          if (new URL(request.url).pathname !== "/init")
            return err("Комната не найдена", 404);
          if (rooms.size >= MAX_ROOMS)
            return err("Сервер занят. Попробуйте позже.", 503);
          room = new NodeRoom(code);
          rooms.set(code, room);
        }
        return room.run(() => room!.engine.fetch(request));
      },
    }),
  },
};
function requestUrl(req: IncomingMessage) {
  const scheme = process.env.RENDER === "true" ? "https" : "http";
  return new URL(
    req.url || "/",
    `${scheme}://${req.headers.host || "localhost"}`,
  );
}
function ip(req: IncomingMessage) {
  // Render's reverse proxy is trusted only in Render's own runtime.
  const forwarded = req.headers["x-forwarded-for"];
  return process.env.RENDER === "true" && typeof forwarded === "string"
    ? forwarded.split(",").at(-1)!.trim()
    : req.socket.remoteAddress || "local";
}
function headers(req: IncomingMessage) {
  const result = new Headers();
  for (const [key, value] of Object.entries(req.headers))
    if (value !== undefined)
      result.set(key, Array.isArray(value) ? value.join(",") : value);
  result.set("CF-Connecting-IP", ip(req));
  return result;
}
async function respond(res: ServerResponse, response: Response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}
const contentTypes: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
};
async function assets(
  pathname: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  if (!["GET", "HEAD"].includes(req.method || ""))
    return respond(res, err("Метод не поддерживается", 405));
  const path = resolve(assetsRoot, "." + decodeURIComponent(pathname));
  if (path !== assetsRoot && !path.startsWith(assetsRoot + sep))
    return respond(res, err("Адрес не найден", 404));
  let file = path;
  try {
    if (!(await stat(file)).isFile()) file = resolve(assetsRoot, "index.html");
  } catch {
    if (extname(pathname)) return respond(res, err("Файл не найден", 404));
    file = resolve(assetsRoot, "index.html");
  }
  const data = await readFile(file);
  res.writeHead(200, {
    "Content-Type": contentTypes[extname(file)] || "application/octet-stream",
    "Content-Length": data.length,
    "Cache-Control": file.includes(sep + "assets" + sep)
      ? "public, max-age=31536000, immutable"
      : "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(req.method === "HEAD" ? undefined : data);
}
const server = createServer(async (req, res) => {
  try {
    const url = requestUrl(req);
    if (url.pathname === "/healthz")
      return respond(res, Response.json({ ok: true }));
    if (!url.pathname.startsWith("/api/"))
      return await assets(url.pathname, req, res);
    let data = Buffer.alloc(0);
    for await (const chunk of req.iterator({ destroyOnReturn: false })) {
      if (data.length + chunk.length > 4096) {
        req.resume();
        return await respond(res, err("Слишком большой запрос", 413));
      }
      data = Buffer.concat([data, chunk]);
    }
    const request = new Request(url, {
      method: req.method,
      headers: headers(req),
      body: ["GET", "HEAD"].includes(req.method || "") ? undefined : data,
    });
    await respond(res, await router.fetch(request, env));
  } catch (error) {
    report(error);
    if (!res.headersSent)
      await respond(res, err("Не удалось обработать запрос", 400));
    else res.end();
  }
});
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 24000,
  perMessageDeflate: false,
});
server.on("upgrade", (req, socket, head) => {
  void (async () => {
    const reject = (status: number, message: string) => {
      const data = JSON.stringify({ error: message });
      socket.end(
        `HTTP/1.1 ${status} Error\r\nConnection: close\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(data)}\r\n\r\n${data}`,
      );
    };
    const url = requestUrl(req);
    if (req.headers.origin && req.headers.origin !== url.origin)
      return reject(403, "Запрос с другого сайта запрещён");
    const match = url.pathname.match(/^\/api\/rooms\/([^/]+)\/ws$/);
    if (!match || !codePattern.test(match[1].toUpperCase()))
      return reject(404, "Адрес не найден");
    if (!(await env.JOIN_LIMIT.limit({ key: ip(req) + ":ws" })).success)
      return reject(429, "Слишком много подключений");
    const room = rooms.get(match[1].toUpperCase());
    if (!room)
      return expired.has(match[1].toUpperCase())
        ? reject(410, "Срок комнаты истёк")
        : reject(404, "Комната не найдена");
    await room.run(async () => {
      if (!room.engine.s || Date.now() >= room.engine.s.expiresAt)
        return reject(410, "Срок комнаты истёк");
      if (room.getWebSockets().length >= 6)
        return reject(429, "Слишком много подключений");
      wss.handleUpgrade(req, socket, head, (native) => {
        const wrapped = new NodeSocket(native);
        // Attach synchronously before the first auth message can arrive.
        void room.engine.acceptSocket(wrapped).catch(report);
        native.on("message", (data, binary) => {
          void room
            .run(() =>
              room.engine.webSocketMessage(
                wrapped,
                binary ? new ArrayBuffer(0) : data.toString(),
              ),
            )
            .catch(() => {
              native.close(1011, "Ошибка связи");
            });
        });
        native.on("close", () => {
          room.remove(wrapped);
          void room
            .run(() => room.engine.webSocketClose(wrapped))
            .catch(report);
        });
        native.on("error", () => native.close(1011, "Ошибка связи"));
      });
    });
  })().catch(() => socket.destroy());
});
server.listen(port, "0.0.0.0", () =>
  console.log(
    `Ралли вместе: сервер запущен на порту ${(server.address() as { port: number }).port}`,
  ),
);
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    for (const room of rooms.values()) room.close();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  });
