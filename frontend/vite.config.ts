// Minimal Node `process` typing so this config file type-checks
// without needing full `@types/node` across the whole frontend.
declare const process: {
  cwd(): string;
};

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  // In Vite, env vars must start with VITE_ to be exposed to the client.
  // loadEnv merges .env, .env.[mode], etc., and returns strings.
  const env = loadEnv(mode, process.cwd(), "");

  const apiTarget = env.VITE_API_URL ?? "http://localhost:4000";

  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
  };
});
