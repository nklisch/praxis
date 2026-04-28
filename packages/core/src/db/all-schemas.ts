import { artifactsSchema } from "@praxis/artifacts/schema";
import { curriculumSchema } from "@praxis/curriculum/schema";
import { memorySchema } from "@praxis/memory/schema";
import { coreSchema } from "../schema.js";

/** The single Drizzle schema map merged from every domain package. */
export const schema = {
  ...coreSchema,
  ...artifactsSchema,
  ...memorySchema,
  ...curriculumSchema,
} as const;

export type Schema = typeof schema;
