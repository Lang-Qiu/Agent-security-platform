import { defineConfig } from "vite";

const backendOrigin =
  process.env.TRACK1_BACKEND_ORIGIN ?? "http://127.0.0.1:3000";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: backendOrigin,
        changeOrigin: true
      },
      "/health": {
        target: backendOrigin,
        changeOrigin: true
      }
    }
  }
});
