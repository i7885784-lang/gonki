import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const origin = (process.env.TEST_ORIGIN || "http://localhost:8787").replace(
  /\/$/,
  "",
);
const apiRequests = [];
await fs.mkdir("work/screenshots", { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROMIUM_PATH === "playwright"
      ? chromium.executablePath()
      : process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-fake-device-for-media-stream",
    "--enable-unsafe-swiftshader",
  ],
});
const driver = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  permissions: ["microphone"],
});
const nav = await browser.newContext({
  viewport: { width: 1024, height: 1366 },
  isMobile: true,
  hasTouch: true,
  permissions: ["microphone"],
});
for (const context of [driver, nav])
  await context.addInitScript(() => {
    const capture = navigator.mediaDevices.getUserMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      try {
        return await capture(constraints);
      } catch (error) {
        window.__mediaFailure = error.name;
        throw error;
      }
    };
    const Original = window.RTCPeerConnection;
    window.__peers = [];
    window.RTCPeerConnection = class extends Original {
      constructor(...args) {
        super(...args);
        window.__peers.push(this);
      }
    };
  });
const a = await driver.newPage(),
  b = await nav.newPage();
const errors = [];
for (const p of [a, b]) {
  p.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      apiRequests.push(request.url());
  });
  p.on("console", (m) => {
    if (m.type() === "error") console.log("console", m.text());
  });
  p.on("websocket", (ws) => {
    ws.on("framereceived", ({ payload }) => {
      try {
        const m = JSON.parse(String(payload));
        if (m.type === "error") console.log("SERVER ERROR", m.message);
        if (m.type === "signal")
          console.log(
            "signal received",
            p === a ? "driver" : "nav",
            m.data.description?.type ?? "candidate",
          );
      } catch {}
    });
  });
}
for (const p of [a, b]) p.on("pageerror", (e) => errors.push(e.message));
try {
  await a.goto(origin);
  await a.screenshot({ path: "work/screenshots/home.png" });
  await a.click("#create");
  await a.waitForFunction(() =>
    document.querySelector("#loading").textContent.includes("Машина готова"),
  );
  await a.fill("#player-name", "Руслан");
  await a.click("#name-form button");
  const link = await a.inputValue("#invite-link");
  assert.ok(link.startsWith(origin));
  await b.goto(link);
  await b.waitForSelector("#session:visible");
  await b.fill("#player-name", "Саша <друг>");
  await b.click("#name-form button");
  await a.waitForFunction(() =>
    document.querySelector("#players").textContent.includes("Саша <друг>"),
  );
  await b.click('[data-lobby-role="driver"]');
  await a.waitForFunction(
    () =>
      document
        .querySelector('[data-lobby-role="codriver"]')
        .getAttribute("aria-pressed") === "true",
  );
  await a.click("#random-roles");
  await a.click('[data-lobby-role="driver"]');

  await b.waitForFunction(() =>
    document.querySelector("#my-role").textContent.includes("Штурман"),
  );
  await a.screenshot({ path: "work/screenshots/lobby.png" });
  await a.click("#voice-enable");
  await b.click("#voice-enable");
  if (process.env.ALLOW_BLOCKED_WEBRTC === "1") {
    await a.waitForFunction(
      () =>
        document
          .querySelector("#voice-status")
          .textContent.includes("Без TURN"),
      {},
      { timeout: 20000 },
    );
    assert.equal(
      await a.evaluate(() => window.__peers.at(-1).localDescription.type),
      "offer",
    );
    assert.equal(
      await b.evaluate(() => window.__peers.at(-1).localDescription.type),
      "answer",
    );
    console.log(
      "ОГРАНИЧЕНИЕ: UDP запрещён политикой управляемого Chromium; проверены SDP и сообщение об отсутствии TURN, передача аудио не подтверждена.",
    );
  } else {
    for (const page of [a, b]) {
      let received = false;
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        received = await page.evaluate(async () => {
          const pc = window.__peers.at(-1);
          if (pc?.connectionState !== "connected") return false;
          const stats = await pc.getStats();
          return [...stats.values()].some(
            (s) =>
              s.type === "inbound-rtp" &&
              s.kind === "audio" &&
              s.bytesReceived > 0,
          );
        });
        if (received) break;
        await page.waitForTimeout(100);
      }
      assert.equal(
        received,
        true,
        `Нет входящего RTP: ${await page.textContent("#voice-status")}`,
      );
    }
    console.log(
      "Голос: подтверждён двусторонний RTP синтетических микрофонов в локальном браузере.",
    );
  }
  await a.click("#mute");
  assert.equal(
    await a.evaluate(() => window.__peers.at(-1).getSenders()[0].track.enabled),
    false,
  );
  await a.click("#mute");
  await a.click("#ready");
  await b.click("#ready");
  await a.click("#start");
  await a.waitForFunction(
    () => document.querySelector("#race-overlay").hidden,
    {},
    { timeout: 8000 },
  );
  await a.click("#road", { position: { x: 100, y: 100 } });
  await a.keyboard.down("w");
  await a.waitForFunction(
    () => Number(document.querySelector("#speed").textContent) > 10,
  );
  await a.keyboard.up("w");
  await b.waitForFunction(
    () => parseInt(document.querySelector("#nav-speed").textContent) > 10,
  );
  await b.click('[data-call="Тормози"]');
  await a.waitForFunction(
    () => document.querySelector("#quick-prompt").textContent === "Тормози",
  );
  await a.screenshot({ path: "work/screenshots/driver.png" });
  await b.screenshot({ path: "work/screenshots/tablet-portrait.png" });
  await b.setViewportSize({ width: 1366, height: 900 });
  await b.screenshot({ path: "work/screenshots/tablet-landscape.png" });
  await a.click("#recover");
  await a.click("#pause");
  await a.waitForFunction(() =>
    document.querySelector("#overlay-title").textContent.includes("Пауза"),
  );
  await b.reload();
  await b.waitForFunction(() =>
    document.querySelector("#overlay-title").textContent.includes("Пауза"),
  );
  await a
    .getByRole("button", { name: "Продолжить заезд", exact: true })
    .click();
  await b
    .getByRole("button", { name: "Продолжить заезд", exact: true })
    .click();
  await a.waitForFunction(
    () => document.querySelector("#race-overlay").hidden,
    {},
    { timeout: 7000 },
  );
  await a.click("#pause");
  await a.getByRole("button", { name: "В лобби", exact: true }).click();
  await a.waitForFunction(() => !document.querySelector("#lobby").hidden);
  // Deny microphone through a separate context, preserving independent browser permissions.
  await b.click("#leave");
  await b.waitForURL(origin + "/");
  const denied = await browser.newContext({ permissions: [] });
  const c = await denied.newPage();
  const permissions = await denied.newCDPSession(c);
  await permissions.send("Browser.setPermission", {
    permission: { name: "microphone" },
    setting: "denied",
    origin: new URL(origin).origin,
  });
  await c.goto(link);
  await c.click("#voice-enable");
  await c.waitForFunction(() =>
    document.querySelector("#voice-status").textContent.includes("запрещён"),
  );
  await c.click("#ready");
  await a.click("#ready");
  await a.waitForFunction(() => !document.querySelector("#start").disabled);
  await c.click("#leave");
  await a.click("#leave");
  await denied.close();
  assert.deepEqual(errors, []);
  if (process.env.TEST_P2P === "1")
    assert.deepEqual(
      apiRequests,
      [],
      "Статическая версия должна работать без API-сервера",
    );
  console.log(
    "PASS: два независимых браузера, приглашение, реальные физика и карта, SDP и управление микрофоном, команды, восстановление вкладки, отказ микрофона не мешает готовности; без критических ошибок.",
  );
} catch (e) {
  console.log("Original failure", e);
  for (const page of [a, b]) {
    console.log(
      "UI failure state",
      await page
        .evaluate(() => ({
          homeError: document.querySelector("#home-error")?.textContent,
          phase: document.querySelector("#phase-label")?.textContent,
          overlay: document.querySelector("#overlay-title")?.textContent,
          role: document.querySelector("#my-role")?.textContent,
          voice: document.querySelector("#voice-status")?.textContent,
          mediaFailure: window.__mediaFailure ?? null,
        }))
        .catch(() => "page unavailable"),
    );
  }
  await a.screenshot({ path: "work/screenshots/failure.png" });
  throw e;
} finally {
  await browser.close();
}
