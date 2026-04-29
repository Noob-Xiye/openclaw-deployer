import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],

  clearScreen: false,
  server: {
    port: 5173,
    strictPort: false,
    host: "0.0.0.0",
    hmr: {
      protocol: "ws",
      host: "0.0.0.0",
      port: 5174,
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));