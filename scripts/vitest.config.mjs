import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    include: ["**/*.test.mjs"],
    name: "scripts",
    environment: "node",
  },
});
