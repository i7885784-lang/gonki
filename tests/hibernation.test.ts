import { it, expect, vi } from "vitest";
vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      public ctx: any,
      public env: any,
    ) {}
  },
}));
import { Room } from "../worker/index";
import { initial } from "../worker/model";
function context(saved: any, sockets: any[]) {
  let ready: Promise<unknown> = Promise.resolve();
  const storage = {
    get: async () => structuredClone(saved),
    put: vi.fn(async () => {}),
    setAlarm: vi.fn(async () => {}),
  };
  return {
    ctx: {
      storage,
      getWebSockets: () => sockets,
      blockConcurrencyWhile: (fn: () => Promise<unknown>) => {
        ready = fn();
      },
    },
    ready: () => ready,
    storage,
  };
}
it("гибернация восстанавливает последний attachment без записи каждого снимка", async () => {
  const s = initial("ABCDEFGH");
  s.phase = "racing";
  s.epoch = 2;
  s.players = [
    { id: "a", role: "driver", connected: true, ready: true, resume: false },
  ];
  const snapshot = {
    seq: 20,
    epoch: 2,
    p: { x: 0, y: 1, z: 50 },
    q: { x: 0, y: 0, z: 0, w: 1 },
    speed: 12,
    progress: 50,
    checkpoint: 0,
    time: 4000,
  };
  const c = context({ s, tokens: {}, resetIds: [], lastReset: 0 }, [
    { deserializeAttachment: () => ({ id: "a", snapshot }) },
  ]);
  const room = new Room(c.ctx as any, {} as any);
  await c.ready();
  expect(room.s?.snapshot?.seq).toBe(20);
  expect(room.s?.progress).toBe(50);
  expect(room.s?.phase).toBe("racing");
  expect(c.storage.put).not.toHaveBeenCalled();
});
it("полный рестарт без сокетов снимает online и безопасно ставит гонку на паузу", async () => {
  const s = initial("ABCDEFGH");
  s.phase = "racing";
  s.players = [
    { id: "a", role: "driver", connected: true, ready: true, resume: false },
  ];
  const c = context({ s, tokens: {}, resetIds: [], lastReset: 0 }, []);
  const room = new Room(c.ctx as any, {} as any);
  await c.ready();
  expect(room.s?.phase).toBe("paused");
  expect(room.s?.players[0].connected).toBe(false);
  expect(room.s?.players[0].ready).toBe(false);
  expect(c.storage.put).toHaveBeenCalledOnce();
});
