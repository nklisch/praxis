import { describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../db/index.js";
import {
  COURSE_CREATE_DEFAULT_MAX_STEPS,
  COURSE_CREATE_MAX_STEPS_LIMIT,
  COURSE_CREATE_MIN_STEPS,
  CourseCreateConfigSchema,
  DEFAULT_COURSE_CREATE_CONFIG,
  readCourseCreateConfig,
  writeCourseCreateConfig,
} from "../course-create-config.js";

const dbCtx = useTempDb();

function makeDb() {
  return openDb({ path: dbCtx.dbPath }).db;
}

describe("readCourseCreateConfig", () => {
  it("returns defaults when no stored config", () => {
    const db = makeDb();
    const cfg = readCourseCreateConfig(db);
    expect(cfg).toEqual(DEFAULT_COURSE_CREATE_CONFIG);
    expect(cfg.maxSteps).toBe(COURSE_CREATE_DEFAULT_MAX_STEPS);
  });

  it("returns the stored value once written", () => {
    const db = makeDb();
    writeCourseCreateConfig(db, { maxSteps: 75 });
    expect(readCourseCreateConfig(db).maxSteps).toBe(75);
  });

  it("merges partial stored values with defaults", () => {
    // Forward-compat: if a future field is added with a default and an old
    // install only has `maxSteps` stored, the read should still return a
    // valid object via the schema's defaults.
    const db = makeDb();
    writeCourseCreateConfig(db, { maxSteps: 100 });
    const cfg = readCourseCreateConfig(db);
    expect(cfg.maxSteps).toBe(100);
  });
});

describe("writeCourseCreateConfig", () => {
  it("rejects values below the floor", () => {
    const db = makeDb();
    expect(() => writeCourseCreateConfig(db, { maxSteps: COURSE_CREATE_MIN_STEPS - 1 })).toThrow();
  });

  it("rejects values above the ceiling", () => {
    const db = makeDb();
    expect(() =>
      writeCourseCreateConfig(db, { maxSteps: COURSE_CREATE_MAX_STEPS_LIMIT + 1 }),
    ).toThrow();
  });

  it("rejects non-integer values", () => {
    const db = makeDb();
    expect(() => writeCourseCreateConfig(db, { maxSteps: 12.5 })).toThrow();
  });

  it("accepts the floor and the ceiling", () => {
    const db = makeDb();
    writeCourseCreateConfig(db, { maxSteps: COURSE_CREATE_MIN_STEPS });
    expect(readCourseCreateConfig(db).maxSteps).toBe(COURSE_CREATE_MIN_STEPS);
    writeCourseCreateConfig(db, { maxSteps: COURSE_CREATE_MAX_STEPS_LIMIT });
    expect(readCourseCreateConfig(db).maxSteps).toBe(COURSE_CREATE_MAX_STEPS_LIMIT);
  });

  it("upserts — repeated writes overwrite the previous value", () => {
    const db = makeDb();
    writeCourseCreateConfig(db, { maxSteps: 50 });
    writeCourseCreateConfig(db, { maxSteps: 150 });
    expect(readCourseCreateConfig(db).maxSteps).toBe(150);
  });
});

describe("CourseCreateConfigSchema", () => {
  it("default value is the COURSE_CREATE_DEFAULT_MAX_STEPS constant", () => {
    expect(CourseCreateConfigSchema.parse({}).maxSteps).toBe(COURSE_CREATE_DEFAULT_MAX_STEPS);
  });
});
