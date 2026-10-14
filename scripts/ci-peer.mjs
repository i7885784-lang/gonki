import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { spawn } from "node:child_process";

const publicBroker = process.argv.includes("--public-broker");
const serveOnly = process.argv.includes("--serve-only");
const broker = publicBroker
  ? undefined
  : spawn(process.execPath, ["scripts/peer-server.mjs"], { stdio: "inherit" });
const root = resolve("dist-pages");
const server = createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/gonki") {
    res.writeHead(308, { Location: "/gonki/" });
    res.end();
    return;
  }
  if (!url.pathname.startsWith("/gonki/")) {
    res.writeHead(404);
    res.end();
    return;
  }
  const path = resolve(root, "." + url.pathname.slice("/gonki".length));
  if (path !== root && !path.startsWith(root + sep)) {
    res.writeHead(404);
    res.end();
    return;
  }
  try {
    const file = url.pathname.endsWith("/")
      ? resolve(path, "index.html")
      : path;
    const data = await readFile(file);
    res.writeHead(200, {
      "Content-Type":
        {
          ".js": "text/javascript",
          ".css": "text/css",
          ".html": "text/html",
          ".svg": "image/svg+xml",
        }[extname(file)] || "application/octet-stream",
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
const run = (args, env) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: "inherit", env });
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(Error(`Проверка завершилась: ${code}`)),
    );
  });
try {
  await run(["scripts/build-pages.mjs"], {
    ...process.env,
    VITE_PEER_HOST: publicBroker ? "" : "localhost",
    VITE_PEER_PORT: "9000",
  });
  await new Promise((resolve) => server.listen(8792, "127.0.0.1", resolve));
  if (serveOnly) {
    console.log("Статическая версия: http://localhost:8792/gonki/");
    await new Promise((resolve) => {
      process.once("SIGTERM", resolve);
      process.once("SIGINT", resolve);
    });
  } else {
    await run(["tests/browser.mjs"], {
      ...process.env,
      TEST_ORIGIN: "http://localhost:8792/gonki",
      TEST_P2P: "1",
    });
    await run(["--import", "tsx", "tests/peer-route.mjs"], {
      ...process.env,
      TEST_ORIGIN: "http://localhost:8792/gonki",
    });
  }
} finally {
  server.close();
  broker?.kill("SIGTERM");
}
