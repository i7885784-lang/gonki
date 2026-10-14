import { chromium } from "playwright";
import assert from "node:assert/strict";
import { at, LENGTH, checkpoints } from "../shared/track.ts";
const origin = process.env.TEST_ORIGIN || "http://localhost:8792/gonki";
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH === "playwright"
      ? chromium.executablePath()
      : process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox", "--enable-unsafe-swiftshader"],
});
const host = await browser.newContext(),
  driver = await browser.newContext();
const h = await host.newPage(),
  d = await driver.newPage();
for (const page of [h, d])
  page.on("pageerror", (error) => console.log("P2P PAGE ERROR", error.message));
await driver.addInitScript(() => {
  // Keep browser animation running; only the protocol fixture sends snapshots.
  window.__channels = [];
  window.__messages = [];
  window.__acks = [];
  const Original = RTCPeerConnection;
  window.RTCPeerConnection = class extends Original {
    createDataChannel(...args) {
      const channel = super.createDataChannel(...args);
      window.__channels.push(channel);
      const transmit = channel.send.bind(channel);
      channel.send = (data) => {
        try {
          const packet = JSON.parse(
            typeof data === "string" ? data : new TextDecoder().decode(data),
          );
          if (
            packet.kind === "message" &&
            JSON.parse(packet.data).type === "snapshot" &&
            !window.__routeSending
          )
            return;
        } catch {}
        transmit(data);
      };
      channel.addEventListener("message", (event) => {
        try {
          const packet = JSON.parse(
            typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data),
          );
          if (packet.kind === "snapshot-ack") window.__acks.push(packet.seq);
          if (packet.kind === "event")
            window.__messages.push(JSON.parse(packet.data));
        } catch {}
      });
      return channel;
    }
  };
});
const send = (message) =>
  d.evaluate((message) => {
    window.__routeSending = true;
    try {
      window.__channels
        .find((channel) => channel.readyState === "open")
        .send(
          new TextEncoder().encode(
            JSON.stringify({ kind: "message", data: JSON.stringify(message) }),
          ),
        );
    } finally {
      window.__routeSending = false;
    }
  }, message);
const state = () =>
  d.evaluate(
    () =>
      window.__messages.findLast((message) => message.type === "state")?.state,
  );
let seq = 1000;
try {
  await h.goto(origin);
  await h.click("#create");
  await h.waitForSelector("#session:visible");
  await h.click('[data-lobby-role="codriver"]');
  await h.waitForFunction(
    () =>
      document
        .querySelector('[data-lobby-role="codriver"]')
        .getAttribute("aria-pressed") === "true",
  );
  const link = await h.inputValue("#invite-link");
  assert.ok(link.includes("/gonki/?room="));
  await d.goto(link);
  await d.waitForFunction(() =>
    document.querySelector("#loading").textContent.includes("Машина готова"),
  );
  const third = await browser.newPage();
  await third.goto(link);
  await third.waitForFunction(() =>
    document.querySelector("#home-error").textContent.includes("два игрока"),
  );
  await third.close();
  await h.click("#ready");
  await d.click("#ready");
  await h.click("#start");
  await d.waitForFunction(
    () =>
      window.__messages.findLast((message) => message.type === "state")?.state
        .phase === "racing",
  );
  const snapshot = async (s) => {
    const current = await state(),
      p = at(s);
    await send({
      type: "snapshot",
      seq: ++seq,
      epoch: current.epoch,
      p: { x: p.x, y: p.y + 0.7, z: p.z },
      q: { x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) },
      speed: 35,
    });
  };
  await snapshot(LENGTH);
  await d.waitForTimeout(100);
  assert.equal((await state()).checkpoint, 0);
  const reset = crypto.randomUUID();
  await send({ type: "reset", id: reset });
  await d.waitForFunction(
    () =>
      window.__messages.findLast((message) => message.type === "state")?.state
        .penalty === 5000,
  );
  await send({ type: "reset", id: reset });
  await d.waitForTimeout(100);
  assert.equal((await state()).resets, 1);
  // The organizer reloads; the real data channel must reconnect to restored state.
  await h.click("#nav-pause");
  await h.reload();
  await h.waitForFunction(() =>
    document.querySelector("#overlay-title").textContent.includes("Пауза"),
  );
  await d.waitForFunction(
    () =>
      window.__messages
        .findLast((message) => message.type === "state")
        ?.state.players.every((player) => player.connected) &&
      window.__channels.length >= 2 &&
      window.__channels.at(-1).readyState === "open",
    {},
    { timeout: 25000 },
  );
  await h
    .getByRole("button", { name: "Продолжить заезд", exact: true })
    .click();
  await d
    .getByRole("button", { name: "Продолжить заезд", exact: true })
    .click();
  await d.waitForFunction(
    () =>
      window.__messages.findLast((message) => message.type === "state")?.state
        .phase === "racing",
  );
  for (let s = 0; s < LENGTH && (await state()).phase !== "finished"; s += 5) {
    await snapshot(s);
    const sent = seq;
    await d.waitForFunction((sent) => window.__acks.includes(sent), sent);
    await d.waitForTimeout(70);
  }
  if ((await state()).phase !== "finished") await snapshot(LENGTH - 10);
  await d.waitForFunction(
    () =>
      window.__messages.findLast((message) => message.type === "state")?.state
        .phase === "finished",
  );
  const finished = await state();
  assert.equal(finished.checkpoint, checkpoints.length);
  assert.equal(finished.result, finished.elapsed + 5000);
  await h.getByRole("button", { name: "Ещё один заезд", exact: true }).click();
  await d.waitForFunction(
    () =>
      window.__messages.findLast((message) => message.type === "state")?.state
        .phase === "lobby",
  );
  await h.click("#leave");
  await d.waitForFunction(() =>
    document.body.textContent.includes("Организатор закрыл комнату"),
  );
  console.log(
    "PASS: настоящий WebRTC DataChannel, два места, роль организатора-штурмана, запрет телепорта, штраф без дублей, перезагрузка организатора, все 27 КТ, общий финиш, повтор и закрытие.",
  );
} catch (error) {
  console.log(
    "P2P route failure",
    await h.textContent("#home-error"),
    await d.textContent("#home-error"),
    await d.textContent("#loading"),
    await d.textContent("#my-role"),
    await d.evaluate(() => ({
      channels: window.__channels.map((channel) => ({
        label: channel.label,
        state: channel.readyState,
      })),
      messages: window.__messages.length,
    })),
  );
  await h.screenshot({ path: "work/screenshots/peer-route-host-failure.png" });
  await d.screenshot({
    path: "work/screenshots/peer-route-driver-failure.png",
  });
  throw error;
} finally {
  await browser.close();
}
