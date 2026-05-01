import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "electron-vite";

const workspaceRoot = resolve(__dirname, "../..");

/**
 * Strategy: explicitly list third-party node_modules that must stay external
 * (native modules + heavy deps that can't / shouldn't be bundled). Everything
 * else — workspace packages, their internal source, transitive helpers — gets
 * inlined into the main/preload bundles by rollup.
 *
 * Why not `externalizeDepsPlugin`: it externalizes everything in the desktop
 * package's `dependencies`. With workspace packages there, transitive native
 * modules from those workspace packages (better-sqlite3 inside @praxis/core,
 * canvas inside @praxis/tools) end up bundled — which crashes at runtime when
 * rollup commonjs tries to require() the .node binding from inside the asar.
 *
 * Why not `ssr.noExternal`: electron-vite's main process is a Node-target build,
 * not vite SSR mode, so `ssr.noExternal` is ignored.
 *
 * The explicit list below is the manual maintenance burden — when a new
 * third-party native or heavy dep is added to any workspace package, add it
 * here too.
 */
const EXTERNAL_THIRD_PARTY = [
  // Native modules — must ship as binary, can't be bundled
  "better-sqlite3",
  "isolated-vm",
  "canvas",
  // Native-adjacent / WASM
  "sqlite-vec",
  "pyodide",
  "@huggingface/transformers",
  "pdfjs-dist",
  // ORM / DB layer (uses dynamic require + native binding)
  "drizzle-orm",
  "drizzle-orm/better-sqlite3",
  "drizzle-orm/sqlite-core",
  // AI SDKs (large, dynamic, often have node-only paths)
  "ai",
  "@ai-sdk/anthropic",
  "@ai-sdk/openai",
  "@ai-sdk/google",
  "ollama-ai-provider-v2",
  "@praxis/claude-cli-sdk",
  "@openai/codex-sdk",
  "@modelcontextprotocol/sdk",
  // Document parsing
  "epub2",
  "linkedom",
  "mammoth",
  "@mozilla/readability",
  // Misc
  "uuid",
  "zod",
  "ts-fsrs",
  "electron",
];

/** Match `node:foo` imports — always external (Electron has Node built-ins). */
const NODE_BUILTIN_PATTERN = /^node:/;

// Dev mode adds the `praxis-source` export condition so workspace packages
// resolve to .ts source (electron-vite + tsx loader handle the transform).
// Production omits it, falling through to the `default` (./dist/.js) export.
// Always include `node` so Node-conditional exports keep working.
const isDev = process.env["NODE_ENV"] !== "production";
const conditions = isDev ? ["praxis-source", "node"] : ["node"];

export default defineConfig({
  main: {
    resolve: {
      conditions,
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/main/index.ts"),
        },
        external: [...EXTERNAL_THIRD_PARTY, NODE_BUILTIN_PATTERN],
      },
    },
  },
  preload: {
    resolve: {
      conditions,
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/preload/index.ts"),
        },
        external: [...EXTERNAL_THIRD_PARTY, NODE_BUILTIN_PATTERN],
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "electron/renderer"),
    plugins: [react()],
    resolve: {
      alias: {
        "@praxis/client": resolve(workspaceRoot, "packages/client/src/index.ts"),
        "@praxis/ui": resolve(workspaceRoot, "packages/ui/src/index.ts"),
        "@praxis/core/types": resolve(workspaceRoot, "packages/core/src/types/index.ts"),
        react: resolve(workspaceRoot, "packages/ui/node_modules/react"),
        "react-dom": resolve(workspaceRoot, "packages/ui/node_modules/react-dom"),
        "react/jsx-runtime": resolve(
          workspaceRoot,
          "packages/ui/node_modules/react/jsx-runtime.js",
        ),
        "@tanstack/react-router": resolve(
          workspaceRoot,
          "packages/ui/node_modules/@tanstack/react-router",
        ),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/renderer/index.html"),
        },
      },
    },
  },
});
