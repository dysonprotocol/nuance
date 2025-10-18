import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { cwd, env as nodeEnv } from "node:process";

const __dirname = dirname(fileURLToPath(import.meta.url));

function gitOrDefault(cmd: string, fallback = ""): string {
  try {
    return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return fallback;
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, cwd(), "");
  const proxyTarget =
    env.DYSONPROTOCOL_API ||
    env.VITE_DYSONPROTOCOL_API ||
    nodeEnv.DYSONPROTOCOL_API ||
    "http://localhost:1317";
  const wsProxyTarget = proxyTarget.replace(/^http/, "ws");

  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    define: {
      "process.env.NODE_ENV": '"production"',
      "process.env": {},
      __DEV__: "false",
      __VUE_PROD_DEVTOOLS__: "false",
      __VUE_OPTIONS_API__: "true",
      __GIT_COMMIT__: JSON.stringify(
        gitOrDefault("git rev-parse --short HEAD", "<none>")
      ),
      __GIT_BRANCH__: JSON.stringify(
        gitOrDefault("git name-rev HEAD", "HEAD <none>").split(/\s+/)[1] ||
          "<none>"
      ),
    },
    optimizeDeps: {
      esbuildOptions: {
        target: "es2020",
        define: {},
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5174,
      strictPort: true,
      watch: {
        usePolling: true,
      },
      proxy: {
        "/cosmos": {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
          headers: { Connection: "keep-alive" },
          timeout: 60000,
          proxyTimeout: 60000,
        },
        "/dysonprotocol": {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
          headers: { Connection: "keep-alive" },
          timeout: 60000,
          proxyTimeout: 60000,
        },
        "/swagger": {
          target: proxyTarget,
          changeOrigin: false,
          secure: false,
          headers: { Connection: "keep-alive" },
          timeout: 60000,
          proxyTimeout: 60000,
        },
        "/ibc": {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
          headers: { Connection: "keep-alive" },
          timeout: 60000,
          proxyTimeout: 60000,
        },
        "/rpc/websocket": {
          target: wsProxyTarget,
          changeOrigin: true,
          secure: false,
          ws: true,
        },
        "/rpc": {
          target: proxyTarget,
          changeOrigin: false,
          secure: false,
          headers: { Connection: "keep-alive" },
          timeout: 60000,
          proxyTimeout: 60000,
        },
        "/host.json": {
          target: proxyTarget,
          changeOrigin: false,
          secure: false,
        },
        "/redirect-to-dwapp": {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    build: {
      outDir: "dist",
      assetsDir: "assets",
      manifest: "manifest.json",
    },
    test: {
      globals: true,
      environment: "jsdom",
    },
  };
});
