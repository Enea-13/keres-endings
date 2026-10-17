// Copies the single-threaded "lite" Stockfish build (JS + WASM) into public/engine so the
// app can start it as a Web Worker without special cross-origin headers.
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "stockfish", "bin");
const out = join(root, "public", "engine");
if (!existsSync(src)) {
  console.warn("stockfish package not found; skipping engine copy");
  process.exit(0);
}
mkdirSync(out, { recursive: true });
const files = readdirSync(src).filter((f) => /lite-single.*\.(js|wasm)$/.test(f));
for (const f of files) copyFileSync(join(src, f), join(out, f));
console.log("engine files:", files.join(", ") || "(none found)");
