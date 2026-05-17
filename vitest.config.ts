import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Migrated from vitest.workspace.ts (deprecated in Vitest 3) to test.projects here.
    // The tests/ project now has its own vitest.config.ts so it can declare
    // resolve.conditions including praxis-source — matching each per-package config.
    projects: ["packages/*", "tests"],
  },
});
