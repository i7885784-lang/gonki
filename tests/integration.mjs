import assert from "node:assert/strict";
import { WebSocket } from "ws";

const { at, checkpoints, LENGTH } = await import("../shared/track.ts");
const origin = process.env.TEST_ORIGIN || "http://localhost:8787";
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
async function request(path, data) {
  const r = await fetch(origin + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return { status: r.status, ...(await r.json()) };
}
async function client(room) {
  const ws = new WebSocket(
    origin.replace(/^http/, "ws") + `/api/rooms/${room.code}/ws`,
  );
  const c = {
    ws,
    messages: [],
    state: null,
    send: (m) => ws.send(JSON.stringify(m)),
  };
  ws.on("message", (data) => {
    const m = JSON.parse(data);
    c.messages.push(m);
    if (m.type === "state") c.state = m.state;
  });
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  c.send({ type: "auth", token: room.token });
  await until(() => c.state);
  c.heartbeat = setInterval(() => {
    if (ws.readyState === 1) c.send({ type: "ping" });
  }, 10000);
  ws.on("close", () => clearInterval(c.heartbeat));
  return c;
}
async function until(f, timeout = 7000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (f()) return;
    await delay(25);
  }
  throw Error("Превышено время ожидания");
}
const a = await request("/api/rooms", { role: "driver" });
assert.equal(a.status, 200);
const b = await request(`/api/rooms/${a.code}/join`, {});
assert.equal(b.status, 200);
const full = await request(`/api/rooms/${a.code}/join`, {});
assert.equal(full.status, 409);
const unknown = await request("/api/rooms/ZZZZZZZZ/join", {});
assert.equal(unknown.status, 404);
const invalid = await request("/api/rooms/123/join", {});
assert.equal(invalid.status, 400);
const d = await client(a);
let n = await client(b);
await until(() => d.state.players.every((p) => p.connected));
assert.equal(d.state.players.find((p) => p.id === a.id).role, "driver");
assert.equal(n.state.players.find((p) => p.id === b.id).role, "codriver");
n.send({ type: "start" });
await delay(70);
assert.equal(d.state.phase, "lobby");
d.send({ type: "swap" });
await until(() => n.state.swap === a.id);
n.send({ type: "swap" });
await until(() => d.state.players[0].role === "codriver");
d.send({ type: "swap" });
await until(() => n.state.swap === a.id);
n.send({ type: "swap" });
await until(() => d.state.players[0].role === "driver");
d.send({ type: "ready", value: true });
n.send({ type: "ready", value: true });
await until(() => d.state.phase === "ready");
d.send({ type: "start" });
await until(() => n.state.phase === "countdown");
assert.equal(d.state.startAt, n.state.startAt);
await until(() => d.state.phase === "racing");
let seq = 0;
const snapshot = (s, owner = d) => {
  const p = at(s);
  owner.send({
    type: "snapshot",
    seq: ++seq,
    epoch: d.state.epoch,
    p: { x: p.x, y: p.y + 0.7, z: p.z },
    q: { x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) },
    speed: 35,
  });
  return seq;
};
snapshot(3, n);
await delay(80);
assert.equal(n.messages.filter((m) => m.type === "snapshot").length, 0);
snapshot(3);
await until(() => n.messages.some((m) => m.type === "snapshot"));
snapshot(LENGTH);
await delay(80);
assert.equal(d.state.phase, "racing");
assert.equal(d.state.checkpoint, 0);
n.send({ type: "call", call: "Тормози" });
await until(() => d.messages.some((m) => m.type === "call"));
const resetId = crypto.randomUUID();
d.send({ type: "reset", id: resetId });
await until(() => n.state.penalty === 5000);
d.send({ type: "reset", id: resetId });
await delay(80);
assert.equal(n.state.penalty, 5000);
assert.equal(n.state.resets, 1);
// Настоящий сигнал проходит только сокету второго участника.
d.send({
  type: "signal",
  data: { description: { type: "offer", sdp: "test-signaling" } },
});
await until(() => n.messages.some((m) => m.type === "signal"));
assert.equal(
  d.messages.some((m) => m.type === "signal"),
  false,
);
n.ws.close();
await until(() => d.state.phase === "paused");
const resumed = await request(`/api/rooms/${a.code}/join`, { token: b.token });
assert.equal(resumed.id, b.id);
n = await client(resumed);
await until(() => d.state.players.every((p) => p.connected));
d.send({ type: "resume" });
await delay(80);
assert.equal(d.state.phase, "paused");
n.send({ type: "resume" });
await until(() => d.state.phase === "racing");
// Реальные WebSocket-снимки проходят тот же валидатор. Это проверка протокола, не физический проезд.
for (let s = 0; s < LENGTH && n.state.phase !== "finished"; s += 5) {
  const sent = snapshot(s);
  // Не накапливаем неподтверждённые координаты при задержке runner/сети.
  // Прогресс тестового водителя продвигается только после реального получения штурманом.
  await until(() =>
    n.messages.some((m) => m.type === "snapshot" && m.snapshot.seq === sent),
  );
  await delay(70);
}
if (n.state.phase !== "finished") snapshot(LENGTH - 10);
await until(() => n.state.phase === "finished");
assert.equal(d.state.checkpoint, checkpoints.length);
assert.equal(d.state.result, n.state.result);
assert.equal(d.state.result, d.state.elapsed + 5000);
d.send({ type: "start" });
await delay(50);
assert.equal(n.state.phase, "finished");
d.send({ type: "restart" });
await until(() => n.state.phase === "lobby");
assert.equal(n.state.penalty, 0);
assert.equal(n.state.checkpoint, 0);
assert.ok(n.state.best > 0);
n.send({ type: "leave" });
await until(() => d.state.players.length === 1);
d.send({ type: "leave" });
await delay(200);
const expired = await request(`/api/rooms/${a.code}/join`, {});
assert.equal(expired.status, 410);
d.ws.close();
n.ws.close();
console.log(
  "PASS: реальные комнаты, код, две роли, переполнение, согласие на смену, отсчёт, роль отправителя, снимки, запрет телепорта, команды, штраф без дублей, сигналинг, переподключение, все КТ, общий финиш, повтор и закрытие.",
);
