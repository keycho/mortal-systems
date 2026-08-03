import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const runtimePort = process.env.LIMINAL_PORT ?? "4923";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // browser dev mode proxies to the local runtime; inside tauri the shell
      // brokers calls instead (see src/lib/client.ts)
      "/runtime": {
        target: `http://127.0.0.1:${runtimePort}`,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/runtime/, ""),
      },
    },
  },
  build: {
    target: "es2022",
  },
  test: {
    environment: "jsdom",
  },
});
