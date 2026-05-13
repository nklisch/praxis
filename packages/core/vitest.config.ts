import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirror tsconfig.base.json's customConditions so workspace package subpath
    // exports (e.g. @praxis/curriculum/modes) resolve to source TypeScript files
    // via the praxis-source condition during tests — no build step required.
    conditions: ["praxis-source", "import", "module", "node", "default"],
  },
  test: {
    environment: "node",
  },
});
