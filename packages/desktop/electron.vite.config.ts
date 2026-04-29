import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

// Resolve workspace packages as source (no build step required).
const workspaceRoot = resolve(__dirname, "../..");

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/main/index.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "electron/preload/index.ts"),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "electron/renderer"),
    plugins: [react()],
    resolve: {
      alias: {
        // Resolve workspace packages from their source directly.
        "@praxis/client": resolve(workspaceRoot, "packages/client/src/index.ts"),
        "@praxis/ui": resolve(workspaceRoot, "packages/ui/src/index.ts"),
        "@praxis/core/types": resolve(workspaceRoot, "packages/core/src/types/index.ts"),
        // React must be resolved from the package that owns it (@praxis/ui).
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
