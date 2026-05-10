import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Mirror tsconfig.base.json's customConditions so workspace package subpath
    // exports (e.g. @praxis/tools/labels) resolve to source TypeScript files
    // via the praxis-source condition during tests — no build step required.
    conditions: ["praxis-source", "import", "module", "browser", "default"],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});
