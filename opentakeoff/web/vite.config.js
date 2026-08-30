import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { corpusTakeoffApiPlugin } from "./vite.corpusTakeoffApi.js";

// The one source of truth for the app version — package.json — inlined as
// __APP_VERSION__ so contributions can carry generator_version without a
// runtime fetch. Guarded with `typeof` at the use site so the Node test
// runner (no Vite, no define) sees plain undefined instead of a crash.
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

/** Cerebras key for the platform proxy — never a VITE_* (never shipped to the browser). */
function cerebrasApiKey(mode) {
  const env = loadEnv(mode, process.cwd(), "");
  const fromEnv = (env.CEREBRAS_API_KEY || process.env.CEREBRAS_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  for (const rel of ["../server/.env", ".env", ".env.local"]) {
    const p = resolve(process.cwd(), rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = /^\s*CEREBRAS_API_KEY\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      return m[1].trim().replace(/^["']|["']$/g, "");
    }
  }
  return "";
}

// OpenTakeoff canvas is client-side; Agent LLM calls go through /cerebras-api
// so the real key stays in the Vite process (CEREBRAS_API_KEY), not localStorage.
//
// `/__ot/sheet-graph` + `/__ot/compile-corpus-takeoff` run the same Session+ODL
// path as MCP.
export default defineConfig(({ mode }) => {
  const key = cerebrasApiKey(mode);
  if (!key) {
    console.warn(
      "[opentakeoff] CEREBRAS_API_KEY not set — put it in opentakeoff/server/.env or web/.env "
      + "(not VITE_*). Agent will fail until the key is available to the Vite proxy.",
    );
  } else {
    console.info("[opentakeoff] Cerebras platform proxy enabled at /cerebras-api (key not exposed to browser)");
  }

  return {
    plugins: [react(), corpusTakeoffApiPlugin()],
    define: { __APP_VERSION__: JSON.stringify(pkg.version) },
    worker: { format: "es" },
    server: {
      port: 5173,
      proxy: {
        // Optional BYO sandbox (server/README.md).
        "/ai": {
          target: "http://localhost:8000",
          headers: process.env.OT_SANDBOX_API_KEY
            ? { "X-API-Key": process.env.OT_SANDBOX_API_KEY }
            : {},
        },
        // Platform Agent path: browser → Vite → Cerebras. Key injected here.
        "/cerebras-api": {
          target: "https://api.cerebras.ai",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/cerebras-api/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              if (key) proxyReq.setHeader("Authorization", `Bearer ${key}`);
            });
          },
        },
      },
    },
    preview: {
      port: 5173,
      proxy: {
        "/cerebras-api": {
          target: "https://api.cerebras.ai",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/cerebras-api/, ""),
          configure: (proxy) => {
            proxy.on("proxyReq", (proxyReq) => {
              if (key) proxyReq.setHeader("Authorization", `Bearer ${key}`);
            });
          },
        },
      },
    },
    build: {
      outDir: "dist",
      emptyOutDir: true,
    },
  };
});
