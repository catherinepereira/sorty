import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { DEV_FRONTEND_PORT } from "./src/config.ts";

export default defineConfig({
  // Relative so the same build serves from its own domain and from reflect.cv/<path>/
  base: "./",
  plugins: [react(), tailwindcss()],
  server: {
    port: DEV_FRONTEND_PORT,
    strictPort: true,
  },
});
