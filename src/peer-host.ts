import {
  RoomEngine,
  type RoomContext,
  type RoomSocket,
  type VoiceConfig,
} from "../worker/room";

export const peerVoice: VoiceConfig = {
  STUN_URLS: "stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302",
  TURN_URLS: "",
  VOICE_RELAY_ONLY: "false",
};

// The browser organizer owns the same room engine used by Node and Cloudflare.
export class BrowserHost implements RoomContext {
  engine: RoomEngine;
  private links = new Set<RoomSocket>();
  private ready: Promise<unknown> = Promise.resolve();
  private queue: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;
  private lastPersist = 0;
  private saved: unknown;
  private joinTimes: number[] = [];
  storage = {
    get: async <T>(_key: string): Promise<T | undefined> =>
      this.saved as T | undefined,
    put: async (_key: string, value: unknown) => {
      if (this.disposed) return;
      this.saved = structuredClone(value);
      this.store.setItem("rally-host:" + this.code, JSON.stringify(value));
    },
    setAlarm: async (timestamp: number) => {
      if (this.disposed) return;
      clearTimeout(this.timer);
      this.timer = setTimeout(
        () => {
          void this.run(async () => {
            await this.engine.alarm();
            if (this.engine.s && Date.now() >= this.engine.s.expiresAt)
              this.stop();
          }).catch(() => this.stop());
        },
        Math.max(1, timestamp - Date.now()),
      );
    },
  };
  constructor(
    public code: string,
    private store: Storage = sessionStorage,
    restore = false,
  ) {
    if (restore) {
      const text = store.getItem("rally-host:" + code);
      if (text) {
        try {
          this.saved = JSON.parse(text);
        } catch {
          store.removeItem("rally-host:" + code);
        }
      }
    }
    this.engine = new RoomEngine(this, peerVoice);
  }
  blockConcurrencyWhile(callback: () => Promise<unknown>) {
    this.ready = callback();
  }
  getWebSockets() {
    return [...this.links];
  }
  acceptWebSocket(socket: RoomSocket) {
    this.links.add(socket);
  }
  remove(socket: RoomSocket) {
    this.links.delete(socket);
  }
  canJoin() {
    const now = Date.now();
    this.joinTimes = this.joinTimes.filter((time) => now - time < 60000);
    this.joinTimes.push(now);
    return this.joinTimes.length <= 30;
  }
  run<T>(callback: () => Promise<T>): Promise<T> {
    const next = this.queue
      .then(() => this.ready)
      .then(async () => {
        if (this.disposed) throw Error("Комната закрыта");
        const result = await callback();
        if (this.engine.s && Date.now() - this.lastPersist > 1000) {
          this.lastPersist = Date.now();
          await this.engine.save();
        }
        return result;
      });
    this.queue = next.catch(() => {});
    return next;
  }
  stop() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.timer);
    for (const socket of this.links)
      socket.close(
        1000,
        "Организатор закрыл комнату. Создайте новое приглашение.",
      );
    this.links.clear();
    this.store.removeItem("rally-host:" + this.code);
  }
}
