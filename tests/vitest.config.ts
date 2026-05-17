import { defineProject } from "vitest/config";

export default defineProject({
  resolve: {
    // Mirror tsconfig.base.json's customConditions so workspace package subpath
    // exports (e.g. @praxis/core/types) resolve to source TypeScript files
    // via the praxis-source condition during tests — no build step required.
    // Matches the per-package vitest.config.ts pattern (see packages/core/vitest.config.ts).
    conditions: ["praxis-source", "import", "module", "node", "default"],
  },
  ssr: {
    resolve: {
      conditions: ["praxis-source", "import", "module", "node", "default"],
      externalConditions: ["praxis-source", "import", "module", "node", "default"],
    },
  },
  test: {
    include: ["**/*.test.ts"],
    name: "root",
    environment: "node",
  },
});
