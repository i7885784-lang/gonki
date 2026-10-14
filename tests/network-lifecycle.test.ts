import { afterEach, expect, it, vi } from "vitest";

const transports = vi.hoisted(() => [] as any[]);
vi.mock("../src/peer-transport", () => ({
  PeerTransport: class {
    enter = vi.fn(async () => ({
      code: "ABCDEFGH",
      token: "token",
      id: "player",
    }));
    connect = vi.fn(async () => this.socket);
    stop = vi.fn();
    socket = {
      readyState: 1,
      onopen: null,
      onmessage: null,
      onclose: null,
      send: vi.fn(),
      close: vi.fn(),
    };
    constructor() {
      transports.push(this);
    }
  },
}));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  transports.length = 0;
});
it("новое приглашение отменяет переподключение предыдущей комнаты", async () => {
  vi.resetModules();
  vi.stubEnv("VITE_P2P", "true");
  vi.useFakeTimers();
  vi.stubGlobal("window", globalThis);
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: () => {} });
  vi.stubGlobal("history", { replaceState: () => {} });
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  const { Network } = await import("../src/network");
  const net = new Network();
  await net.enter("driver");
  await vi.advanceTimersByTimeAsync(0);
  const old = transports[0];
  old.socket.onclose({ code: 4000, reason: "network lost" });
  await net.enter(undefined, "BCDEFGHJ");
  await vi.advanceTimersByTimeAsync(1000);
  expect(old.stop).toHaveBeenCalled();
  expect(old.socket.onclose).toBeNull();
  expect(transports[1].connect).toHaveBeenCalledTimes(1);
});
