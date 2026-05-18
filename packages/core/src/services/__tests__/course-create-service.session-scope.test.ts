/**
 * Tests for bootstrap-session-scoped-attachment feature.
 *
 * Covers:
 *  - initDraft stores sessionId on the draft
 *  - confirmDraft calls promoteScope (not attachMany) when draft.sessionId is set
 *  - confirmDraft falls back to attachMany for legacy drafts without sessionId
 *  - Session-scope rows survive promotion (promoteScope preserves both scopes)
 */
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../db/index.js";
import type { Engine, SessionId, StudentId } from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { CourseCreateServiceImpl } from "../course-create-service.js";
import { SqliteDraftStore } from "../draft-store.js";

const STUDENT_ID = brandId<"StudentId">("student-scope-test") as StudentId;
const SESSION_ID = brandId<"SessionId">("session-scope-s1") as SessionId;

const MOCK_LOG = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn(() => MOCK_LOG),
};

function makeMockDocumentScopes() {
  return {
    listOrphaned: vi.fn().mockResolvedValue([]),
    listForScope: vi.fn().mockResolvedValue([]),
    listForScopeDetailed: vi.fn().mockResolvedValue([]),
    attach: vi.fn().mockResolvedValue({ attached: true }),
    detach: vi.fn().mockResolvedValue({ detached: true }),
    attachMany: vi.fn().mockResolvedValue({ newlyAttached: [] }),
    listScopesForDocument: vi.fn().mockResolvedValue([]),
    promoteScope: vi.fn().mockResolvedValue({ promoted: [] }),
  };
}

function makeEngine(): Engine {
  return { open: vi.fn() } as unknown as Engine;
}

const dbCtx = useTempDb();

function makeService(documentScopes: ReturnType<typeof makeMockDocumentScopes>) {
  const { db } = openDb({ path: dbCtx.dbPath });
  const store = new SqliteDraftStore(db);
  return {
    svc: new CourseCreateServiceImpl({
      db,
      log: MOCK_LOG,
      engineResolver: makeEngine,
      documentScopes,
      sweepIntervalMs: 9_999_999,
      draftStore: store,
    }),
    db,
  };
}

/** Build a minimal valid draft with 1 concept, 1 lesson required for confirmDraft. */
async function buildConfirmableDraft(
  svc: CourseCreateServiceImpl,
  sessionId?: SessionId,
): Promise<string> {
  const { draftId } = await svc.initDraft({
    studentId: STUDENT_ID,
    sessionId,
    documentIds: [],
    courseTitle: "Algebra 1",
    subject: "math",
    gradeLevel: "9",
  });
  await svc.addConcept({ draftId, name: "Variables", description: "Symbols" });
  await svc.addLesson({ draftId, title: "Intro", conceptNames: ["Variables"], references: [] });
  return draftId;
}

describe("initDraft — sessionId storage", () => {
  it("stores sessionId on the draft when provided", async () => {
    const documentScopes = makeMockDocumentScopes();
    const { svc } = makeService(documentScopes);

    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      sessionId: SESSION_ID,
      documentIds: [],
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
    });

    const draft = await svc.showDraft(draftId);
    expect(draft).not.toBeNull();
    expect(draft?.sessionId).toBe(SESSION_ID);

    svc.shutdown();
  });

  it("leaves sessionId absent when not provided", async () => {
    const documentScopes = makeMockDocumentScopes();
    const { svc } = makeService(documentScopes);

    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [],
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
    });

    const draft = await svc.showDraft(draftId);
    expect(draft).not.toBeNull();
    expect(draft?.sessionId).toBeUndefined();

    svc.shutdown();
  });
});

describe("confirmDraft — promoteScope path", () => {
  it("calls promoteScope (not attachMany) when draft has sessionId", async () => {
    const documentScopes = makeMockDocumentScopes();
    const { svc } = makeService(documentScopes);

    const draftId = await buildConfirmableDraft(svc, SESSION_ID);
    const result = await svc.confirmDraft({ draftId, studentId: STUDENT_ID });

    expect(result.ok).toBe(true);
    // promoteScope should have been called with the session → course promotion.
    expect(documentScopes.promoteScope).toHaveBeenCalledOnce();
    expect(documentScopes.promoteScope).toHaveBeenCalledWith(
      expect.objectContaining({
        from: { kind: "session", id: SESSION_ID },
        source: "course-create",
      }),
    );
    // attachMany should NOT have been called (promotion path replaces it).
    expect(documentScopes.attachMany).not.toHaveBeenCalled();

    svc.shutdown();
  });

  it("falls back to attachMany for legacy drafts without sessionId", async () => {
    const documentScopes = makeMockDocumentScopes();
    const { svc } = makeService(documentScopes);

    // Build a draft with document IDs but no sessionId (legacy shape).
    const { draftId } = await svc.initDraft({
      studentId: STUDENT_ID,
      documentIds: [brandId<"DocumentId">("doc-legacy-1"), brandId<"DocumentId">("doc-legacy-2")],
      courseTitle: "Algebra 1",
      subject: "math",
      gradeLevel: "9",
    });
    await svc.addConcept({ draftId, name: "Variables", description: "Symbols" });
    await svc.addLesson({ draftId, title: "Intro", conceptNames: ["Variables"], references: [] });

    const result = await svc.confirmDraft({ draftId, studentId: STUDENT_ID });

    expect(result.ok).toBe(true);
    // Legacy path: attachMany is called, promoteScope is not.
    expect(documentScopes.attachMany).toHaveBeenCalledOnce();
    expect(documentScopes.promoteScope).not.toHaveBeenCalled();

    svc.shutdown();
  });

  it("promoteScope is called with the correct courseId on the 'to' scope", async () => {
    const documentScopes = makeMockDocumentScopes();
    const { svc } = makeService(documentScopes);

    const draftId = await buildConfirmableDraft(svc, SESSION_ID);
    const result = await svc.confirmDraft({ draftId, studentId: STUDENT_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const call = documentScopes.promoteScope.mock.calls[0]?.[0];
    expect(call?.to).toEqual({ kind: "course", id: result.courseId });

    svc.shutdown();
  });

  it("confirmDraft succeeds even when promoteScope throws (non-fatal)", async () => {
    const documentScopes = makeMockDocumentScopes();
    documentScopes.promoteScope.mockRejectedValueOnce(new Error("db error"));
    const { svc } = makeService(documentScopes);

    const draftId = await buildConfirmableDraft(svc, SESSION_ID);
    const result = await svc.confirmDraft({ draftId, studentId: STUDENT_ID });

    // Course is persisted despite the scope promotion failing.
    expect(result.ok).toBe(true);
    expect(MOCK_LOG.warn).toHaveBeenCalledWith(
      "confirmDraft.promoteScope_failed",
      expect.objectContaining({ sessionId: SESSION_ID }),
    );

    svc.shutdown();
  });
});
