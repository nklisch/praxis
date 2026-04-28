#!/usr/bin/env tsx
import { runMigrations } from "@praxis/core/db/migrate";

const result = runMigrations();
console.log(`Migrations applied. Database at ${result.path}`);
