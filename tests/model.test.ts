import { describe, it, expect } from "vitest";
import {
  initial,
  canStart,
  clearRace,
  pause,
  validateMovement,
  advance,
} from "../worker/model";
import {
  at,
  checkpoints,
  LENGTH,
  project,
  roadStrip,
  route,
} from "../shared/track";
import { messageSchema, type Snapshot } from "../shared/protocol";
import { CarPhysics } from "../src/physics";
describe("авторитетная модель комнаты", () => {
  it("старт только организатором с двумя готовыми подключёнными ролями", () => {
    const s = initial("ABCDEFGH");
    const a = {
        id: "a",
        role: "driver" as const,
        ready: true,
        connected: true,
        resume: false,
      },
      b = { ...a, id: "b", role: "codriver" as const };
    s.host = "a";
    s.players = [a];
    expect(canStart(s, a)).toBe(false);
    s.players.push(b);
    expect(canStart(s, a)).toBe(true);
    expect(canStart(s, b)).toBe(false);
    b.connected = false;
    expect(canStart(s, a)).toBe(false);
  });
  it("пауза сохраняет время, новый заезд очищает прогресс и готовность", () => {
    const s = initial("ABCDEFGH");
    s.phase = "racing";
    s.startAt = 1000;
    s.penalty = 5000;
    s.checkpoint = 3;
    pause(s, 3000);
    expect(s.elapsed).toBe(2000);
    expect(s.phase).toBe("paused");
    pause(s, 6000);
    expect(s.elapsed).toBe(2000);
    clearRace(s);
    expect(s.phase).toBe("lobby");
    expect(s.checkpoint).toBe(0);
    expect(s.penalty).toBe(0);
  });
  it("не принимает телепорт, старую эпоху и повторную последовательность", () => {
    const s = initial("ABCDEFGH");
    s.phase = "racing";
    const snap: Snapshot = {
      seq: 1,
      epoch: 0,
      p: { x: 0, y: 1, z: 2 },
      q: { x: 0, y: 0, z: 0, w: 1 },
      speed: 10,
      progress: 0,
      checkpoint: 0,
      time: 1,
    };
    expect(validateMovement(s, null, snap, 0.1)).not.toBeNull();
    expect(validateMovement(s, snap, snap, 0.1)).toBeNull();
    expect(validateMovement(s, null, { ...snap, epoch: 1 }, 0.1)).toBeNull();
    expect(
      validateMovement(s, null, { ...snap, p: at(LENGTH) }, 0.1),
    ).toBeNull();
  });
  it("финиш требует все контрольные точки по порядку", () => {
    const s = initial("ABCDEFGH");
    expect(advance(s, { ...at(LENGTH), distance: 0 })).toBe(false);
    expect(s.checkpoint).toBe(0);
    for (const cp of checkpoints) advance(s, { ...cp, distance: 0 });
    expect(s.checkpoint).toBe(checkpoints.length);
  });
  it("валидирует роль сообщения, размер и конечные числа", () => {
    expect(
      messageSchema.safeParse({ type: "call", call: "Тормози" }).success,
    ).toBe(true);
    expect(
      messageSchema.safeParse({ type: "call", call: "hack" }).success,
    ).toBe(false);
    expect(
      messageSchema.safeParse({ type: "snapshot", seq: NaN }).success,
    ).toBe(false);
  });
});
describe("трасса и физика", () => {
  it("не перескакивает между близкими ветвями шпильки", () => {
    const a = at(1600),
      b = at(2000);
    expect(Math.abs(project(b, a.s).s - a.s)).toBeLessThan(90);
    expect(LENGTH).toBeGreaterThan(2800);
    const mesh = roadStrip(6);
    expect(mesh.vertices.length).toBe((route.length + 2) * 6);
    expect([...mesh.vertices].every(Number.isFinite)).toBe(true);
  });
  it("реальная четырёхколёсная подвеска разгоняет и тормозит шасси", async () => {
    const car = await CarPhysics.create();
    const zero = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    for (let i = 0; i < 120; i++) car.step(zero);
    expect(car.body.translation().y).toBeGreaterThan(0.2);
    expect(car.vehicle.numWheels()).toBe(4);
    for (let i = 0; i < 180; i++) car.step({ ...zero, throttle: 1 });
    const speed = car.speed;
    console.log("physical speed / position", speed, car.body.translation());
    expect(speed).toBeGreaterThan(8);
    expect(car.body.translation().z).toBeGreaterThan(10);
    for (let i = 0; i < 90; i++) car.step({ ...zero, brake: 1 });
    expect(Math.abs(car.speed)).toBeLessThan(speed * 0.5);
    expect(car.body.translation().y).toBeGreaterThan(0.1);
    car.dispose();
  }, 15000);
});
