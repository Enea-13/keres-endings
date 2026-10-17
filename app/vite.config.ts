import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5317, strictPort: true },
  preview: { port: 5317, strictPort: true },
  build: { target: "es2022", chunkSizeWarningLimit: 800 },
});
