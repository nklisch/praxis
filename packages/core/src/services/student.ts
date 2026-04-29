import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import { configKv } from "../schema.js";
import { brandId, type StudentId } from "../types/index.js";

const KEY = "default_student_id";

/**
 * Get or create the default student ID for this install.
 * Stored under config_kv key "default_student_id". Generated on first call as
 * a UUIDv7 and persisted. Subsequent calls return the same value — idempotent.
 */
export function getOrCreateDefaultStudentId(db: PraxisDb): StudentId {
  const row = db.select().from(configKv).where(eq(configKv.key, KEY)).get();
  if (row) return brandId<"StudentId">(row.valueJson as string);
  const id = uuidv7();
  db.insert(configKv).values({ key: KEY, valueJson: id, updatedAt: new Date() }).run();
  return brandId<"StudentId">(id);
}
