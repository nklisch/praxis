import { describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../db/index.js";
import {
  BOOTSTRAP_DEFAULT_MAX_STEPS,
  BOOTSTRAP_MAX_STEPS_LIMIT,
  BOOTSTRAP_MIN_STEPS,
  BootstrapConfigSchema,
  DEFAULT_BOOTSTRAP_CONFIG,
  readBootstrapConfig,
  writeBootstrapConfig,
} from "../bootstrap-config.js";

const dbCtx = useTempDb();

function makeDb() {
  return openDb({ path: dbCtx.dbPath }).db;
}

describe("readBootstrapConfig", () => {
  it("returns defaults when no stored config", () => {
    const db = makeDb();
    const cfg = readBootstrapConfig(db);
    expect(cfg).toEqual(DEFAULT_BOOTSTRAP_CONFIG);
    expect(cfg.maxSteps).toBe(BOOTSTRAP_DEFAULT_MAX_STEPS);
  });

  it("returns the stored value once written", () => {
    const db = makeDb();
    writeBootstrapConfig(db, { maxSteps: 75 });
    expect(readBootstrapConfig(db).maxSteps).toBe(75);
  });

  it("merges partial stored values with defaults", () => {
    // Forward-compat: if a future field is added with a default and an old
    // install only has `maxSteps` stored, the read should still return a
    // valid object via the schema's defaults.
    const db = makeDb();
    writeBootstrapConfig(db, { maxSteps: 100 });
    const cfg = readBootstrapConfig(db);
    expect(cfg.maxSteps).toBe(100);
  });
});

describe("writeBootstrapConfig", () => {
  it("rejects values below the floor", () => {
    const db = makeDb();
    expect(() => writeBootstrapConfig(db, { maxSteps: BOOTSTRAP_MIN_STEPS - 1 })).toThrow();
  });

  it("rejects values above the ceiling", () => {
    const db = makeDb();
    expect(() => writeBootstrapConfig(db, { maxSteps: BOOTSTRAP_MAX_STEPS_LIMIT + 1 })).toThrow();
  });

  it("rejects non-integer values", () => {
    const db = makeDb();
    expect(() => writeBootstrapConfig(db, { maxSteps: 12.5 })).toThrow();
  });

  it("accepts the floor and the ceiling", () => {
    const db = makeDb();
    writeBootstrapConfig(db, { maxSteps: BOOTSTRAP_MIN_STEPS });
    expect(readBootstrapConfig(db).maxSteps).toBe(BOOTSTRAP_MIN_STEPS);
    writeBootstrapConfig(db, { maxSteps: BOOTSTRAP_MAX_STEPS_LIMIT });
    expect(readBootstrapConfig(db).maxSteps).toBe(BOOTSTRAP_MAX_STEPS_LIMIT);
  });

  it("upserts — repeated writes overwrite the previous value", () => {
    const db = makeDb();
    writeBootstrapConfig(db, { maxSteps: 50 });
    writeBootstrapConfig(db, { maxSteps: 150 });
    expect(readBootstrapConfig(db).maxSteps).toBe(150);
  });
});

describe("BootstrapConfigSchema", () => {
  it("default value is the BOOTSTRAP_DEFAULT_MAX_STEPS constant", () => {
    expect(BootstrapConfigSchema.parse({}).maxSteps).toBe(BOOTSTRAP_DEFAULT_MAX_STEPS);
  });
});
