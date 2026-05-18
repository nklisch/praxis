/**
 * Integration tests for SessionServiceImpl.spawnFromNote().
 *
 * Validates:
 *   - Returns a SessionHandle for a valid note with a feynman body.
 *   - Returns a SessionHandle for a valid note with a cornell body.
 *   - Throws when the note is not found.
 *   - Handles missing cueId gracefully (falls back to index 0).
 *   - Handles an explicit cueId index.
 *
 * Strategy: insert note rows directly via NotesServiceImpl, then call
 * spawnFromNote. The engine is stubbed with a fake that yields a single
 * `final` event so start() completes without real LLM calls.
 */

import { notes } from "@praxis/artifacts/schema";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../tests/helpers/db-setup.js";
import { inMemorySecretStorage } from "../../../../tests/helpers/mocks.js";
import { openDb } from "../db/index.js";
import { SessionServiceImpl } from "../services/session-service.js";
import { getOrCreateDefaultStudentId } from "../services/student.js";
import type { ServiceDeps } from "../services/types.js";
import type { Engine, EngineEvent } from "../types/index.js";
import { brandId } from "../types/index.js";

const dbCtx = useTempDb();

// ── helpers ───────────────────────────────────────────────────────────────────

function makeLog() {
  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => log),
  };
  return log;
}

function makeMode(id: string) {
  return {
    id,
    label: id,
    displayName: id,
    description: "",
    requiredRole: "student" as const,
    uiSurface: "chat" as const,
    toolNames: [],
    promptFragments: [],
  };
}

/** Build a SessionServiceImpl with a fake engine that yields a single final event. */
function makeService(db: ReturnType<typeof openDb>["db"]): SessionServiceImpl {
  const log = makeLog();

  async function* fakeSend(): AsyncIterable<EngineEvent> {
    yield { type: "final", usage: { inputTokens: 1, outputTokens: 1 } };
  }

  const fakeEngineHandle = {
    id: "fake-handle",
    send: vi.fn().mockImplementation(fakeSend),
    close: vi.fn().mockResolvedValue(undefined),
  };

  const fakeEngine: Engine = {
    id: "fake-engine",
    kind: "single-shot" as const,
    health: vi.fn().mockResolvedValue({
      ok: true,
      capabilities: { vision: false, streaming: false, nativeMCP: false, contextWindow: 4096 },
    }),
    open: vi.fn().mockResolvedValue(fakeEngineHandle),
  } as unknown as Engine;

  const deps: ServiceDeps = {
    db,
    log,
    modes: new Map([["teach", makeMode("teach")]]),
    toolDefinitions: [],
    toolServices: {
      documentScopes: { listForScope: vi.fn().mockResolvedValue([]) },
      // biome-ignore lint/suspicious/noExplicitAny: test stub — spawnFromNote only touches notes + start
    } as any,
    lockService: {
      isSet: async () => false,
      isUnlocked: async () => true,
      setLockCode: async () => {},
      unlock: async () => ({ ok: true }),
      lock: async () => {},
      clearLock: async () => {},
    },
    engineFactory: () => fakeEngine,
    secretStorage: inMemorySecretStorage(),
  };

  return new SessionServiceImpl(deps);
}

/** Insert a raw note row and return its id. */
function insertNote(
  db: ReturnType<typeof openDb>["db"],
  studentId: string,
  format: "feynman" | "cornell",
  body: unknown,
): string {
  const id = uuidv7();
  const now = new Date();
  db.insert(notes)
    .values({
      id,
      studentId,
      contextJson: {},
      format,
      body: JSON.stringify(body),
      sketchSceneJson: null,
      linksJson: [],
      createdAt: now,
      updatedAt: now,
    })
    .run();
  return id;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SessionServiceImpl.spawnFromNote", () => {
  let db: ReturnType<typeof openDb>["db"];
  let studentId: string;

  beforeEach(() => {
    ({ db } = openDb({ path: dbCtx.dbPath }));
    studentId = getOrCreateDefaultStudentId(db);
  });

  it("returns a SessionHandle for a feynman note (no cueId → first followUp)", async () => {
    const body = {
      kind: "feynman",
      explanation: "Plants convert sunlight to energy.",
      followUps: ["Why is chlorophyll green?", "What happens at night?"],
    };
    const noteId = insertNote(db, studentId, "feynman", body);
    const svc = makeService(db);

    const handle = await svc.spawnFromNote({
      studentId: brandId<"StudentId">(studentId),
      noteId: brandId<"NoteId">(noteId),
    });

    expect(handle.sessionId).toBeTruthy();
    expect(handle.modeId).toBe("teach");
  });

  it("returns a SessionHandle for a feynman note with explicit cueId", async () => {
    const body = {
      kind: "feynman",
      explanation: "Plants convert sunlight to energy.",
      followUps: ["Why is chlorophyll green?", "What happens at night?"],
    };
    const noteId = insertNote(db, studentId, "feynman", body);
    const svc = makeService(db);

    const handle = await svc.spawnFromNote({
      studentId: brandId<"StudentId">(studentId),
      noteId: brandId<"NoteId">(noteId),
      cueId: "1",
    });

    expect(handle.sessionId).toBeTruthy();
    expect(handle.modeId).toBe("teach");
  });

  it("returns a SessionHandle for a cornell note (no cueId → first question)", async () => {
    const body = {
      kind: "cornell",
      questions: ["What is photosynthesis?", "What is chlorophyll?"],
      details: ["Process of converting light to sugar", "Green pigment in plants"],
      summary: "Plants use light energy.",
    };
    const noteId = insertNote(db, studentId, "cornell", body);
    const svc = makeService(db);

    const handle = await svc.spawnFromNote({
      studentId: brandId<"StudentId">(studentId),
      noteId: brandId<"NoteId">(noteId),
    });

    expect(handle.sessionId).toBeTruthy();
    expect(handle.modeId).toBe("teach");
  });

  it("throws when the note does not exist", async () => {
    const svc = makeService(db);
    const missingId = brandId<"NoteId">(uuidv7());

    await expect(
      svc.spawnFromNote({
        studentId: brandId<"StudentId">(studentId),
        noteId: missingId,
      }),
    ).rejects.toThrow("Note not found");
  });

  it("falls back to default studentId when not supplied", async () => {
    const body = {
      kind: "feynman",
      explanation: "Gravity pulls objects together.",
      followUps: ["How strong is gravity?"],
    };
    const noteId = insertNote(db, studentId, "feynman", body);
    const svc = makeService(db);

    // No studentId — service resolves getOrCreateDefaultStudentId internally.
    const handle = await svc.spawnFromNote({
      noteId: brandId<"NoteId">(noteId),
    });

    expect(handle.sessionId).toBeTruthy();
    expect(handle.modeId).toBe("teach");
  });
});
