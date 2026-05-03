import { afterEach, describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../db/index.js";
import { configKv } from "../../schema.js";
import {
  DEFAULT_LOGGING_CONFIG,
  LoggingConfigSchema,
  readLoggingConfig,
  writeLoggingConfig,
} from "../logging-config.js";

const dbCtx = useTempDb();

function makeDb() {
  return openDb({ path: dbCtx.dbPath }).db;
}

describe("readLoggingConfig", () => {
  afterEach(() => {
    delete process.env.PRAXIS_LOG_LEVEL;
    delete process.env.PRAXIS_LOG_FILE;
    delete process.env.PRAXIS_LOG_PROMPTS;
  });

  it("returns defaults when no stored config", () => {
    const db = makeDb();
    const cfg = readLoggingConfig(db);
    expect(cfg).toEqual(DEFAULT_LOGGING_CONFIG);
  });

  it("fileEnabled defaults to true when isPackaged === false", () => {
    const db = makeDb();
    const cfg = readLoggingConfig(db, { isPackaged: false });
    expect(cfg.fileEnabled).toBe(true);
  });

  it("fileEnabled defaults to false when isPackaged === true", () => {
    const db = makeDb();
    const cfg = readLoggingConfig(db, { isPackaged: true });
    expect(cfg.fileEnabled).toBe(false);
  });

  it("level defaults to 'debug' when isPackaged === false", () => {
    const db = makeDb();
    const cfg = readLoggingConfig(db, { isPackaged: false });
    expect(cfg.level).toBe("debug");
  });

  it("level defaults to 'info' when isPackaged === true", () => {
    const db = makeDb();
    const cfg = readLoggingConfig(db, { isPackaged: true });
    expect(cfg.level).toBe("info");
  });

  it("stored level overrides the dev debug default", () => {
    // A user who explicitly set level=info via the config UI should not be
    // overridden by the dev default — `pnpm dev` respects intent.
    const db = makeDb();
    writeLoggingConfig(db, { ...DEFAULT_LOGGING_CONFIG, level: "info" });
    const cfg = readLoggingConfig(db, { isPackaged: false });
    expect(cfg.level).toBe("info");
  });

  it("stored partial values merge with defaults", () => {
    const db = makeDb();
    writeLoggingConfig(db, { ...DEFAULT_LOGGING_CONFIG, level: "debug" });
    const cfg = readLoggingConfig(db);
    expect(cfg.level).toBe("debug");
    expect(cfg.fileEnabled).toBe(DEFAULT_LOGGING_CONFIG.fileEnabled);
    expect(cfg.maxFileSizeMb).toBe(DEFAULT_LOGGING_CONFIG.maxFileSizeMb);
  });

  it("env PRAXIS_LOG_LEVEL overrides stored and default", () => {
    const db = makeDb();
    writeLoggingConfig(db, { ...DEFAULT_LOGGING_CONFIG, level: "info" });
    process.env.PRAXIS_LOG_LEVEL = "error";
    const cfg = readLoggingConfig(db);
    expect(cfg.level).toBe("error");
  });

  it("env PRAXIS_LOG_FILE=1 enables fileEnabled", () => {
    const db = makeDb();
    process.env.PRAXIS_LOG_FILE = "1";
    const cfg = readLoggingConfig(db, { isPackaged: true });
    expect(cfg.fileEnabled).toBe(true);
  });

  it("env PRAXIS_LOG_FILE=0 disables fileEnabled even when isPackaged=false", () => {
    const db = makeDb();
    process.env.PRAXIS_LOG_FILE = "0";
    const cfg = readLoggingConfig(db, { isPackaged: false });
    expect(cfg.fileEnabled).toBe(false);
  });

  it("env PRAXIS_LOG_PROMPTS=1 enables prompts", () => {
    const db = makeDb();
    process.env.PRAXIS_LOG_PROMPTS = "1";
    const cfg = readLoggingConfig(db);
    expect(cfg.prompts).toBe(true);
  });

  it("throws on invalid stored level", () => {
    const db = makeDb();
    // Bypass writeLoggingConfig validation to inject bad data
    db.insert(configKv)
      .values({ key: "logging", valueJson: { level: "verbose" } as unknown, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: configKv.key,
        set: { valueJson: { level: "verbose" } as unknown, updatedAt: new Date() },
      })
      .run();
    expect(() => readLoggingConfig(db)).toThrow();
  });
});

describe("writeLoggingConfig", () => {
  it("round-trips a full config", () => {
    const db = makeDb();
    const cfg = {
      level: "debug" as const,
      fileEnabled: true,
      prompts: true,
      maxFileSizeMb: 20,
      maxFiles: 3,
    };
    writeLoggingConfig(db, cfg);
    const read = readLoggingConfig(db);
    expect(read.level).toBe("debug");
    expect(read.fileEnabled).toBe(true);
    expect(read.prompts).toBe(true);
    expect(read.maxFileSizeMb).toBe(20);
    expect(read.maxFiles).toBe(3);
  });

  it("upserts on second write", () => {
    const db = makeDb();
    writeLoggingConfig(db, { ...DEFAULT_LOGGING_CONFIG, level: "warn" });
    writeLoggingConfig(db, { ...DEFAULT_LOGGING_CONFIG, level: "error" });
    const cfg = readLoggingConfig(db);
    expect(cfg.level).toBe("error");
  });

  it("validates — rejects negative maxFileSizeMb", () => {
    const db = makeDb();
    expect(() =>
      writeLoggingConfig(db, { ...DEFAULT_LOGGING_CONFIG, maxFileSizeMb: -1 }),
    ).toThrow();
  });
});

describe("LoggingConfigSchema", () => {
  it("rejects unknown levels", () => {
    const result = LoggingConfigSchema.safeParse({ level: "verbose" });
    expect(result.success).toBe(false);
  });

  it("accepts valid partial (fills defaults)", () => {
    const result = LoggingConfigSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(DEFAULT_LOGGING_CONFIG);
    }
  });
});
