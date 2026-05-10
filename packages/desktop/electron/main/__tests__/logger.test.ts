import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LogRecord } from "@praxis/core/types";
import pino, { type Logger as PinoInstance } from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createMainLogger,
  type MainLogger,
  type MainLoggerOptions,
  wrapPinoForTesting,
} from "../logger.js";

/**
 * Tests for MainLogger.
 *
 * Strategy: most tests bypass createMainLogger and exercise wrapPinoForTesting
 * against a synchronous pino destination. This isolates the wrapper's logic
 * (redaction, child bindings, prompt gating, ingestRendererRecord) from the
 * worker-thread transport, which is otherwise flaky under Vitest stdio capture.
 *
 * A small number of "smoke" tests do exercise createMainLogger end-to-end.
 */

interface TestRig {
  log: MainLogger;
  read: () => Array<Record<string, unknown>>;
  cleanup: () => void;
}

const REDACT_PATHS = [
  "apiKey",
  "authorization",
  "password",
  "lockCode",
  "*.apiKey",
  "*.authorization",
  "*.password",
  "*.lockCode",
  "config.apiKey",
  "engineConfig.apiKey",
  "headers.authorization",
  "headers.Authorization",
] as const;

function makeRig(
  opts: { allowPrompts?: boolean; baseBindings?: Record<string, unknown> } = {},
): TestRig {
  const dir = mkdtempSync(join(tmpdir(), "praxis-logger-"));
  const file = join(dir, "out.log");
  const dest = pino.destination({ sync: true, dest: file });
  const root: PinoInstance = pino(
    {
      level: "debug",
      base: { ...(opts.baseBindings ?? {}) },
      timestamp: pino.stdTimeFunctions.epochTime,
      redact: { paths: [...REDACT_PATHS], censor: "[REDACTED]" },
      formatters: { level: (label) => ({ level: label }) },
    },
    dest,
  );
  const log = wrapPinoForTesting(root, opts.allowPrompts ?? false);
  return {
    log,
    read: () =>
      readFileSync(file, "utf8")
        .split("\n")
        .filter((l) => l.trim().length > 0)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

let rig: TestRig | undefined;

afterEach(() => {
  rig?.cleanup();
  rig = undefined;
});

describe("MainLogger contract — emit + level", () => {
  it("writes JSONL records with level + msg + time", () => {
    rig = makeRig();
    rig.log.info("hello");
    rig.log.warn("careful");
    rig.log.error("oops");
    const lines = rig.read();
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatchObject({ level: "info", msg: "hello" });
    expect(lines[1]).toMatchObject({ level: "warn", msg: "careful" });
    expect(lines[2]).toMatchObject({ level: "error", msg: "oops" });
    for (const rec of lines) {
      expect(typeof rec.time).toBe("number");
    }
  });

  it("level appears as a string label, not a numeric pino level", () => {
    rig = makeRig();
    rig.log.info("x");
    const [rec] = rig.read();
    expect(rec?.level).toBe("info"); // formatters.level wired in
    expect(typeof rec?.level).toBe("string");
  });

  it("includes baseBindings on every record", () => {
    rig = makeRig({ baseBindings: { pid: 999, version: "1.2.3" } });
    rig.log.info("x");
    rig.log.warn("y");
    const lines = rig.read();
    for (const rec of lines) {
      expect(rec.pid).toBe(999);
      expect(rec.version).toBe("1.2.3");
    }
  });

  it("handles fields = undefined (the no-extra-fields call)", () => {
    rig = makeRig();
    rig.log.info("bare-call");
    const [rec] = rig.read();
    expect(rec?.msg).toBe("bare-call");
  });
});

describe("redaction (well-known secret paths)", () => {
  it("redacts top-level apiKey, authorization, password, lockCode", () => {
    rig = makeRig();
    rig.log.info("auth", {
      apiKey: "sk-secret-1",
      authorization: "Bearer secret",
      password: "hunter2",
      lockCode: "0000",
    });
    const [rec] = rig.read();
    expect(rec?.apiKey).toBe("[REDACTED]");
    expect(rec?.authorization).toBe("[REDACTED]");
    expect(rec?.password).toBe("[REDACTED]");
    expect(rec?.lockCode).toBe("[REDACTED]");
  });

  it("redacts nested config.apiKey and engineConfig.apiKey", () => {
    rig = makeRig();
    rig.log.info("nested-config", { config: { apiKey: "sk-c" } });
    rig.log.info("nested-engine", { engineConfig: { apiKey: "sk-e" } });
    const lines = rig.read();
    expect((lines[0]?.config as { apiKey: string }).apiKey).toBe("[REDACTED]");
    expect((lines[1]?.engineConfig as { apiKey: string }).apiKey).toBe("[REDACTED]");
  });

  it("redacts headers.authorization (both cases)", () => {
    rig = makeRig();
    rig.log.info("h", { headers: { authorization: "Bearer x", Authorization: "Bearer y" } });
    const [rec] = rig.read();
    const headers = rec?.headers as Record<string, string>;
    expect(headers.authorization).toBe("[REDACTED]");
    expect(headers.Authorization).toBe("[REDACTED]");
  });

  it("does NOT redact a field with a similar but unrelated name", () => {
    rig = makeRig();
    rig.log.info("user", { username: "alice", apiKeyHint: "sk-***" });
    const [rec] = rig.read();
    expect(rec?.username).toBe("alice");
    expect(rec?.apiKeyHint).toBe("sk-***");
  });
});

describe("MainLogger.child", () => {
  it("merges bindings from parent + child", () => {
    rig = makeRig();
    rig.log.child({ a: 1 }).child({ b: 2 }).info("nested");
    const [rec] = rig.read();
    expect(rec?.a).toBe(1);
    expect(rec?.b).toBe(2);
    expect(rec?.msg).toBe("nested");
  });

  it("child overrides parent on same key", () => {
    rig = makeRig();
    rig.log.child({ component: "parent" }).child({ component: "child" }).info("x");
    const [rec] = rig.read();
    expect(rec?.component).toBe("child");
  });

  it("siblings stay independent", () => {
    rig = makeRig();
    const parent = rig.log.child({ scope: "outer" });
    parent.child({ scope: "inner" }).info("from-inner");
    parent.info("from-parent");
    const lines = rig.read();
    expect(lines.find((r) => r.msg === "from-inner")?.scope).toBe("inner");
    expect(lines.find((r) => r.msg === "from-parent")?.scope).toBe("outer");
  });
});

describe("prompt gating", () => {
  const PROMPT_FIELDS = ["prompt", "messages", "modelOutput", "systemPrompt"];

  it("redacts prompt fields when prompts: false (default)", () => {
    rig = makeRig({ allowPrompts: false });
    rig.log.info("model.call", {
      prompt: "Tell me about photosynthesis",
      messages: [{ role: "user", content: "hi" }],
      modelOutput: "Sure, photosynthesis is...",
      systemPrompt: "You are a tutor.",
    });
    const [rec] = rig.read();
    for (const field of PROMPT_FIELDS) {
      expect(rec?.[field]).toBe("[REDACTED]");
    }
  });

  it("preserves prompt fields when prompts: true", () => {
    rig = makeRig({ allowPrompts: true });
    rig.log.info("model.call", {
      prompt: "Hello",
      systemPrompt: "Be brief.",
    });
    const [rec] = rig.read();
    expect(rec?.prompt).toBe("Hello");
    expect(rec?.systemPrompt).toBe("Be brief.");
  });

  it("ignores absent prompt fields without copying the object", () => {
    rig = makeRig({ allowPrompts: false });
    rig.log.info("ok", { messageLength: 42, tokens: 10 });
    const [rec] = rig.read();
    expect(rec?.messageLength).toBe(42);
    expect(rec?.tokens).toBe(10);
  });

  it("only redacts named prompt fields, leaving siblings intact", () => {
    rig = makeRig({ allowPrompts: false });
    rig.log.info("mixed", { prompt: "secret", count: 3, name: "tutor" });
    const [rec] = rig.read();
    expect(rec?.prompt).toBe("[REDACTED]");
    expect(rec?.count).toBe(3);
    expect(rec?.name).toBe("tutor");
  });
});

describe("ingestRendererRecord", () => {
  it("emits at the record's level with its message + fields", () => {
    rig = makeRig();
    const record: LogRecord = {
      level: "warn",
      time: 1700000000000,
      message: "renderer.thing",
      fields: { foo: "bar" },
    };
    rig.log.ingestRendererRecord(record);
    const [rec] = rig.read();
    expect(rec?.level).toBe("warn");
    expect(rec?.msg).toBe("renderer.thing");
    expect(rec?.foo).toBe("bar");
  });

  it("tags ingested records with source: 'renderer'", () => {
    rig = makeRig();
    rig.log.ingestRendererRecord({ level: "info", time: 0, message: "x" });
    const [rec] = rig.read();
    expect(rec?.source).toBe("renderer");
  });

  it("preserves renderer-supplied bindings alongside source", () => {
    rig = makeRig();
    rig.log.ingestRendererRecord({
      level: "info",
      time: 0,
      message: "renderer.act",
      bindings: { component: "renderer", route: "/library" },
    });
    const [rec] = rig.read();
    expect(rec?.source).toBe("renderer");
    expect(rec?.component).toBe("renderer");
    expect(rec?.route).toBe("/library");
  });

  it("redacts secrets in renderer-supplied fields", () => {
    rig = makeRig();
    rig.log.ingestRendererRecord({
      level: "warn",
      time: 0,
      message: "renderer.config",
      fields: { apiKey: "sk-leaked" },
    });
    const [rec] = rig.read();
    expect(rec?.apiKey).toBe("[REDACTED]");
  });

  it("redacts prompt fields in renderer-supplied fields when prompts:false", () => {
    rig = makeRig({ allowPrompts: false });
    rig.log.ingestRendererRecord({
      level: "info",
      time: 0,
      message: "renderer.prompt",
      fields: { prompt: "secret-prompt" },
    });
    const [rec] = rig.read();
    expect(rec?.prompt).toBe("[REDACTED]");
  });

  it("preserves prompt fields when prompts:true", () => {
    rig = makeRig({ allowPrompts: true });
    rig.log.ingestRendererRecord({
      level: "info",
      time: 0,
      message: "renderer.prompt",
      fields: { prompt: "ok-to-show" },
    });
    const [rec] = rig.read();
    expect(rec?.prompt).toBe("ok-to-show");
  });
});

// ── Smoke test against the real createMainLogger ─────────────────────────────
//
// This exercises the production transport pipeline (worker thread + pino-roll +
// pino/file). We keep it deliberately small — one assertion per concern — to
// limit flake from the worker startup and Vitest stdio interaction. Most
// behavior is exhaustively tested above via wrapPinoForTesting.

describe("createMainLogger (smoke)", () => {
  let smokeDir: string;
  let smokeFile: string;

  beforeEach(() => {
    smokeDir = mkdtempSync(join(tmpdir(), "praxis-logger-smoke-"));
    smokeFile = join(smokeDir, "praxis.log");
  });

  afterEach(() => {
    rmSync(smokeDir, { recursive: true, force: true });
  });

  function smokeOpts(overrides: Partial<MainLoggerOptions> = {}): MainLoggerOptions {
    return {
      level: "info",
      filePath: smokeFile,
      maxFileSizeMb: 10,
      maxFiles: 3,
      pretty: false,
      prompts: false,
      ...overrides,
    };
  }

  it("creates the log file directory automatically", async () => {
    const nested = join(smokeDir, "a", "b", "c", "praxis.log");
    // mkdirSync on the parent runs synchronously inside createMainLogger;
    // when the path is missing we'd throw without it.
    const log = await createMainLogger(smokeOpts({ filePath: nested }));
    log.info("dir.created");
    // The directory must exist after construction.
    const { existsSync, statSync } = await import("node:fs");
    const dirOf = join(smokeDir, "a", "b", "c");
    expect(existsSync(dirOf)).toBe(true);
    expect(statSync(dirOf).isDirectory()).toBe(true);
    await log.shutdown();
  });

  it("shutdown resolves without throwing", async () => {
    const log = await createMainLogger(smokeOpts());
    log.info("smoke");
    await expect(log.shutdown()).resolves.toBeUndefined();
  });

  it("shutdown is safe when no records were emitted", async () => {
    const log = await createMainLogger(smokeOpts());
    await expect(log.shutdown()).resolves.toBeUndefined();
  });

  it("actually writes records to the file (pino-roll in-process)", async () => {
    const log = await createMainLogger(smokeOpts({ pretty: false }));
    log.info("file.write.test", { ok: true });
    log.warn("file.write.warn");
    await log.shutdown();

    // pino-roll appends `.1` (or higher) to the base filename. Find any file
    // produced under the smoke dir and assert it has both records.
    const { readdirSync, readFileSync, statSync } = await import("node:fs");
    const entries = readdirSync(smokeDir).filter((e) => e.startsWith("praxis.log"));
    expect(entries.length).toBeGreaterThan(0);
    let totalSize = 0;
    let combinedContent = "";
    for (const e of entries) {
      const p = join(smokeDir, e);
      totalSize += statSync(p).size;
      combinedContent += readFileSync(p, "utf8");
    }
    expect(totalSize).toBeGreaterThan(0);
    expect(combinedContent).toContain("file.write.test");
    expect(combinedContent).toContain("file.write.warn");
  });
});
