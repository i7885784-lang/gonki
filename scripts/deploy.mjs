import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
let output = "";
const processChild = spawn("npx", ["wrangler", "deploy"], {
  stdio: ["inherit", "pipe", "inherit"],
});
processChild.stdout.on("data", (chunk) => {
  output += chunk.toString();
  process.stdout.write(chunk);
});
const code = await new Promise((resolve) => processChild.on("exit", resolve));
if (code !== 0) process.exit(code || 1);
const url = output.match(
  /https:\/\/rally-together\.[a-z0-9-]+\.workers\.dev\b/i,
)?.[0];
if (!url)
  throw Error(
    "Wrangler не вернул адрес workers.dev. Проверьте вывод публикации.",
  );
await mkdir("work", { recursive: true });
await writeFile("work/deploy-url.txt", url + "\n");
console.log("Адрес опубликованной версии сохранён в work/deploy-url.txt");
