import { defineConfig } from "vite";
export default defineConfig({
  base: "./",
  server: { proxy: { "/api": { target: "http://localhost:8787", ws: true } } },
  build: {
    target: "es2022",
    outDir: process.env.VITE_P2P === "true" ? "dist-pages" : "dist",
  },
});
