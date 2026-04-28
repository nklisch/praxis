#!/usr/bin/env tsx
import { listTables } from "@praxis/core/db/show";

const tables = listTables();
if (tables.length === 0) {
  console.log("No tables. Run `pnpm db:migrate` first.");
  process.exit(0);
}
console.log("Tables:");
for (const t of tables) {
  console.log(`  ${t.name.padEnd(30)} rows=${t.rowCount}`);
}
