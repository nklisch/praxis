/**
 * Tests for the PRAXIS_DEV dev-mode prompt-fragment gate in EngineSessionManager.
 *
 * Two approaches are used:
 *
 * A) Direct compose test — verifies that devModeFragment integrates correctly
 *    with composeSystemPromptWithAttribution when supplied as an additionalFragment.
 *    This tests the fragment's content and position without any engine deps.
 *
 * B) Gate test — verifies that EngineSessionManager.openActive() passes
 *    devModeFragment to composeSystemPrompt when PRAXIS_DEV === "true" and
 *    omits it when the env var is absent. Exercises the actual gate logic.
 */

import { composeSystemPromptWithAttribution } from "@praxis/curriculum/brief";
import { devModeFragment } from "@praxis/curriculum/modes";
import { sessions } from "@praxis/memory/schema";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../../tests/helpers/db-setup.js";
import {
  inMemorySecretStorage,
  noopDocumentScopes,
  noopLogger,
} from "../../../../../../tests/helpers/mocks.js";
import { openDb } from "../../../db/index.js";
import type {
  Engine,
  EngineOpenOptions,
  EngineSession,
  Mode,
  SessionId,
  StudentId,
} from "../../../types/index.js";
import { getOrCreateDefaultStudentId } from "../../student.js";
import type { EngineSessionManagerDeps } from "../engine-session-manager.js";
import { EngineSessionManager } from "../engine-session-manager.js";

// ── shared helpers (mirrors engine-session-manager.test.ts) ──────────────────

const dbCtx = useTempDb();

/** Minimal Mode with no promptFragments — composeSystemPrompt tolerates this. */
function makeMode(id = "teach"): Mode {
  return {
    id,
    label: "Teach",
    displayName: "teach",
    description: "Open tutoring session.",
    requiredRole: "student",
    uiSurface: "chat",
    toolNames: [],
    promptFragments: [],
  };
}

function makeFakeHandle(): EngineSession {
  return {
    id: "fake-engine-session",
    send: vi.fn().mockImplementation(async function* () {}),
    close: vi.fn().mockResolvedValue(undefined),
  };
}

function makeFakeEngine(handle: EngineSession): Engine {
  const openSpy = vi.fn().mockImplementation(async (opts: EngineOpenOptions) => {
    opts.onEngineSessionReady?.("fake-engine-session-id");
    return handle;
  });
  return {
    id: "fake-engine",
    kind: "looped" as const,
    health: vi.fn().mockResolvedValue({ ok: true }),
    open: openSpy,
  } as unknown as Engine;
}

function makeDeps(
  db: ReturnType<typeof openDb>["db"],
  engineFactory: EngineSessionManagerDeps["engineFactory"],
): EngineSessionManagerDeps {
  return {
    db,
    log: noopLogger(),
    secretStorage: inMemorySecretStorage(),
    toolDefinitions: [],
    // biome-ignore lint/suspicious/noExplicitAny: minimal stub — only documentScopes.listForScope is exercised
    toolServices: { documentScopes: noopDocumentScopes() } as any,
    indexerOrchestrator: undefined,
    activity: undefined,
    subAgent: undefined,
    promptCustomization: undefined,
    engineFactory,
  };
}

function insertSession(
  db: ReturnType<typeof openDb>["db"],
  sessionId: string,
  studentId: StudentId,
): void {
  db.insert(sessions)
    .values({
      id: sessionId,
      studentId,
      modeId: "teach",
      engineId: "test-engine",
      startedAt: new Date(),
    })
    .run();
}

// ── Path A: fragment shape + direct compose ──────────────────────────────────

describe("devModeFragment — shape", () => {
  it("has id 'dev.agent-feedback'", () => {
    expect(devModeFragment.id).toBe("dev.agent-feedback");
  });

  it("is positioned at 'postamble' (last FRAGMENT_ORDER slot)", () => {
    expect(devModeFragment.position).toBe("postamble");
  });

  it("is not customizable (dev contract must not be user-overridable)", () => {
    expect(devModeFragment.customizable).toBe(false);
  });

  it("template contains 'Dev mode' heading", () => {
    expect(devModeFragment.template).toContain("Dev mode");
  });

  it("template mentions 'dev.report_issue'", () => {
    expect(devModeFragment.template).toContain("dev.report_issue");
  });

  it("template mentions output location '.praxis/dev-reports/'", () => {
    expect(devModeFragment.template).toContain(".praxis/dev-reports/");
  });
});

describe("devModeFragment — compose integration (Path A)", () => {
  it("appears in composed prompt when supplied as an additionalFragment", () => {
    const mode = makeMode();
    const { prompt } = composeSystemPromptWithAttribution({
      mode,
      additionalFragments: [devModeFragment],
    });
    expect(prompt).toContain("Dev mode");
    expect(prompt).toContain("dev.report_issue");
  });

  it("is omitted from composed prompt when not supplied", () => {
    const mode = makeMode();
    const { prompt } = composeSystemPromptWithAttribution({ mode });
    expect(prompt).not.toContain("Dev mode");
    expect(prompt).not.toContain("dev.report_issue");
  });
});

// ── Path B: gate logic in EngineSessionManager.openActive ───────────────────

describe("EngineSessionManager — PRAXIS_DEV gate (Path B)", () => {
  let db: ReturnType<typeof openDb>["db"];
  let studentId: StudentId;

  /** The system prompt captured by the last engine.open() call. */
  let capturedSystemPrompt: string | undefined;

  beforeEach(() => {
    ({ db } = openDb({ path: dbCtx.dbPath }));
    studentId = getOrCreateDefaultStudentId(db);
    capturedSystemPrompt = undefined;
  });

  afterEach(() => {
    // Restore PRAXIS_DEV so it doesn't leak into sibling tests.
    delete process.env.PRAXIS_DEV;
  });

  function makeCapturingFactory(): EngineSessionManagerDeps["engineFactory"] {
    return () => {
      const handle = makeFakeHandle();
      const engine = makeFakeEngine(handle);
      // Wrap open() to capture the systemPrompt argument.
      const original = engine.open.bind(engine);
      vi.spyOn(engine, "open").mockImplementation(async (opts: EngineOpenOptions) => {
        capturedSystemPrompt = opts.systemPrompt;
        return original(opts);
      });
      return engine;
    };
  }

  it("includes 'Dev mode' and 'dev.report_issue' in composed prompt when PRAXIS_DEV=true", async () => {
    process.env.PRAXIS_DEV = "true";
    const sessionId = "dev-gate-on" as SessionId;
    insertSession(db, sessionId, studentId);

    const manager = new EngineSessionManager(makeDeps(db, makeCapturingFactory()));
    await manager.openActive({
      sessionId,
      engineId: "test-engine",
      mode: makeMode(),
      studentId,
      priorTurns: [],
    });

    expect(capturedSystemPrompt).toBeDefined();
    expect(capturedSystemPrompt).toContain("Dev mode");
    expect(capturedSystemPrompt).toContain("dev.report_issue");
  });

  it("excludes 'Dev mode' and 'dev.report_issue' from composed prompt when PRAXIS_DEV is unset", async () => {
    delete process.env.PRAXIS_DEV; // ensure clean state (already done in afterEach too)
    const sessionId = "dev-gate-off" as SessionId;
    insertSession(db, sessionId, studentId);

    const manager = new EngineSessionManager(makeDeps(db, makeCapturingFactory()));
    await manager.openActive({
      sessionId,
      engineId: "test-engine",
      mode: makeMode(),
      studentId,
      priorTurns: [],
    });

    expect(capturedSystemPrompt).toBeDefined();
    expect(capturedSystemPrompt).not.toContain("Dev mode");
    expect(capturedSystemPrompt).not.toContain("dev.report_issue");
  });

  it("excludes fragment when PRAXIS_DEV is set to any value other than 'true'", async () => {
    process.env.PRAXIS_DEV = "1"; // truthy but not === "true"
    const sessionId = "dev-gate-wrong-value" as SessionId;
    insertSession(db, sessionId, studentId);

    const manager = new EngineSessionManager(makeDeps(db, makeCapturingFactory()));
    await manager.openActive({
      sessionId,
      engineId: "test-engine",
      mode: makeMode(),
      studentId,
      priorTurns: [],
    });

    expect(capturedSystemPrompt).toBeDefined();
    expect(capturedSystemPrompt).not.toContain("Dev mode");
    expect(capturedSystemPrompt).not.toContain("dev.report_issue");
  });
});
