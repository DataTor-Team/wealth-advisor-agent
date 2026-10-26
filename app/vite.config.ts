import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The browser calls the agent's /v1 API on this server, which forwards it, so no CORS is needed.
const proxy = { "/v1": process.env.AGENT_URL ?? "http://localhost:8080" };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy },
  preview: { proxy },
});
