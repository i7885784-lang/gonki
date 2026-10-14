import { build } from "esbuild";
await build({
  entryPoints: ["server/index.ts"],
  outfile: "build-server/index.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["ws"],
  sourcemap: true,
});
