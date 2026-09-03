import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: true, // bind all interfaces (0.0.0.0)
    port: 5173,
    // Accept requests that arrive through a tunnel/preview host
    // (e.g. the sandbox preview or a dev tunnel). Irrelevant for
    // plain localhost use.
    allowedHosts: true,
    proxy: {
      // In development the frontend runs on :5173 and the backend on
      // :3001. Proxying /api and /ws here means the frontend can use
      // RELATIVE urls (fetch("/api/robots"), WebSocket("/ws/robots"))
      // and never hard-codes the backend address. In production the
      // backend serves the built frontend, so it's same-origin anyway.
      "/api": "http://localhost:3001",
      "/ws": { target: "http://localhost:3001", ws: true },
    },
  },
});
