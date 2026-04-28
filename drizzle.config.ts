import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: [
    "./packages/core/src/schema.ts",
    "./packages/artifacts/src/schema.ts",
    "./packages/memory/src/schema.ts",
    "./packages/curriculum/src/schema.ts",
  ],
  out: "./drizzle",
  dbCredentials: {
    url: process.env.PRAXIS_DB_PATH ?? "./.praxis/dev.db",
  },
});
