import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import { WebSocket } from "ws";

const server = spawn(process.execPath, ["build-server/index.mjs"], {
  env: { ...process.env, PORT: "0", RENDER: "true" },
  stdio: ["ignore", "pipe", "inherit"],
});
try {
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(Error("Node-сервер не запустился")),
      10000,
    );
    server.once("exit", () => {
      clearTimeout(timeout);
      reject(Error("Node-сервер завершился"));
    });
    server.stdout.on("data", (data) => {
      const match = data.toString().match(/порту (\d+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
  });
  const origin = `http://localhost:${port}`;
  const publicOrigin = `https://localhost:${port}`;
  const api = (path, body, headers = {}) =>
    fetch(origin + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: publicOrigin,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  assert.equal((await fetch(origin + "/healthz")).status, 200);
  const home = await fetch(origin + "/");
  assert.match(home.headers.get("content-type"), /text\/html/);
  const html = await home.text();
  const script = html.match(/src="([^"]+\.js)"/)[1];
  const asset = await fetch(new URL(script, origin + "/"));
  assert.match(asset.headers.get("content-type"), /javascript/);
  assert.match(asset.headers.get("cache-control"), /immutable/);
  assert.equal((await fetch(origin + "/package.json")).status, 404);
  assert.equal((await fetch(origin + "/%2e%2e%2fpackage.json")).status, 404);
  assert.equal(
    (
      await api(
        "/api/rooms",
        { role: "driver" },
        { Origin: "https://another-site.example" },
      )
    ).status,
    403,
  );
  assert.equal(
    (await api("/api/rooms", { role: "driver", padding: "a".repeat(5000) }))
      .status,
    413,
  );
  // Chunked bodies must also be bounded without breaking the HTTP response.
  const chunked = await new Promise((resolve, reject) => {
    const req = httpRequest(
      origin + "/api/rooms",
      { method: "POST", headers: { Origin: publicOrigin } },
      (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      },
    );
    req.on("error", reject);
    req.write("a".repeat(5000));
    req.end();
  });
  assert.equal(chunked, 413);
  const room = await (await api("/api/rooms", { role: "driver" })).json();
  const joined = await Promise.all(
    Array.from({ length: 3 }, () => api(`/api/rooms/${room.code}/join`, {})),
  );
  assert.deepEqual(joined.map((r) => r.status).sort(), [200, 409, 409]);
  const ice = await fetch(origin + `/api/rooms/${room.code}/ice`, {
    headers: { Origin: publicOrigin, Authorization: `Bearer ${room.token}` },
  });
  assert.equal(ice.status, 200);
  assert.ok((await ice.json()).iceServers.length > 0);
  assert.equal(
    (await fetch(origin + `/api/rooms/${room.code}/ice`)).status,
    401,
  );
  const wsUrl = origin.replace("http:", "ws:") + `/api/rooms/${room.code}/ws`;
  const refused = await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { origin: "https://another-site.example" });
    ws.on("unexpected-response", (_, res) => {
      res.resume();
      resolve(res.statusCode);
    });
    ws.on("open", () => {
      ws.close();
      reject(Error("Чужой Origin принят"));
    });
    ws.on("error", () => {});
  });
  assert.equal(refused, 403);
  const unauthenticated = await new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { origin: publicOrigin });
    ws.on("open", () =>
      ws.send(JSON.stringify({ type: "auth", token: crypto.randomUUID() })),
    );
    ws.on("close", (code) => resolve(code));
    ws.on("error", reject);
  });
  assert.equal(unauthenticated, 1008);
  // Client-supplied Cloudflare headers do not bypass the Node IP rate limit.
  for (let i = 0; i < 4; i++)
    assert.equal((await api("/api/rooms", { role: "driver" })).status, 200);
  assert.equal(
    (
      await api(
        "/api/rooms",
        { role: "driver" },
        { "CF-Connecting-IP": "203.0.113.10" },
      )
    ).status,
    429,
  );
  console.log(
    "PASS: Node/Render HTTPS origin за прокси, assets, ограничение тела и IP, конкурентный вход, авторизация ICE/WS и запрет чужого сайта.",
  );
} finally {
  server.kill("SIGTERM");
}
