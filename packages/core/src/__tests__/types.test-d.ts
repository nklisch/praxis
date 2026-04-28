import { expectTypeOf } from "vitest";
import type { CourseId } from "../types/ids.js";
import { brandId } from "../types/ids.js";
import type { Course, Engine, EpisodicEvent, Mode, PraxisClient } from "../types/index.js";

// Compile-time type tests; runtime is no-op.
expectTypeOf<Engine>().toHaveProperty("run");
expectTypeOf<Mode>().toHaveProperty("promptFragments");
expectTypeOf<Course>().toHaveProperty("thresholds");
expectTypeOf<EpisodicEvent>().toHaveProperty("event");
expectTypeOf<PraxisClient>().toHaveProperty("session");

const id: CourseId = brandId<"CourseId">("550e8400-e29b-71d4-a716-446655440000");
expectTypeOf(id).toMatchTypeOf<CourseId>();
