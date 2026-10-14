import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
const node = process.argv.includes("--node");
const origin = node ? "http://localhost:8788" : "http://localhost:8787";
const testEnv = {
  ...process.env,
  TEST_ORIGIN: origin,
  PORT: node ? "8788" : "8787",
};
const server = spawn(
  node ? "npm" : "npx",
  node ? ["start"] : ["wrangler", "dev", "--ip", "127.0.0.1"],
  {
    stdio: "inherit",
    env: { ...testEnv, WRANGLER_SEND_METRICS: "false" },
  },
);
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      ready = (await fetch(origin)).ok;
    } catch {}
    if (ready) break;
    await delay(1000);
  }
  if (!ready) throw Error("Сервер не запустился");
  for (const command of ["test:integration", "test:browser"])
    await new Promise((resolve, reject) => {
      const child = spawn("npm", ["run", command], {
        stdio: "inherit",
        env: testEnv,
      });
      child.on("exit", (code) =>
        code === 0 ? resolve() : reject(Error(command)),
      );
    });
} finally {
  server.kill("SIGTERM");
}
