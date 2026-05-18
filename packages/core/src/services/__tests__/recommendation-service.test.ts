/**
 * Tests for RecommendationServiceImpl.
 *
 * Per-collector fixture tests, mixed ordering, reason-string content,
 * limit/tie-break determinism.
 */

import {
  courses as coursesTable,
  flashcards,
  lessons as lessonsTable,
} from "@praxis/artifacts/schema";
import { conceptGraphs, concepts as conceptsTable } from "@praxis/curriculum/schema";
import { sessions, studentMastery } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../db/index.js";
import type { ConceptId, CourseId, StudentId, Timestamp } from "../../types/index.js";
import { brandId } from "../../types/index.js";
import type { DraftStore } from "../draft-store.js";
import {
  humanize,
  RecommendationServiceImpl,
  reasonPracticeConcept,
  reasonQuickCheck,
  reasonResumeDraft,
  reasonResumeSession,
  reasonReviewCards,
  scorePracticeConcept,
  scoreResumeDraft,
  scoreResumeSession,
  scoreReviewCards,
} from "../recommendation-service.js";

// ── DB fixture ────────────────────────────────────────────────────────────────

const dbCtx = useTempDb();

function makeLog() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(() => makeLog()),
  };
}

function makeStudentId(): StudentId {
  return brandId<"StudentId">("student-test") as StudentId;
}

function makeNullDraftStore(): DraftStore {
  return {
    load: vi.fn().mockReturnValue(null),
    save: vi.fn(),
    listForStudent: vi.fn().mockReturnValue([]),
    listActive: vi.fn().mockReturnValue([]),
    touch: vi.fn(),
    markConfirmedTx: vi.fn(),
    markDiscarded: vi.fn(),
    sweepStale: vi.fn().mockReturnValue([]),
  };
}

function makeService(draftStore: DraftStore = makeNullDraftStore()) {
  const { db } = openDb({ path: dbCtx.dbPath });
  return {
    service: new RecommendationServiceImpl({ db, log: makeLog(), draftStore }),
    db,
  };
}

function insertSession(
  db: ReturnType<typeof openDb>["db"],
  opts: { studentId: StudentId; startedAt?: Date; modeId?: string },
): string {
  const id = uuidv7();
  db.insert(sessions)
    .values({
      id,
      studentId: opts.studentId,
      modeId: opts.modeId ?? "teach",
      engineId: "direct.anthropic",
      startedAt: opts.startedAt ?? new Date(),
    })
    .run();
  return id;
}

function insertFlashcard(
  db: ReturnType<typeof openDb>["db"],
  opts: { studentId: StudentId; nextReviewAt: Date },
): string {
  const id = uuidv7();
  db.insert(flashcards)
    .values({
      id,
      studentId: opts.studentId,
      front: "Q?",
      back: "A.",
      reviewStateJson: { algorithm: "fsrs", state: {}, reps: 0, lapses: 0 },
      sourceJson: { kind: "user-created" },
      nextReviewAt: opts.nextReviewAt,
    })
    .run();
  return id;
}

function insertMastery(
  db: ReturnType<typeof openDb>["db"],
  opts: { studentId: StudentId; conceptId: ConceptId; pKnownMilli: number },
): void {
  db.insert(studentMastery)
    .values({
      studentId: opts.studentId,
      conceptId: opts.conceptId,
      pKnown: opts.pKnownMilli,
      uncertainty: 200,
      effectivePKnown: opts.pKnownMilli,
      evidenceJson: [],
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [studentMastery.studentId, studentMastery.conceptId],
      set: {
        pKnown: opts.pKnownMilli,
        effectivePKnown: opts.pKnownMilli,
      },
    })
    .run();
}

function insertConceptWithCourse(
  db: ReturnType<typeof openDb>["db"],
  opts: { studentId: StudentId; conceptId?: string },
): { courseId: CourseId; conceptId: ConceptId } {
  const conceptId = opts.conceptId ?? uuidv7();
  const courseId = uuidv7();
  const graphId = uuidv7();

  db.insert(conceptGraphs)
    .values({
      id: graphId,
      source: "canonical",
      name: "test-graph",
      version: "1.0.0",
      createdAt: new Date(),
    })
    .run();

  db.insert(conceptsTable)
    .values({
      id: conceptId,
      graphId,
      name: "Quadratic Equations",
      description: "Solving ax² + bx + c = 0",
      aliasesJson: [],
      standardsTagsJson: [],
    })
    .run();

  db.insert(coursesTable)
    .values({
      id: courseId,
      studentId: opts.studentId,
      title: "Algebra I",
      subject: "math",
      gradeLevel: "9-12",
      sourceJson: { kind: "bootstrapped" },
      conceptGraphId: graphId,
      thresholdsJson: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .run();

  db.insert(lessonsTable)
    .values({
      id: uuidv7(),
      courseId,
      title: "Introduction to Quadratics",
      orderIndex: 0,
      conceptIdsJson: [conceptId],
      referencesJson: [],
      suggestedStrategy: "direct",
      estimatedMinutes: 30,
    })
    .run();

  return {
    courseId: brandId<"CourseId">(courseId),
    conceptId: brandId<"ConceptId">(conceptId),
  };
}

// ── Unit helpers ──────────────────────────────────────────────────────────────

describe("humanize", () => {
  it("returns 'a moment' for very short durations", () => {
    expect(humanize(30_000)).toBe("a moment");
  });

  it("returns minutes for < 60 min", () => {
    expect(humanize(5 * 60_000)).toBe("5 minutes");
  });

  it("returns 'an hour' for exactly 1 hour", () => {
    expect(humanize(60 * 60_000)).toBe("an hour");
  });

  it("returns hours for < 24h", () => {
    expect(humanize(3 * 3_600_000)).toBe("3 hours");
  });

  it("returns 'a day' for 1 day", () => {
    expect(humanize(24 * 3_600_000)).toBe("a day");
  });

  it("returns days for multiple days", () => {
    expect(humanize(3 * 24 * 3_600_000)).toBe("3 days");
  });
});

describe("scoreResumeSession", () => {
  it("base 80 + 10 boost for sessions < 6h ago", () => {
    const now = Date.now();
    const lastTouchedAt = (now - 2 * 3_600_000) as Timestamp; // 2h ago
    expect(scoreResumeSession(lastTouchedAt, now)).toBe(90);
  });

  it("base 80 no boost for sessions 6h–7d ago", () => {
    const now = Date.now();
    const lastTouchedAt = (now - 2 * 24 * 3_600_000) as Timestamp; // 2d ago
    expect(scoreResumeSession(lastTouchedAt, now)).toBe(80);
  });

  it("base 80 − 20 penalty for sessions > 7d ago", () => {
    const now = Date.now();
    const lastTouchedAt = (now - 10 * 24 * 3_600_000) as Timestamp; // 10d ago
    expect(scoreResumeSession(lastTouchedAt, now)).toBe(60);
  });
});

describe("scoreReviewCards", () => {
  it("base 75 for 0 due cards (never called with 0, but handles it)", () => {
    expect(scoreReviewCards(0)).toBe(75);
  });

  it("+5 boost per 10 cards, capped at +20", () => {
    expect(scoreReviewCards(10)).toBe(80);
    expect(scoreReviewCards(20)).toBe(85);
    expect(scoreReviewCards(40)).toBe(95); // capped
    expect(scoreReviewCards(100)).toBe(95); // still capped at +20
  });
});

describe("scorePracticeConcept", () => {
  it("base 60 + gap boost", () => {
    // mastery 0.4, threshold 0.7 → gap 0.3 → boost = round(0.3*50) = 15
    expect(scorePracticeConcept(0.4, 0.7)).toBe(75);
  });

  it("caps boost at 30", () => {
    // mastery 0.0, threshold 0.7 → gap 0.7 → boost = round(0.7*50) = 35 → capped at 30
    expect(scorePracticeConcept(0.0, 0.7)).toBe(90);
  });
});

describe("scoreResumeDraft", () => {
  it("returns 65 if touched < 24h ago", () => {
    const now = Date.now();
    const lastTouchedAt = (now - 2 * 3_600_000) as Timestamp; // 2h ago
    expect(scoreResumeDraft(lastTouchedAt, now)).toBe(65);
  });

  it("returns 55 if touched >= 24h ago", () => {
    const now = Date.now();
    const lastTouchedAt = (now - 2 * 24 * 3_600_000) as Timestamp; // 2d ago
    expect(scoreResumeDraft(lastTouchedAt, now)).toBe(55);
  });
});

describe("reasonResumeSession", () => {
  it("chain-break string for < 6h", () => {
    const now = Date.now();
    const lastTouchedAt = (now - 3_600_000) as Timestamp; // 1h ago
    expect(reasonResumeSession(lastTouchedAt, now)).toBe(
      "Continuing now keeps the chain — coming back tomorrow loses the thread.",
    );
  });

  it("'Paused X' string for >= 6h", () => {
    const now = Date.now();
    const lastTouchedAt = (now - 10 * 3_600_000) as Timestamp; // 10h ago
    const result = reasonResumeSession(lastTouchedAt, now);
    expect(result).toMatch(/^Paused .+\. Pick up where you left off\.$/);
  });
});

describe("reasonReviewCards", () => {
  it("single card due now", () => {
    expect(reasonReviewCards(1, 0)).toBe("1 card ready to review.");
  });

  it("multiple cards due now", () => {
    expect(reasonReviewCards(5, 0)).toBe("5 cards ready to review.");
  });

  it("cards due in 24h (not yet due)", () => {
    expect(reasonReviewCards(0, 3)).toBe("3 cards coming due in the next 24 hours.");
  });
});

describe("reasonPracticeConcept", () => {
  it("formats mastery and threshold as percentages", () => {
    expect(reasonPracticeConcept("Algebra", 0.4, 0.7)).toBe(
      "Algebra mastery 40% (target 70%) — gates next lesson.",
    );
  });
});

describe("reasonResumeDraft", () => {
  it("includes humanized age", () => {
    const now = Date.now();
    const lastTouchedAt = (now - 2 * 3_600_000) as Timestamp; // 2h ago
    expect(reasonResumeDraft(lastTouchedAt, now)).toMatch(/Course-create draft from .+ ago\./);
  });
});

describe("reasonQuickCheck", () => {
  it("includes lesson title", () => {
    expect(reasonQuickCheck("Derivatives")).toBe("Quick check on 'Derivatives' takes ~3 minutes.");
  });
});

// ── Service: per-collector fixtures ──────────────────────────────────────────

describe("RecommendationServiceImpl — resume_session collector", () => {
  // useTempDb() creates a fresh DB per test — no manual clear needed.

  it("returns a resume_session recommendation for an open session", async () => {
    const { service, db } = makeService();
    const studentId = makeStudentId();
    insertSession(db, { studentId });

    const results = await service.next({ studentId });
    const session = results.find((r) => r.kind === "resume_session");
    expect(session).toBeDefined();
    expect(session?.kind).toBe("resume_session");
    expect(session?.score).toBeGreaterThanOrEqual(60);
  });

  it("does not return recommendations for ended sessions", async () => {
    const { service, db } = makeService();
    const studentId = makeStudentId();
    const id = insertSession(db, { studentId });
    // End the session
    db.update(sessions).set({ endedAt: new Date() }).where(eq(sessions.id, id)).run();

    const results = await service.next({ studentId });
    const session = results.find((r) => r.kind === "resume_session");
    expect(session).toBeUndefined();
  });
});

describe("RecommendationServiceImpl — review_cards collector", () => {
  // useTempDb() creates a fresh DB per test — no manual clear needed.

  it("returns a review_cards recommendation when cards are due", async () => {
    const { service, db } = makeService();
    const studentId = makeStudentId();
    const pastDate = new Date(Date.now() - 3_600_000); // 1h ago
    insertFlashcard(db, { studentId, nextReviewAt: pastDate });
    insertFlashcard(db, { studentId, nextReviewAt: pastDate });

    const results = await service.next({ studentId });
    const cards = results.find((r) => r.kind === "review_cards");
    expect(cards).toBeDefined();
    if (cards?.kind === "review_cards") {
      expect(cards.dueNow).toBe(2);
      expect(cards.reason).toBe("2 cards ready to review.");
    }
  });

  it("returns no review_cards when no cards exist", async () => {
    const { service } = makeService();
    const studentId = makeStudentId();
    const results = await service.next({ studentId });
    const cards = results.find((r) => r.kind === "review_cards");
    expect(cards).toBeUndefined();
  });

  it("counts upcoming cards in 24h", async () => {
    const { service, db } = makeService();
    const studentId = makeStudentId();
    const inFuture = new Date(Date.now() + 12 * 3_600_000); // 12h from now
    insertFlashcard(db, { studentId, nextReviewAt: inFuture });

    const results = await service.next({ studentId });
    const cards = results.find((r) => r.kind === "review_cards");
    expect(cards).toBeDefined();
    if (cards?.kind === "review_cards") {
      expect(cards.dueNow).toBe(0);
      expect(cards.dueIn24h).toBe(1);
    }
  });
});

describe("RecommendationServiceImpl — practice_concept collector", () => {
  // useTempDb() creates a fresh DB per test — no manual clear needed.

  it("returns a practice_concept recommendation for low-mastery concept", async () => {
    const { service, db } = makeService();
    const studentId = makeStudentId();
    const { conceptId } = insertConceptWithCourse(db, { studentId });
    insertMastery(db, { studentId, conceptId, pKnownMilli: 300 }); // 30%

    const results = await service.next({ studentId });
    const concept = results.find((r) => r.kind === "practice_concept");
    expect(concept).toBeDefined();
    if (concept?.kind === "practice_concept") {
      expect(concept.mastery).toBeCloseTo(0.3);
      expect(concept.threshold).toBe(0.7);
      expect(concept.reason).toContain("mastery 30%");
      expect(concept.reason).toContain("target 70%");
    }
  });

  it("does not return practice_concept for mastery above threshold", async () => {
    const { service, db } = makeService();
    const studentId = makeStudentId();
    const { conceptId } = insertConceptWithCourse(db, { studentId });
    insertMastery(db, { studentId, conceptId, pKnownMilli: 800 }); // 80%

    const results = await service.next({ studentId });
    const concept = results.find((r) => r.kind === "practice_concept");
    expect(concept).toBeUndefined();
  });
});

describe("RecommendationServiceImpl — resume_draft collector", () => {
  it("returns a resume_draft recommendation for active drafts", async () => {
    const { service } = makeService({
      ...makeNullDraftStore(),
      listForStudent: vi.fn().mockReturnValue([
        {
          draftId: "draft-1",
          studentId: makeStudentId(),
          lastTouchedAt: (Date.now() - 3_600_000) as Timestamp, // 1h ago
          createdAt: (Date.now() - 7_200_000) as Timestamp,
          expiresAt: (Date.now() + 86_400_000) as Timestamp,
          documentIds: [],
          proposed: {
            proposedConcepts: [],
            proposedLessons: [],
            proposedUnits: [],
            thresholds: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
          },
        },
      ]),
    });

    const results = await service.next({ studentId: makeStudentId() });
    const draft = results.find((r) => r.kind === "resume_draft");
    expect(draft).toBeDefined();
    if (draft?.kind === "resume_draft") {
      expect(draft.draftId).toBe("draft-1");
      expect(draft.reason).toMatch(/Course-create draft from .+ ago\./);
      expect(draft.score).toBe(65); // < 24h boost
    }
  });

  it("returns no resume_draft when no active drafts", async () => {
    const { service } = makeService();
    const results = await service.next({ studentId: makeStudentId() });
    const draft = results.find((r) => r.kind === "resume_draft");
    expect(draft).toBeUndefined();
  });
});

// ── Service: ordering and limit ───────────────────────────────────────────────

describe("RecommendationServiceImpl — ordering and limit", () => {
  // useTempDb() creates a fresh DB per test — no manual clear needed.

  it("returns results sorted by score descending", async () => {
    const { service, db } = makeService({
      ...makeNullDraftStore(),
      listForStudent: vi.fn().mockReturnValue([
        {
          draftId: "draft-1",
          studentId: makeStudentId(),
          lastTouchedAt: (Date.now() - 3_600_000) as Timestamp,
          createdAt: (Date.now() - 7_200_000) as Timestamp,
          expiresAt: (Date.now() + 86_400_000) as Timestamp,
          documentIds: [],
          proposed: {
            proposedConcepts: [],
            proposedLessons: [],
            proposedUnits: [],
            thresholds: { conceptMastery: 0.7, examPass: 0.7, allowRetake: true, decayDays: 14 },
          },
        },
      ]),
    });
    const studentId = makeStudentId();

    // Insert a recent session (score 90 = 80+10)
    insertSession(db, { studentId, startedAt: new Date(Date.now() - 3_600_000) });

    // Insert due cards (score 80 = 75+5 with 10 cards)
    for (let i = 0; i < 10; i++) {
      insertFlashcard(db, { studentId, nextReviewAt: new Date(Date.now() - 3_600_000) });
    }

    const results = await service.next({ studentId, limit: 10 });
    // Verify monotonically non-increasing scores
    for (let i = 1; i < results.length; i++) {
      const prev = results[i - 1];
      const curr = results[i];
      if (prev && curr) {
        expect(prev.score).toBeGreaterThanOrEqual(curr.score);
      }
    }
  });

  it("respects the limit parameter", async () => {
    const { service, db } = makeService();
    const studentId = makeStudentId();

    // Insert 5 open sessions
    for (let i = 0; i < 5; i++) {
      insertSession(db, { studentId });
    }

    const results = await service.next({ studentId, limit: 3 });
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it("defaults to limit 5", async () => {
    const { service, db } = makeService();
    const studentId = makeStudentId();

    // Insert 10 open sessions
    for (let i = 0; i < 10; i++) {
      insertSession(db, {
        studentId,
        startedAt: new Date(Date.now() - i * 3_600_000),
      });
    }

    const results = await service.next({ studentId });
    expect(results.length).toBeLessThanOrEqual(5);
  });

  it("tie-break by recency — more recent wins", async () => {
    const { service, db } = makeService();
    const studentId = makeStudentId();
    const now = Date.now();

    // Two sessions started at the same time → same score; older timestamp loses
    const recentTime = new Date(now - 1 * 3_600_000); // 1h ago
    const olderTime = new Date(now - 3 * 3_600_000); // 3h ago
    const recentId = insertSession(db, { studentId, startedAt: recentTime });
    insertSession(db, { studentId, startedAt: olderTime });

    const results = await service.next({ studentId, limit: 10 });
    const sessions = results.filter((r) => r.kind === "resume_session");
    expect(sessions.length).toBe(2);
    // Both have the same score (90 since both < 6h); the recent one should come first
    expect(
      sessions[0]?.kind === "resume_session" && (sessions[0] as { sessionId: string }).sessionId,
    ).toBe(recentId);
  });
});
