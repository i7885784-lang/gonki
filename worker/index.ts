import { DurableObject } from "cloudflare:workers";
import { RoomEngine, err, type RoomContext } from "./room";
import type { RouterEnv } from "./router";
export { default } from "./router";

// Cloudflare supplies durable storage, alarms and hibernating sockets.
// Node/Render uses the same room rules through an in-memory context.
export class Room extends DurableObject<RouterEnv> {
  private engine: RoomEngine;
  constructor(ctx: DurableObjectState, env: RouterEnv) {
    super(ctx, env);
    this.engine = new RoomEngine(ctx as unknown as RoomContext, env);
  }
  get s() {
    return this.engine.s;
  }
  async fetch(req: Request) {
    if (
      new URL(req.url).pathname === "/ws" &&
      req.headers.get("Upgrade") === "websocket"
    ) {
      if (!this.engine.s) return err("Комната не найдена", 404);
      if (Date.now() > this.engine.s.expiresAt)
        return err("Срок комнаты истёк. Создайте новую.", 410);
      if (this.ctx.getWebSockets().length >= 6)
        return err("Слишком много подключений", 429);
      const pair = new WebSocketPair();
      await this.engine.acceptSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return this.engine.fetch(req);
  }
  webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    return this.engine.webSocketMessage(ws, raw);
  }
  webSocketClose(ws: WebSocket) {
    return this.engine.webSocketClose(ws);
  }
  webSocketError(ws: WebSocket) {
    return this.engine.webSocketError(ws);
  }
  alarm() {
    return this.engine.alarm();
  }
}
