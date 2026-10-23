import { cpSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const DEMO_CONTENT = fileURLToPath(new URL("../demo/build/content", import.meta.url));

/** `vite build --mode demo` builds the public demo: the book's content in public/ is left
 * out and the demo's (from pipeline/demo.py) takes its place. 404.html serves deep links on
 * GitHub Pages. */
function demo(): Plugin {
  let outDir = "";
  return {
    name: "demo-content",
    apply: (_, env) => env.command === "build" && env.mode === "demo",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    buildStart() {
      if (!existsSync(DEMO_CONTENT)) this.error("demo content not built: run `python pipeline/demo.py` first");
    },
    transformIndexHtml: (html) => html.replace(/<title>.*<\/title>/, "<title>Chess Endings Study · Demo</title>"),
    closeBundle() {
      for (const dir of ["content", "qa"]) rmSync(join(outDir, dir), { recursive: true, force: true });
      cpSync(DEMO_CONTENT, join(outDir, "content"), { recursive: true });
      cpSync(join(outDir, "index.html"), join(outDir, "404.html"));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), demo()],
  server: { port: 5317, strictPort: true },
  preview: { port: 5317, strictPort: true },
  build: { target: "es2022", chunkSizeWarningLimit: 800 },
});
