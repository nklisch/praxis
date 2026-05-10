/**
 * Phase 18: Routing-integration tests — pure-function router.
 *
 * Covers every acceptance-criteria branch from the story:
 *  - No procedural / no affective → lesson-default strategy, hint: normal, transition: null.
 *  - Frustration spike → hint: easier AND strategy forced to "worked-examples".
 *  - Sustained ease (full window) → hint: harder.
 *  - Sustained high frustration → transition: study-skills.
 *  - Procedural preference with evidenceCount >= 5 → that strategy wins (non-frustration case).
 *  - Procedural preference with evidenceCount < 5 → fallback to lesson default.
 *  - Empty recentAffect → hint: normal, transition: null even when baseline is provided.
 *  - Procedural preference below proceduralMinPreference → fallback to lesson default.
 */
import type {
  ConceptId,
  ConceptStateRow,
  Course,
  CourseId,
  CourseStateSnapshot,
  Lesson,
  LessonId,
  StudentId,
  Timestamp,
} from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { DEFAULT_ROUTER_CONFIG } from "../config.js";
import { suggestNext } from "../router.js";
import type { RouterInput } from "../types.js";

// ─── Fixture helpers ──────────────────────────────────────────────────────────

const STUDENT_ID = brandId<"StudentId">("student-ri") as StudentId;
const COURSE_ID = brandId<"CourseId">("course-ri") as CourseId;
const NOW = 1_000_000_000 as Timestamp;

function makeLesson(id: string, conceptIds: ConceptId[], strategy = "explain-examples"): Lesson {
  return {
    id: brandId<"LessonId">(id) as LessonId,
    courseId: COURSE_ID,
    title: `Lesson ${id}`,
    conceptIds,
    references: [],
    suggestedStrategy: brandId(strategy),
    estimatedMinutes: 30,
  };
}

function makeConcept(id: string, lessonId: string, studied = false): ConceptStateRow {
  return {
    conceptId: brandId<"ConceptId">(id) as ConceptId,
    name: `Concept ${id}`,
    description: `Description of ${id}`,
    studied,
    lessonId: brandId<"LessonId">(lessonId) as LessonId,
  };
}

function makeCourse(): Course {
  return {
    id: COURSE_ID,
    studentId: STUDENT_ID,
    title: "Test Course",
    subject: brandId("math"),
    gradeLevel: "9-12",
    source: { kind: "authored", authorRole: "self-directed" },
    lessons: [],
    conceptGraphId: brandId("graph-ri"),
    gates: [],
    thresholds: { conceptMastery: 0.8, examPass: 0.7, allowRetake: true, decayDays: 30 },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeSnapshot(lesson: Lesson, concepts: ConceptStateRow[]): CourseStateSnapshot {
  const lessonId = lesson.id as LessonId;
  const conceptsByLesson = new Map([[lessonId, concepts]]);
  return {
    course: makeCourse(),
    lessons: [lesson],
    currentLesson: lesson,
    conceptsByLesson,
    conceptsById: new Map(concepts.map((c) => [c.conceptId, c])),
    gates: [],
    activeGate: null,
    visibilityWindow: { currentLessonIndex: 0, remainingCount: 0 },
  };
}

function makeBaseInput(overrides: Partial<RouterInput> = {}): RouterInput {
  const lessonId = "l1";
  const conceptId = "c1";
  const lesson = makeLesson(lessonId, [brandId<"ConceptId">(conceptId) as ConceptId]);
  const concept = makeConcept(conceptId, lessonId);
  const snapshot = makeSnapshot(lesson, [concept]);

  return {
    snapshot,
    masteryByConceptId: new Map(),
    uncertaintyByConceptId: new Map(),
    lastPracticedByConceptId: new Map(),
    now: NOW,
    decayDays: 30,
    ...overrides,
  };
}

// ─── Baseline samples helpers ─────────────────────────────────────────────────

const NEUTRAL_BASELINE = { engagement: 0.6, frustration: 0.3, confidence: 0.5 };

/** 3 samples that represent a frustration spike (avg frustration = 0.6 > 0.3 + 0.2). */
const FRUSTRATION_SPIKE_SAMPLES = [
  { engagement: 0.4, frustration: 0.6, confidence: 0.3 },
  { engagement: 0.4, frustration: 0.6, confidence: 0.3 },
  { engagement: 0.4, frustration: 0.6, confidence: 0.3 },
];

/** 3 samples that represent sustained ease (low frustration, high confidence). */
const EASE_SAMPLES = [
  { engagement: 0.8, frustration: 0.1, confidence: 0.8 },
  { engagement: 0.8, frustration: 0.1, confidence: 0.8 },
  { engagement: 0.8, frustration: 0.1, confidence: 0.8 },
];

/** 3 samples with frustration > 0.3 + 0.3 = 0.6 (triggers study-skills). */
const HIGH_FRUSTRATION_SAMPLES = [
  { engagement: 0.3, frustration: 0.65, confidence: 0.2 },
  { engagement: 0.3, frustration: 0.65, confidence: 0.2 },
  { engagement: 0.3, frustration: 0.65, confidence: 0.2 },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Phase 18: suggestNext routing-integration", () => {
  describe("no procedural / no affective", () => {
    it("emits lesson-default strategy when neither proceduralStrategies nor affective data provided", () => {
      const lesson = makeLesson("l1", [brandId<"ConceptId">("c1") as ConceptId], "socratic");
      const concept = makeConcept("c1", "l1");
      const snapshot = makeSnapshot(lesson, [concept]);
      const input: RouterInput = {
        snapshot,
        masteryByConceptId: new Map(),
        uncertaintyByConceptId: new Map(),
        lastPracticedByConceptId: new Map(),
        now: NOW,
        decayDays: 30,
        // proceduralStrategies and affectiveBaseline / recentAffect deliberately omitted
      };

      const result = suggestNext(input);

      expect(result.suggestedStrategy).toBe("socratic");
      expect(result.difficultyHint).toBe("normal");
      expect(result.suggestedModeTransition).toBeNull();
    });

    it("falls back to worked-examples when no lesson strategy and no procedural data", () => {
      // snapshot.currentLesson === null → early return path
      const lesson = makeLesson("l1", [brandId<"ConceptId">("c1") as ConceptId]);
      const concept = makeConcept("c1", "l1", true);
      const snapshot: CourseStateSnapshot = {
        ...makeSnapshot(lesson, [concept]),
        currentLesson: null,
      };
      const input: RouterInput = {
        snapshot,
        masteryByConceptId: new Map([["c1", 0.95]]),
        uncertaintyByConceptId: new Map(),
        lastPracticedByConceptId: new Map(),
        now: NOW,
        decayDays: 30,
      };

      const result = suggestNext(input);

      expect(result.primary).toBeNull();
      expect(result.suggestedStrategy).toBe("worked-examples");
      expect(result.difficultyHint).toBe("normal");
      expect(result.suggestedModeTransition).toBeNull();
    });
  });

  describe("frustration spike", () => {
    it("returns difficultyHint: easier and forces worked-examples strategy", () => {
      // Lesson wants "socratic", procedural prefers "socratic" with high evidence,
      // but frustration spike overrides both.
      const lesson = makeLesson("l1", [brandId<"ConceptId">("c1") as ConceptId], "socratic");
      const concept = makeConcept("c1", "l1");
      const snapshot = makeSnapshot(lesson, [concept]);
      const input: RouterInput = {
        snapshot,
        masteryByConceptId: new Map(),
        uncertaintyByConceptId: new Map(),
        lastPracticedByConceptId: new Map(),
        now: NOW,
        decayDays: 30,
        proceduralStrategies: new Map([["socratic", { preference: 0.9, evidenceCount: 10 }]]),
        affectiveBaseline: NEUTRAL_BASELINE,
        recentAffect: FRUSTRATION_SPIKE_SAMPLES,
      };

      const result = suggestNext(input);

      expect(result.difficultyHint).toBe("easier");
      expect(result.suggestedStrategy).toBe("worked-examples");
      // No study-skills because frustrationSpikeDelta (0.2) < studySkillsFrustrationDelta (0.3)
      // avg frustration 0.6 > baseline 0.3 + 0.2 = 0.5 → spike; but 0.6 < 0.3 + 0.3 = 0.6 → NOT sustained high
      // (0.6 is not strictly greater than 0.6, so no study-skills)
      expect(result.suggestedModeTransition).toBeNull();
    });

    it("frustration spike takes precedence over strong procedural preference", () => {
      const lesson = makeLesson(
        "l1",
        [brandId<"ConceptId">("c1") as ConceptId],
        "explain-examples",
      );
      const concept = makeConcept("c1", "l1");
      const snapshot = makeSnapshot(lesson, [concept]);
      const input: RouterInput = {
        snapshot,
        masteryByConceptId: new Map(),
        uncertaintyByConceptId: new Map(),
        lastPracticedByConceptId: new Map(),
        now: NOW,
        decayDays: 30,
        proceduralStrategies: new Map([
          ["guided-inquiry", { preference: 0.95, evidenceCount: 20 }],
        ]),
        affectiveBaseline: NEUTRAL_BASELINE,
        recentAffect: FRUSTRATION_SPIKE_SAMPLES,
      };

      const result = suggestNext(input);

      // Frustration trumps procedural
      expect(result.suggestedStrategy).toBe("worked-examples");
      expect(result.difficultyHint).toBe("easier");
    });
  });

  describe("sustained ease", () => {
    it("returns difficultyHint: harder when 3-sample window shows low frustration and high confidence", () => {
      const input = makeBaseInput({
        affectiveBaseline: NEUTRAL_BASELINE,
        recentAffect: EASE_SAMPLES,
      });

      const result = suggestNext(input);

      expect(result.difficultyHint).toBe("harder");
      expect(result.suggestedModeTransition).toBeNull();
    });

    it("does NOT return harder when window has fewer than affectWindowSize samples", () => {
      const input = makeBaseInput({
        affectiveBaseline: NEUTRAL_BASELINE,
        recentAffect: EASE_SAMPLES.slice(0, 2), // only 2 of 3 required
      });

      const result = suggestNext(input);

      // Partial window → no sustained ease
      expect(result.difficultyHint).toBe("normal");
    });
  });

  describe("sustained high frustration", () => {
    it("returns suggestedModeTransition: study-skills when sustained high frustration", () => {
      const input = makeBaseInput({
        affectiveBaseline: NEUTRAL_BASELINE,
        recentAffect: HIGH_FRUSTRATION_SAMPLES,
      });

      const result = suggestNext(input);

      expect(result.suggestedModeTransition).toBe("study-skills");
      // Also a spike, so easier
      expect(result.difficultyHint).toBe("easier");
      // And frustration overrides strategy
      expect(result.suggestedStrategy).toBe("worked-examples");
    });

    it("does NOT suggest study-skills when window is incomplete", () => {
      const input = makeBaseInput({
        affectiveBaseline: NEUTRAL_BASELINE,
        recentAffect: HIGH_FRUSTRATION_SAMPLES.slice(0, 2),
      });

      const result = suggestNext(input);

      expect(result.suggestedModeTransition).toBeNull();
    });
  });

  describe("procedural preference honored", () => {
    it("uses procedural strategy when evidenceCount >= proceduralMinEvidence and preference >= proceduralMinPreference", () => {
      const lesson = makeLesson("l1", [brandId<"ConceptId">("c1") as ConceptId], "worked-examples");
      const concept = makeConcept("c1", "l1");
      const snapshot = makeSnapshot(lesson, [concept]);
      const input: RouterInput = {
        snapshot,
        masteryByConceptId: new Map(),
        uncertaintyByConceptId: new Map(),
        lastPracticedByConceptId: new Map(),
        now: NOW,
        decayDays: 30,
        proceduralStrategies: new Map([["socratic", { preference: 0.8, evidenceCount: 10 }]]),
        // No affective data → no frustration override
      };

      const result = suggestNext(input);

      expect(result.suggestedStrategy).toBe("socratic");
      expect(result.difficultyHint).toBe("normal");
    });

    it("picks the highest-preference strategy when multiple qualify", () => {
      const lesson = makeLesson("l1", [brandId<"ConceptId">("c1") as ConceptId], "worked-examples");
      const concept = makeConcept("c1", "l1");
      const snapshot = makeSnapshot(lesson, [concept]);
      const input: RouterInput = {
        snapshot,
        masteryByConceptId: new Map(),
        uncertaintyByConceptId: new Map(),
        lastPracticedByConceptId: new Map(),
        now: NOW,
        decayDays: 30,
        proceduralStrategies: new Map([
          ["socratic", { preference: 0.5, evidenceCount: 8 }],
          ["guided-inquiry", { preference: 0.9, evidenceCount: 12 }],
        ]),
      };

      const result = suggestNext(input);

      expect(result.suggestedStrategy).toBe("guided-inquiry");
    });
  });

  describe("procedural preference ignored (thin evidence)", () => {
    it("falls back to lesson default when evidenceCount < proceduralMinEvidence", () => {
      const lesson = makeLesson(
        "l1",
        [brandId<"ConceptId">("c1") as ConceptId],
        "explain-examples",
      );
      const concept = makeConcept("c1", "l1");
      const snapshot = makeSnapshot(lesson, [concept]);
      const input: RouterInput = {
        snapshot,
        masteryByConceptId: new Map(),
        uncertaintyByConceptId: new Map(),
        lastPracticedByConceptId: new Map(),
        now: NOW,
        decayDays: 30,
        proceduralStrategies: new Map([
          ["socratic", { preference: 0.9, evidenceCount: 3 }], // < 5 → ignored
        ]),
      };

      const result = suggestNext(input, DEFAULT_ROUTER_CONFIG);

      expect(result.suggestedStrategy).toBe("explain-examples");
    });

    it("falls back to lesson default when preference < proceduralMinPreference", () => {
      const lesson = makeLesson(
        "l1",
        [brandId<"ConceptId">("c1") as ConceptId],
        "explain-examples",
      );
      const concept = makeConcept("c1", "l1");
      const snapshot = makeSnapshot(lesson, [concept]);
      const input: RouterInput = {
        snapshot,
        masteryByConceptId: new Map(),
        uncertaintyByConceptId: new Map(),
        lastPracticedByConceptId: new Map(),
        now: NOW,
        decayDays: 30,
        proceduralStrategies: new Map([
          ["socratic", { preference: 0.1, evidenceCount: 20 }], // < 0.3 → ignored
        ]),
      };

      const result = suggestNext(input, DEFAULT_ROUTER_CONFIG);

      expect(result.suggestedStrategy).toBe("explain-examples");
    });
  });

  describe("empty recentAffect", () => {
    it("returns normal hint and null transition when recentAffect is empty", () => {
      const input = makeBaseInput({
        affectiveBaseline: NEUTRAL_BASELINE,
        recentAffect: [], // empty → no affective signal
      });

      const result = suggestNext(input);

      expect(result.difficultyHint).toBe("normal");
      expect(result.suggestedModeTransition).toBeNull();
    });

    it("returns normal hint when only affectiveBaseline is provided but recentAffect is omitted", () => {
      const input = makeBaseInput({
        affectiveBaseline: NEUTRAL_BASELINE,
        // recentAffect omitted
      });

      const result = suggestNext(input);

      expect(result.difficultyHint).toBe("normal");
      expect(result.suggestedModeTransition).toBeNull();
    });
  });

  describe("config overrides for Phase 18 tunables", () => {
    it("respects custom proceduralMinEvidence threshold", () => {
      const lesson = makeLesson("l1", [brandId<"ConceptId">("c1") as ConceptId], "worked-examples");
      const concept = makeConcept("c1", "l1");
      const snapshot = makeSnapshot(lesson, [concept]);
      const input: RouterInput = {
        snapshot,
        masteryByConceptId: new Map(),
        uncertaintyByConceptId: new Map(),
        lastPracticedByConceptId: new Map(),
        now: NOW,
        decayDays: 30,
        proceduralStrategies: new Map([
          ["socratic", { preference: 0.8, evidenceCount: 3 }], // below default 5
        ]),
      };

      // With default config (minEvidence=5): 3 < 5, ignored → lesson default
      const defaultResult = suggestNext(input, DEFAULT_ROUTER_CONFIG);
      expect(defaultResult.suggestedStrategy).toBe("worked-examples");

      // With lowered threshold (minEvidence=2): 3 >= 2, honored
      const customResult = suggestNext(input, {
        ...DEFAULT_ROUTER_CONFIG,
        proceduralMinEvidence: 2,
      });
      expect(customResult.suggestedStrategy).toBe("socratic");
    });

    it("respects custom frustrationSpikeDelta", () => {
      // avg frustration 0.6, baseline 0.3 → delta = 0.3
      // default spike threshold: 0.3 > 0.2 → spike
      // strict threshold 0.35: 0.3 < 0.35 → no spike
      const input = makeBaseInput({
        affectiveBaseline: NEUTRAL_BASELINE,
        recentAffect: FRUSTRATION_SPIKE_SAMPLES,
      });

      const defaultResult = suggestNext(input, DEFAULT_ROUTER_CONFIG);
      expect(defaultResult.difficultyHint).toBe("easier"); // spike detected

      const strictResult = suggestNext(input, {
        ...DEFAULT_ROUTER_CONFIG,
        frustrationSpikeDelta: 0.35,
      });
      expect(strictResult.difficultyHint).toBe("normal"); // delta too large, no spike
    });
  });
});
