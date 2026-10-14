import { spawnSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
const env = { ...process.env, VITE_P2P: "true" };
for (const args of [
  ["node_modules/typescript/bin/tsc", "--noEmit"],
  ["node_modules/vite/bin/vite.js", "build"],
]) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit", env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
await writeFile("dist-pages/.nojekyll", "");
