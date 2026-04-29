# Design: Phase 8 — Multi-Mode + Assessment

## Overview

Phase 8 makes Praxis assessable. The tutor can author a quiz / homework / exam from the active course, the student takes it as a **structured artifact rendered inline in the chat surface**, the server grades each item with a tier-appropriate grader, and the agent narrates feedback. Three new modes (`quiz`, `homework`, `exam`) define the agent's voice + tool subset during assessment; the chat composer's behavior shifts per mode (active in quiz/homework so the student can ask for help; muted in exam until submission).

After Phase 8: a teach session can produce a quiz on the active concepts; the student takes the quiz inside chat (without leaving the conversation) by typing answers into a structured `<AssignmentCard>`; submission grades each item via deterministic graders (math, code, MC, short-answer) with an optional **approach feedback** layer (rubric agent enriches per-item feedback for incorrect quiz/homework items without changing the deterministic score); the Grade artifact lands in `assignments.gradeJson` and the agent narrates per-item feedback. Phase 9 reads the Grade for gate evaluation.

**Key design moves (from user feedback):**

1. **Hard artifacts, not chat messages.** Assignments render as structured `<AssignmentCard>` components inline in the chat surface; submission flows through a dedicated endpoint, not the agent's tool registry. The conversational layer wraps the artifact (the agent clarifies items in quiz/homework, narrates feedback after submission); exam mode UI-disables the chat composer for integrity.
2. **Per-criterion scoring with 0-10 integer rubrics.** The rubric agent's job is narrowed: for each criterion in the rubric, pick an integer 0-10 with a written rationale. The `GradeItem.score` aggregate (0..1) is then computed deterministically from per-criterion scores and weights — the math is grounded; only the per-criterion judgment is LLM-driven. Auditable: the configurator (Phase 11) can review per-criterion rationales and challenge any single call.
3. **Rubric agent allowed in exam mode, with constraints.** SPEC.md's "graded against an explicitly-written rubric the tutor produces before grading" is the verification stance — pre-commitment to criteria, not avoidance of LLM judgment. Exam free-response uses the rubric agent with the same per-criterion 0-10 scoring; approach-feedback enrichment stays OFF for exam (no post-hoc feedback shifting); rubric is mandatory for exam free-response items (validated at create time).
4. **Optional `workRubric` for partial credit on shown work.** Math and code items can opt into a `workRubric` so the student earns partial credit for showing valid steps even when the final answer is wrong. The agent decides per-item at `assignment.create` time whether to add a workRubric — heuristic guidance is in the tool description (rare in quiz, common in homework, judgment-call in exam). When present, the deterministic check + rubric agent blend via `primaryWeight`.

**What ships:**

- **Schema additions** (`@praxis/artifacts/schema.ts`): `assignment_responses` table — per-(assignmentId, itemId) auto-saved partial progress, primary key composite. **`sessions` schema extended** with `assignment_id` column (nullable text) so resumed sessions know which assignment they're bound to.
- **Type contract additions** (`@praxis/core/types/artifacts.ts` + `tool.ts`): extended `AssignmentItem` with grader-specific fields (`correctOptionIndex`, `acceptedAnswers`, `acceptedAnswerMatch`, `expectedSolution`, `testCases`, **`workRubric?: Rubric`**, **`primaryWeight?: number`**); `Rubric` extended with `criteria[].anchors?` for per-criterion calibration; new `AssignmentResponse` (with optional `work?: string`), `AssignmentSubmissionResult`, `AssignmentService` (server-side); `Grade.perItem` is now `GradeItem[]` with `gradedBy: GraderTier`, optional `perCriterion: Array<{criterionId, score (0-10 integer), rationale, source: "rubric" | "work-rubric"}>`, `evidenceEventIds?` for audit; `AssignmentItem.authoredBy?: "tutor" | "configurator"` for Phase 11 forward-compat.
- **`AssignmentServiceImpl`** in `@praxis/core/services/assignment-service.ts` — `create`, `get`, `recordResponse`, `getResponses`, `submit`. The `submit` path runs the per-item grader dispatch in a single transaction-bounded operation, builds the `Grade`, persists `assignments.gradeJson` + `submittedAt`.
- **Per-item graders** in `@praxis/core/services/graders/` — `MathGrader` (sympy via `SymPyService.checkSolution`), `CodeGrader` (sandbox + test cases), `MultipleChoiceGrader` (exact index match), `ShortAnswerGrader` (exact / substring / normalized match), `FreeResponseGrader` (rubric agent — per-criterion 0-10 → weighted sum 0..1). All implement an `ItemGrader` port; dispatch is data-driven via `GRADER_REGISTRY: Record<AssignmentItem["kind"], ItemGrader>`.
- **`runRubricAgent` helper** in `@praxis/core/services/graders/rubric-agent.ts` — shared by `FreeResponseGrader` (item-level rubric) and the workRubric blender (math/code work). Per-criterion 0-10 integer scoring with rationales; total normalized to 0..1 via deterministic weighted sum.
- **`workRubric` blending in `AssignmentServiceImpl.submit`** — when an item has `workRubric` (math/code only): runs the deterministic grader on the final answer + runs the rubric agent on the shown work; blends via `primaryWeight`. Default `primaryWeight = 0.5` for quiz/homework, `1.0` for exam (deterministic-only by default; configurator can lower it per-item).
- **Approach feedback layer** in `@praxis/core/services/graders/approach-feedback.ts` — fallback enrichment that runs only when an item has NO rubric and NO workRubric, in quiz/homework only, on items with `score < 1`. Produces enriched `feedback` text without modifying `score`. Skipped entirely for exam (verification stance) and for items already graded with per-criterion rubric (redundant with the per-criterion rationales).
- **Three new modes** in `@praxis/curriculum/src/modes/` — `quizMode`, `homeworkMode`, `examMode`. Each ships its own role + tools fragments. Different agent voices: lively/scaffolding (quiz), helpful/clarifying (homework), terse/proctor (exam).
- **Active-path tools** in `@praxis/tools/src/assignment/`:
  - `assignment.create({courseId, kind, title, items, conceptIds})` — available in `teach` mode (and Phase 11 configure). Tier `"model-derived"` (LLM authors items inline).
  - `assignment.show(assignmentId)` — available in quiz/homework/exam modes. Tier `"grounded"`. Returns the assignment payload; UI dispatches to render `<AssignmentCard>` inline (mirrors Phase 6's `course.show_draft` → `<DraftCard>` pattern).
  - `assignment.read_grade(assignmentId)` — available in quiz/homework/exam modes. Tier `"grounded"`. Returns the most recent Grade after submission so the agent can narrate per-item feedback.
- **`SessionService.start` extended** with `assignmentId?: AssignmentId` opt; persisted on the session row; resumed sessions reseed assignment context. The brief composer reads the assignment + responses and injects an `assignment-context` fragment showing items, current responses, and submission state.
- **`praxis.assignments.*` IPC** — `submit` (dedicated endpoint, not via chat), `get`, `recordResponse`, `getResponses`. The streaming submission flow: client posts responses → server grades synchronously → returns Grade. The framework synthesizes a `tool_result` for a virtual `assignment.submission_received` and pushes it into the active session's event stream so the agent's next turn sees the responses + grade.
- **`AssignmentsClient`** real implementation (Phase 3 had no stub here — fresh interface).
- **UI components**:
  - `<AssignmentCard>` (wrapper) — renders inline in chat, dispatched on `tool_result` for `assignment.show`. Reads `assignment_responses` for resumable state. Submit button posts to `/assignments/:id/submit`. After submit, renders feedback per item.
  - `<AssignmentItemCard>` (per item) — radio buttons (MC), text input (SA), textarea (free-response), text input with monospace styling (math), textarea with monospace + line numbers (code).
  - `<AssignmentFeedback>` — post-submission feedback display per item: color-coded (correct/incorrect/needs-review), expandable to show approach feedback.
- **Chat route integration** — when the active session has `assignmentId`, render the `<AssignmentCard>` inline. Disable the chat composer in exam mode while the assignment is unsubmitted. Re-enable after submission for follow-up questions.
- **`pnpm db:grades` CLI** at `scripts/db-grades.ts` — table-formatted listing of recent Grades with per-item scores.
- **Doc updates**: `docs/ROADMAP.md` Phase 8 description (clarifies "hard artifact + sidecar chat" stance), `docs/CURRICULUM.md` updates the modes section with the three new modes, `docs/CONTRACT.md` adds the assignment lifecycle note.

**What does not ship (deferred):**

- **Sketch input for assignments** — Phase 13 (tldraw + Pointer Events). Phase 8 is typed-only per ROADMAP.
- **Photo upload for handwritten work** — Phase 13.
- **Configurator-authored assignments via configure mode** — Phase 11. Phase 8 adds the `authoredBy` field and ensures `assignment.create` is reusable; Phase 11 wires it into configure mode + lock-gating.
- **Canonical / pre-made assessment packs** — Phase 10 / Phase 15 (with the canonical math + biology packs).
- **Gate auto-evaluation on exam pass** — Phase 9. Phase 8 produces the Grade artifact; Phase 9 reads it.
- **Assignment editing post-submission** — out of v1. Submitted assignments are immutable; retake = new assignment.
- **Per-rubric-criterion partial scoring** — v1 free-response grading is whole-item (single score 0..1 + feedback). Per-criterion scoring deferred.
- **Code item editor** — v1 uses a textarea with monospace styling; CodeMirror or similar deferred.
- **Multi-attempt with attempt history** — v1 is "submit once" per assignment. ThresholdConfig.allowRetake exists but Phase 8 doesn't gate retakes behind it (Phase 9 owns the retake-allowed semantics tied to gates).

## Why these choices (decision rationale)

**Why hard artifacts instead of pure chat.** A 5-item quiz expressed as a chat dialog forces every interaction through the conversational composer — no form structure, no submit button, no per-item validation, no resumable state. The student can't see all five items at once. Submission becomes "type 'submit' and hope". The grader has to parse natural-language responses. Hard artifacts (a structured card with input fields) give the student a stable surface to fill out and the grader a typed payload to dispatch on. The conversational layer wraps the artifact: the student can chat with the agent for hints (in quiz/homework), and the agent narrates feedback after submission. Best of both shapes.

**Why three modes instead of one parameterized "assessment" mode.** The agent's voice differs sharply by stakes. Quiz mode wants warm scaffolding ("good thinking — try again"); homework wants clarification without giving away ("which part is unclear?"); exam wants proctor restraint ("I can clarify the question wording but not the answer"). Encoding these as three Mode definitions with distinct prompt fragments + tool subsets is the cleanest way — the same mechanism Phase 6 used for `bootstrap` vs `teach`. Mode-id-driven UI behavior (composer disabled in exam) flows naturally from the existing `mode.uiSurface` + `mode.id` plumbing.

**Why submission is a dedicated endpoint, not a chat tool.** The submission payload is structured (responses keyed by item id), graded server-side, and produces a structured Grade. Routing it through the agent's tool-call mechanism would mean the model has to serialize/deserialize the response payload, which is exactly the kind of "ask the model to do mechanical work that it does poorly" anti-pattern Praxis avoids. The dedicated endpoint is fast, deterministic, and exposes a clean place to run the grader dispatch. The agent learns about the submission via a synthesized `tool_result` event in the active session — no impedance mismatch with the existing event stream.

**Why per-criterion 0-10 scoring + deterministic aggregation.** SPEC.md's verification stance — "graded against an explicitly-written rubric the tutor produces before grading" — is about pre-commitment to criteria, not avoidance of LLM judgment. Per-criterion 0-10 scoring respects this: the rubric is explicit and authored before grading; the agent's judgment is narrowed to one criterion at a time (not "produce a holistic score"); the total is a deterministic weighted sum, not produced by the LLM. Auditability is per-criterion ("the agent gave a 4/10 on evidence support because…") instead of holistic ("the agent gave a 0.65 because vibes"). Integer 0-10 also matches how teachers actually grade and produces calibrated agent output (LLMs handle discrete integer scales better than fine decimal scales).

**Why rubric agent is allowed in exam mode.** Excluding the rubric agent from exam mode would mean Praxis can't grade essays, history short-answers, science explanations, or any prose-based assessment in exams — a major restriction the spec doesn't actually impose. The verification stance is preserved by: (1) rubric is required at item-create time and validated; (2) per-criterion scoring with written rationales is auditable; (3) total is deterministic; (4) the approach-feedback layer (which CAN shift perception of feedback) stays OFF for exam.

**Why `workRubric` is opt-in per item.** Not every item benefits from partial credit on shown work. A "what is 2 + 3?" recall item doesn't have steps to credit; a multiple-choice item has no work; a "factor x² + 5x + 6" item's work IS the answer. The agent decides per-item at `assignment.create` time whether to add a workRubric, guided by heuristics in the tool description. Quizzes typically have few workRubric items (fast turnaround); homework typically has many (depth of practice); exam is judgment-call per item with `primaryWeight` defaulting to 1.0 (deterministic-only) unless explicitly authored otherwise. This makes the system work like real classroom grading without forcing structure on items that don't need it.

**Why approach-feedback layer becomes a fallback (not a primary feature).** When an item has a `workRubric` or `rubric`, the per-criterion rationales already provide rich approach-level feedback ("on isolation you scored 9/10; on arithmetic you scored 4/10 because step 3 flipped a sign"). Running approach-feedback on top would be redundant. Approach-feedback now runs only on items that have NO rubric — typically simple math items the agent didn't bother to attach a workRubric to — as a light enrichment layer. Same isolation pattern (one-shot LLM, never modifies score), just narrower trigger.

**Why agent generates items inline (vs. a separate generator agent).** Item authoring is a single-shot model task ("here's the course state, generate 5 quiz items on the current concepts"). The tutor agent already has the course context, the recent mastery, the current lesson, and the misconceptions list — that's exactly the prompt a generator would need. Routing item generation through a separate one-shot LLM session would re-load that context and double the cost. The tutor's `assignment.create` tool call is `"model-derived"` and the response is validated via Zod; bad items are rejected before persistence.

**Why `AssignmentItem` gains grader-specific fields instead of generic `metadata`.** The grader dispatch is data-driven: `GRADER_REGISTRY[item.kind]`. Each grader needs typed access to its inputs (`MathGrader` reads `expectedSolution`, `CodeGrader` reads `testCases`). A generic `metadata: unknown` would push parsing into every grader. Typed per-kind fields (some optional) keep the grader code clean and let the validator catch malformed items at `assignment.create` time.

**Why `assignment_id` on the `sessions` table.** A quiz / homework / exam session is bound to one assignment for its lifetime. Reopening that session (engine swap, process restart) needs to reseed assignment context into the brief. Storing `assignment_id` on the session row makes that lookup a single SELECT. Could be derived (look up assignments where `submittedAt is null` for this student in this course), but explicit binding is honest about the mode's purpose. Cost: one nullable text column.

**Why the chat composer is muted in exam mode (UI-enforced) instead of relying on prompt restraint.** Prompts steer the agent but don't bind the student. A student who messages mid-exam ("hey can you give me a hint?") puts the agent in an awkward position — even with strong prompt restraint, model judgment can slip. UI-enforced muting cuts the failure mode at the source: there's no chat to tempt. Re-enables on submission so post-exam feedback chat works naturally.

**Why approach feedback agent is a separate one-shot, not a path inside the deterministic grader.** Strict separation of concerns: deterministic grading writes the score; approach feedback writes the prose. Mixing them invites future drift where the LLM's view of the answer overrides the math. Phase 14 evals can measure approach-feedback quality independently of grading quality. The cost is one extra LLM call per incorrect item — bounded, optional, skippable for exam.

## Scope and assumptions

- **Single-student per install** (v1 invariant).
- **Sessions are mode-scoped.** A `quiz` session is started fresh per assignment; finishing the quiz ends the session; the next teach session continues course progress. No mid-session mode switching (consistent with Phase 6 architecture).
- **Submissions are atomic per assignment.** Once `assignments.submittedAt` is set, the assignment is graded and immutable. Retakes are new assignment rows (with a `retakeOf?: AssignmentId` field so Phase 9 can reason about attempt history).
- **Approach feedback is a fallback enrichment, not a primary grading mechanism.** It runs only on items with NO `rubric` and NO `workRubric`, in quiz/homework only, when `score < 1`. Items with a rubric get richer feedback through per-criterion rationales — no need for separate enrichment. Always skipped for exam (verification stance) and for fully-correct items.
- **Free-response items in exam mode require a `rubric`.** Validated at `assignment.create`. The rubric agent grades per-criterion 0-10; total is a deterministic weighted sum. Items without a rubric in exam mode are rejected at creation. (Quiz/homework free-response items can also fall back to `acceptedAnswers` exact-match if no rubric is provided, but exams require explicit rubrics.)
- **`workRubric` blending blends two scores deterministically.** When an item has `workRubric`: `total = primaryWeight × deterministicScore + (1 - primaryWeight) × workScore`, where `workScore` is the rubric agent's per-criterion weighted sum (0..1) and `deterministicScore` is the kind-specific check (0 or 1 for math; passed/total for code). Default `primaryWeight`: 0.5 (quiz/homework), 1.0 (exam). Per-item override allowed.
- **Item validation at `create` time.** `assignment.create` validates each item via Zod (per-kind discriminated union); items missing required fields (e.g., `math` without `expectedSolution`) fail fast at tool-dispatch with a descriptive error.
- **Resumable per-item progress.** `assignment_responses` upsert on every keystroke-debounced auto-save (UI: 1s debounce); explicit "Save & continue" button also persists.
- **Submission grading is synchronous.** A 5-item quiz with 1 free-response (rubric agent) takes ~5–15 seconds; UI shows a "Grading..." indicator, then renders feedback. Async grading (job queue) is a hosted-deployment concern; v1 local runs in-process.
- **Approach feedback bounds.** Skipped entirely if the student left the response empty. Skipped if the deterministic grader returned `needs-human-review` (no signal to reason from).
- **Slow tests gated** behind `PRAXIS_RUN_SLOW_TESTS=1` (real LLM grading via FakeEngine in fast lane; real engine in slow).

## Dependency direction (Phase 8 additions)

```
@praxis/artifacts/schema.ts
  ├─ NEW: assignment_responses table
  └─ MODIFIED: sessions table — assignment_id column

@praxis/core/types
  ├─ MODIFIED: artifacts.ts — extended AssignmentItem; new AssignmentResponse, AssignmentSubmissionResult, GraderTier
  └─ MODIFIED: tool.ts — server-side AssignmentService; ToolServices.assignments

@praxis/core/src/services
  ├─ NEW: assignment-service.ts — AssignmentServiceImpl
  ├─ NEW: graders/types.ts — ItemGrader port + GraderResult
  ├─ NEW: graders/math-grader.ts
  ├─ NEW: graders/code-grader.ts
  ├─ NEW: graders/multiple-choice-grader.ts
  ├─ NEW: graders/short-answer-grader.ts
  ├─ NEW: graders/free-response-grader.ts (uses rubric agent)
  ├─ NEW: graders/approach-feedback.ts (optional layer)
  ├─ NEW: graders/registry.ts — GRADER_REGISTRY (data-driven dispatch)
  ├─ NEW: graders/index.ts
  ├─ NEW: graders/rubric-prompt.ts — system prompt for the rubric agent
  ├─ NEW: graders/approach-prompt.ts — system prompt for the approach-feedback agent
  └─ MODIFIED: session-service.ts — assignmentId plumbing in start/openActive

@praxis/curriculum/src/
  ├─ NEW: modes/quiz.ts
  ├─ NEW: modes/homework.ts
  ├─ NEW: modes/exam.ts
  ├─ NEW: modes/fragments/quiz-role.ts
  ├─ NEW: modes/fragments/homework-role.ts
  ├─ NEW: modes/fragments/exam-role.ts
  ├─ NEW: modes/fragments/assessment-tools.ts (shared by quiz + homework)
  ├─ NEW: modes/fragments/exam-tools.ts (stricter subset)
  ├─ NEW: modes/fragments/assignment-context.ts (default fallback)
  ├─ NEW: brief/assignment-context.ts (composer for active-assignment context)
  └─ MODIFIED: modes/index.ts — register the three new modes

@praxis/tools/src/assignment/
  ├─ create.ts
  ├─ show.ts
  ├─ read-grade.ts
  └─ index.ts — ASSIGNMENT_TUTOR_TOOLS, ASSIGNMENT_TAKE_TOOLS

@praxis/desktop/electron/main/
  ├─ MODIFIED: services.ts — wire AssignmentServiceImpl + new modes + assignment tools
  └─ MODIFIED: ipc-server.ts — praxis.assignments.* handlers; synthesized submission event

@praxis/client/src/services/
  └─ NEW: assignments-client.ts (real impl from scratch)

@praxis/ui/src/
  ├─ NEW: components/assignment-card.tsx + .module.css
  ├─ NEW: components/assignment-item-card.tsx + .module.css
  ├─ NEW: components/assignment-feedback.tsx + .module.css
  ├─ NEW: hooks/use-assignment.ts
  ├─ MODIFIED: routes/chat.tsx — render <AssignmentCard> when session.assignmentId; disable composer in exam mode
  ├─ MODIFIED: hooks/use-streamed-send.ts — dispatch on tool_result for assignment.show / assignment.read_grade
  └─ MODIFIED: components/message.tsx — render assignment artifacts

scripts/
  └─ NEW: db-grades.ts

docs/
  ├─ MODIFIED: ROADMAP.md (Phase 8 description tightened)
  ├─ MODIFIED: CURRICULUM.md (modes section, three new modes)
  └─ MODIFIED: CONTRACT.md (assignment lifecycle note)
```

No Python in Phase 8.

---

## Implementation Units

### Unit 1: Type contract additions

**Files**:
- `packages/core/src/types/artifacts.ts` (modified)
- `packages/core/src/types/tool.ts` (modified)

```typescript
// packages/core/src/types/artifacts.ts — additions

/** Tier the per-item grader returned. Used in Grade.perItem for traceability. */
export type GraderTier = "deterministic" | "rubric-agent" | "needs-human-review";

/**
 * Rubric — extended with per-criterion calibration anchors.
 * Criterion weights sum to 1.0 (validated at item-create).
 * Criterion scores are 0-10 integers (the agent's per-criterion judgment scale);
 * the aggregated GradeItem.score is 0..1 (deterministic weighted sum).
 */
export interface Rubric {
  criteria: Array<{
    id: string;
    description: string;
    /** 0..1; sums to 1.0 across criteria. */
    weight: number;
    /** Optional anchor descriptions at specific score points (helps agent calibrate). */
    anchors?: Array<{
      /** 0, 5, 10 typical. */
      score: number;
      description: string;
    }>;
  }>;
  /** For display only ("scored 17/20"). Internal scores normalize to 0..1. */
  maxScore: number;
}

/**
 * Extended AssignmentItem — adds grader-specific fields. Each kind has its
 * own optional fields; all may be undefined for items where the kind doesn't
 * use them. The grader dispatch reads only the fields its kind cares about.
 */
export interface AssignmentItem {
  id: string;
  kind: "multiple-choice" | "short-answer" | "free-response" | "math" | "code";
  prompt: string;
  /** ↓ Grader-specific fields ↓ */
  /** For multiple-choice. */
  options?: string[];
  correctOptionIndex?: number;
  /** For short-answer. */
  acceptedAnswers?: string[];
  acceptedAnswerMatch?: "exact" | "substring" | "normalized";
  /** For math. */
  expectedSolution?: { variable: string; value: string };
  /** For code. */
  testCases?: Array<{
    stdin?: string;
    expectedStdout: string;
    timeoutMs?: number;
  }>;
  language?: "javascript" | "python";
  /** For free-response (rubric agent). Required for exam-mode free-response items. */
  rubric?: Rubric;
  /**
   * Phase 8 v2: optional rubric for grading the WORK shown on math/code items.
   * When present, the student earns partial credit for valid steps even if the
   * deterministic check fails. The agent decides at create time whether to add
   * this; it's per-item judgment, not a default.
   */
  workRubric?: Rubric;
  /**
   * When workRubric is present, how much weight the deterministic check gets in
   * the blended score. Range 0..1. Defaults: 0.5 for quiz/homework, 1.0 for exam.
   * Ignored when workRubric is absent.
   */
  primaryWeight?: number;
  /** Provenance — Phase 11 forward-compat. */
  authoredBy?: "tutor" | "configurator";
}

/** Per-item entry on the Grade. */
export interface GradeItem {
  itemId: string;
  /** 0..1; null when ungradeable (e.g. exam free-response missing required rubric). */
  score: number | null;
  feedback: string;
  /** Tier of the grader that produced this entry. */
  gradedBy: GraderTier;
  /**
   * Per-criterion breakdown when a rubric was involved (free-response or workRubric).
   * Each entry's `score` is the agent's 0-10 integer judgment; the `source` field
   * tells the UI which rubric the score relates to.
   */
  perCriterion?: Array<{
    criterionId: string;
    /** 0-10 integer (the agent's native scale). */
    score: number;
    rationale: string;
    /** Which rubric this criterion came from. */
    source: "rubric" | "work-rubric";
  }>;
  /** Episodic event ids of any LLM calls that contributed to this grade. */
  evidenceEventIds?: string[];
}

/** Grade is updated to use the typed GradeItem. */
export interface Grade {
  total: number;
  perItem: GradeItem[];
  rubricUsed?: Rubric;
  /** Highest tier present in perItem. */
  reviewedBy: GraderTier;
}

/** Per-item draft response for resumable assignments. */
export interface AssignmentResponse {
  assignmentId: AssignmentId;
  itemId: string;
  /**
   * Final answer / primary response. For MC: the option index as string.
   * For math/code/free-response/short-answer: the answer text. Always present.
   */
  response: string;
  /**
   * Phase 8 v2: shown work for items that have a workRubric. Only present when
   * the item has a workRubric set; absent otherwise.
   */
  work?: string;
  recordedAt: Timestamp;
}

/** Result of submitting an assignment. Returned by AssignmentService.submit. */
export interface AssignmentSubmissionResult {
  assignmentId: AssignmentId;
  grade: Grade;
  submittedAt: Timestamp;
}
```

```typescript
// packages/core/src/types/tool.ts — additions

export interface ToolServices {
  // ... existing ...
  /** ← Phase 8 NEW. */
  assignments: AssignmentService;
  // ... existing ...
}

// ─── AssignmentService (server-side) ─────────────────────────────────────────

import type {
  Assignment,
  AssignmentId,
  AssignmentItem,
  AssignmentResponse,
  AssignmentSubmissionResult,
  ConceptId,
  CourseId,
  Grade,
  StudentId,
} from "./artifacts.js";

export interface AssignmentService {
  create(input: {
    courseId: CourseId;
    studentId: StudentId;
    kind: "quiz" | "homework" | "exam";
    title: string;
    items: AssignmentItem[];
    conceptIds: ConceptId[];
    authoredBy?: "tutor" | "configurator";
  }): Promise<{ assignmentId: AssignmentId }>;

  get(input: { assignmentId: AssignmentId }): Promise<Assignment | null>;

  /** List assignments for a course; useful for course-detail views. */
  list(input: {
    courseId: CourseId;
    kind?: "quiz" | "homework" | "exam";
  }): Promise<Assignment[]>;

  /** Auto-save partial response for a single item. Idempotent upsert. */
  recordResponse(input: {
    assignmentId: AssignmentId;
    itemId: string;
    response: string;
    /** Optional shown work; only meaningful for items with workRubric. */
    work?: string;
  }): Promise<void>;

  /** Read all in-progress responses for an assignment (for resume). */
  getResponses(input: { assignmentId: AssignmentId }): Promise<AssignmentResponse[]>;

  /**
   * Submit the assignment for grading. Reads the persisted responses (or
   * accepts an explicit array), runs the grader dispatch per item, builds
   * the Grade, persists `submittedAt` + `gradeJson`, and returns the result.
   * Throws if already submitted.
   */
  submit(input: {
    assignmentId: AssignmentId;
    /** Optional explicit responses (overrides the persisted ones). */
    responses?: AssignmentResponse[];
  }): Promise<AssignmentSubmissionResult>;
}
```

**Implementation notes**:
- `AssignmentItem` is **not** a discriminated union (single `kind` field; per-kind optional fields). Validation happens at `create` time via a Zod discriminated union (Unit 11). The interface stays flat for ergonomic JSON storage.
- `Grade.perItem.gradedBy` lets the UI color-code per item (deterministic = green/red; rubric-agent = amber for "rubric-scored"; needs-human-review = gray).
- `Grade.perItem.perCriterion[].score` is **integer 0-10** — the agent's native scale. The aggregated `GradeItem.score` is **0..1** computed deterministically. Two scales coexist by design: 0-10 for what the agent picked (defensible discrete choice), 0..1 for the consumer-facing aggregate (matches BKT mastery, gate thresholds, etc.).
- `Rubric.criteria[].weight` validates to sum to 1.0 (within ±0.01 floating-point tolerance) at item-create. Rejected items fail fast with a descriptive error.
- `AssignmentResponse.work` is only stored for items with a `workRubric`. UIs render two fields (work textarea + answer input) only when the item has a workRubric; single field otherwise.
- `AssignmentService.submit` is idempotent in the sense that calling it twice with the same persisted responses produces the same Grade. But the second call throws `"already submitted"` to keep the artifact immutable.

**Acceptance criteria**:
- [ ] `AssignmentItem` extensions don't break existing consumers (Phase 6's bootstrap-mode `course.confirm_draft` still produces valid items even though new fields are undefined).
- [ ] `Grade.perItem` is now `GradeItem[]` (was inline `{itemId, score, feedback}`); existing code adjusts to read `gradedBy` and the optional `perCriterion`.
- [ ] `Rubric.criteria[].weight` sum is validated to 1.0 (±0.01) at item-create.
- [ ] `GradeItem.perCriterion[].score` is integer 0-10 (validated `z.number().int().min(0).max(10)` at the boundary).
- [ ] All new types re-exported through `packages/core/src/types/index.ts`.

---

### Unit 2: Schema additions

**Files**:
- `packages/artifacts/src/schema.ts` (modified)
- `packages/memory/src/schema.ts` (modified — add `assignment_id` to `sessions`)

```typescript
// packages/artifacts/src/schema.ts — addition

export const assignmentResponses = sqliteTable(
  "assignment_responses",
  {
    assignmentId: text("assignment_id")
      .notNull()
      .references(() => assignments.id, { onDelete: "cascade" }),
    itemId: text("item_id").notNull(),
    response: text("response").notNull(),
    /** Phase 8 v2: optional shown work; null when item has no workRubric. */
    work: text("work"),
    recordedAt: integer("recorded_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.assignmentId, t.itemId] }),
    assignmentIdx: index("assignment_responses_assignment_idx").on(t.assignmentId),
  }),
);

export const artifactsSchema = {
  // ... existing tables ...
  assignmentResponses, // ← Phase 8
};
```

```typescript
// packages/memory/src/schema.ts — modification

export const sessions = sqliteTable(
  "sessions",
  {
    // ... existing columns ...
    assignmentId: text("assignment_id"), // ← Phase 8 NEW (nullable)
  },
  (t) => ({
    studentTimeIdx: index("sessions_student_time_idx").on(t.studentId, t.startedAt),
  }),
);
```

**Implementation notes**:
- `assignment_responses.recordedAt` updates on every upsert (last-write-wins for the response text).
- Migration generated via `pnpm db:generate`. The `sessions.assignment_id` column is nullable, so existing rows are unaffected.
- Cascade on `assignments.id` delete: deleting an assignment cascades to its responses. Submitted assignments shouldn't be deleted, but the cascade keeps the table consistent if cleanup is needed.

**Acceptance criteria**:
- [ ] `pnpm db:generate` produces a migration adding the new table + column.
- [ ] `pnpm db:migrate` applies cleanly on a fresh DB and idempotently on an existing DB.
- [ ] Existing session rows survive (nullable column).

---

### Unit 3: Grader port + registry

**File**: `packages/core/src/services/graders/types.ts` (new)

```typescript
import type { AssignmentItem, AssignmentResponse, GraderTier } from "../../types/artifacts.js";
import type { Logger } from "../../types/index.js";

/**
 * Result of grading a single item. `score` is null when the grader can't produce a score
 * (e.g. exam free-response item with no rubric → needs-human-review).
 */
export interface GraderResult {
  /** 0..1 aggregate. */
  score: number | null;
  feedback: string;
  tier: GraderTier;
  /** Per-criterion breakdown when a rubric was involved. Score is integer 0-10. */
  perCriterion?: Array<{
    criterionId: string;
    score: number;       // 0-10 integer
    rationale: string;
    source: "rubric" | "work-rubric";
  }>;
  /** Set when an LLM call produced this result; lets indexers trace evidence. */
  evidenceEventIds?: string[];
}

export interface GraderContext {
  log: Logger;
  /** Available tools the grader may need. Filled by buildServices. */
  services: GraderServices;
  /** Mode the assignment is being taken in. Affects which graders are allowed (exam excludes rubric agent). */
  mode: "quiz" | "homework" | "exam";
}

export interface GraderServices {
  sympy: SymPyService;        // for math grader
  sandbox: CodeSandbox;        // for code grader
  /** Resolves an active engine for one-shot rubric / approach-feedback runs. */
  engineResolver: () => Engine;
}

export interface ItemGrader {
  /** The kind of AssignmentItem this grader handles. */
  readonly kind: AssignmentItem["kind"];
  grade(input: {
    item: AssignmentItem;
    response: AssignmentResponse | null; // null when student didn't answer
    ctx: GraderContext;
  }): Promise<GraderResult>;
}
```

**File**: `packages/core/src/services/graders/registry.ts` (new)

```typescript
import type { AssignmentItem } from "../../types/artifacts.js";
import { CodeGrader } from "./code-grader.js";
import { FreeResponseGrader } from "./free-response-grader.js";
import { MathGrader } from "./math-grader.js";
import { MultipleChoiceGrader } from "./multiple-choice-grader.js";
import { ShortAnswerGrader } from "./short-answer-grader.js";
import type { ItemGrader } from "./types.js";

/**
 * GRADER_REGISTRY — the single source of truth for kind→grader dispatch.
 * Adding a new item kind means:
 *   1. Extend AssignmentItem.kind in artifacts.ts
 *   2. Add a grader class
 *   3. Register here
 * No switch statements anywhere else.
 */
export function buildGraderRegistry(): Record<AssignmentItem["kind"], ItemGrader> {
  return {
    "multiple-choice": new MultipleChoiceGrader(),
    "short-answer": new ShortAnswerGrader(),
    "math": new MathGrader(),
    "code": new CodeGrader(),
    "free-response": new FreeResponseGrader(),
  };
}
```

**Implementation notes**:
- Graders are lightweight stateless classes. The registry is a plain object so Drizzle / serialization don't see them.
- The `mode` field in `GraderContext` is the gate that disables the rubric agent in exam mode (free-response grader checks `ctx.mode === "exam"` and falls back to `acceptedAnswers` deterministic match if available, else returns `needs-human-review`).

**Acceptance criteria**:
- [ ] `buildGraderRegistry()` returns an object with one entry per `AssignmentItem.kind`.
- [ ] TypeScript exhaustiveness check passes (`Record<AssignmentItem["kind"], ItemGrader>` forces every kind to be present).

---

### Unit 4: Deterministic graders

**Files**:
- `packages/core/src/services/graders/multiple-choice-grader.ts`
- `packages/core/src/services/graders/short-answer-grader.ts`
- `packages/core/src/services/graders/math-grader.ts`
- `packages/core/src/services/graders/code-grader.ts`

```typescript
// multiple-choice-grader.ts

export class MultipleChoiceGrader implements ItemGrader {
  readonly kind = "multiple-choice" as const;
  async grade({ item, response }: { item: AssignmentItem; response: AssignmentResponse | null }): Promise<GraderResult> {
    if (item.correctOptionIndex === undefined) {
      return { score: null, feedback: "needs-human-review (no answer key)", tier: "needs-human-review" };
    }
    if (!response) return { score: 0, feedback: "No answer provided.", tier: "deterministic" };
    const chosen = Number(response.response);
    if (Number.isNaN(chosen)) {
      return { score: 0, feedback: "Response could not be parsed as an option index.", tier: "deterministic" };
    }
    const correct = chosen === item.correctOptionIndex;
    return {
      score: correct ? 1 : 0,
      feedback: correct
        ? "Correct."
        : `Incorrect. The correct option was: ${item.options?.[item.correctOptionIndex] ?? "(unknown)"}`,
      tier: "deterministic",
    };
  }
}
```

```typescript
// short-answer-grader.ts

export class ShortAnswerGrader implements ItemGrader {
  readonly kind = "short-answer" as const;
  async grade({ item, response }: { item: AssignmentItem; response: AssignmentResponse | null }): Promise<GraderResult> {
    const accepted = item.acceptedAnswers ?? [];
    if (accepted.length === 0) {
      return { score: null, feedback: "needs-human-review (no answer key)", tier: "needs-human-review" };
    }
    if (!response || response.response.trim() === "") {
      return { score: 0, feedback: "No answer provided.", tier: "deterministic" };
    }
    const matchKind = item.acceptedAnswerMatch ?? "exact";
    const ok = matchAcceptedAnswer(response.response, accepted, matchKind);
    return {
      score: ok ? 1 : 0,
      feedback: ok ? "Correct." : `Incorrect. Expected one of: ${accepted.join(", ")}`,
      tier: "deterministic",
    };
  }
}

function matchAcceptedAnswer(response: string, accepted: string[], match: "exact" | "substring" | "normalized"): boolean {
  const r = response.trim();
  switch (match) {
    case "exact": return accepted.some((a) => a.trim() === r);
    case "substring": return accepted.some((a) => r.includes(a.trim()));
    case "normalized":
      // Lowercase + collapse whitespace + strip trailing punctuation.
      const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/[.,!?;:]+$/, "").trim();
      return accepted.some((a) => norm(a) === norm(r));
  }
}
```

```typescript
// math-grader.ts

export class MathGrader implements ItemGrader {
  readonly kind = "math" as const;
  async grade({ item, response, ctx }: { item: AssignmentItem; response: AssignmentResponse | null; ctx: GraderContext }): Promise<GraderResult> {
    if (!item.expectedSolution) {
      return { score: null, feedback: "needs-human-review (no expected solution)", tier: "needs-human-review" };
    }
    if (!response || response.response.trim() === "") {
      return { score: 0, feedback: "No answer provided.", tier: "deterministic" };
    }
    const result = await ctx.services.sympy.checkSolution({
      equation: item.prompt, // contains the equation
      variable: item.expectedSolution.variable,
      proposedValue: response.response,
    });
    if (result.needsHumanReview) {
      return {
        score: null,
        feedback: `needs-human-review (parse error: ${result.parseError ?? "unknown"})`,
        tier: "needs-human-review",
      };
    }
    return {
      score: result.correct ? 1 : 0,
      feedback: result.correct
        ? `Correct.`
        : `Incorrect. Expected: ${result.expectedSolutions.join(" or ")}`,
      tier: "deterministic",
    };
  }
}
```

```typescript
// code-grader.ts

export class CodeGrader implements ItemGrader {
  readonly kind = "code" as const;
  async grade({ item, response, ctx }: { item: AssignmentItem; response: AssignmentResponse | null; ctx: GraderContext }): Promise<GraderResult> {
    if (!item.testCases || item.testCases.length === 0 || !item.language) {
      return { score: null, feedback: "needs-human-review (no test cases or language)", tier: "needs-human-review" };
    }
    if (!response || response.response.trim() === "") {
      return { score: 0, feedback: "No code provided.", tier: "deterministic" };
    }

    let passed = 0;
    const failures: string[] = [];
    for (const tc of item.testCases) {
      const run = await ctx.services.sandbox.run({
        language: item.language,
        code: response.response,
        ...(tc.stdin !== undefined && { stdin: tc.stdin }),
        timeoutMs: tc.timeoutMs ?? 5000,
      });
      const ok = !run.timedOut && run.exitCode === 0 && run.stdout.trim() === tc.expectedStdout.trim();
      if (ok) passed++;
      else {
        const why = run.timedOut ? "timeout" : run.stderr.trim() ? "stderr" : "stdout mismatch";
        failures.push(`stdin=${JSON.stringify(tc.stdin ?? "")}: ${why}`);
      }
    }
    const score = passed / item.testCases.length;
    return {
      score,
      feedback: score === 1
        ? `All ${item.testCases.length} test cases passed.`
        : `${passed}/${item.testCases.length} test cases passed. Failures:\n${failures.join("\n")}`,
      tier: "deterministic",
    };
  }
}
```

**Implementation notes**:
- All four are pure functions wrapped in classes (for the port). No mutable state.
- `MathGrader` reads `item.prompt` as the equation — the design assumes the prompt itself is the equation in a form sympy can parse. Future iteration may add a separate `equation` field.
- `CodeGrader` runs each test case independently; partial credit is `passed / total`. Score < 1 triggers approach feedback (Unit 7) for quiz/homework.

**Acceptance criteria**:
- [ ] `MultipleChoiceGrader` returns score=1 for matching `correctOptionIndex`, score=0 otherwise.
- [ ] `ShortAnswerGrader` honors `acceptedAnswerMatch` ("exact" | "substring" | "normalized").
- [ ] `MathGrader` calls `SymPyService.checkSolution` and returns `needs-human-review` on parse error.
- [ ] `CodeGrader` returns partial scores when some tests fail.
- [ ] Empty / null responses produce score=0 with descriptive feedback (deterministic tier — "no answer" is a valid deterministic result).

---

### Unit 5: Rubric agent + free-response grader

**Files**:
- `packages/core/src/services/graders/rubric-agent.ts` (new — shared helper used by FreeResponseGrader and the workRubric blender in AssignmentService)
- `packages/core/src/services/graders/free-response-grader.ts` (new)
- `packages/core/src/services/graders/rubric-prompt.ts` (new)

```typescript
// rubric-agent.ts — shared per-criterion 0-10 grader

import { runOneShot } from "@praxis/engines";
import { z } from "zod";
import type { AssignmentItem, Rubric } from "../../types/artifacts.js";
import type { GraderContext, GraderResult } from "./types.js";
import { RUBRIC_SYSTEM_PROMPT } from "./rubric-prompt.js";

/**
 * Schema for the rubric agent's output: an entry per criterion with integer
 * 0-10 score and a written rationale. NO total score — the service computes
 * the weighted aggregate deterministically from the per-criterion scores.
 */
const RubricResultSchema = z.object({
  perCriterion: z.array(
    z.object({
      criterionId: z.string().min(1),
      score: z.number().int().min(0).max(10),
      rationale: z.string().min(1),
    }),
  ).min(1),
  /** Optional one-paragraph overall narrative (the agent may produce one). */
  feedback: z.string().min(1).optional(),
});

export interface RunRubricAgentInput {
  /** Item context — used in the prompt so the agent knows what was asked. */
  item: AssignmentItem;
  rubric: Rubric;
  /** What the student wrote — for free-response, the response; for workRubric on math/code, the work text. */
  text: string;
  /** Tag identifying which rubric this is — propagated to GradeItem.perCriterion[i].source. */
  source: "rubric" | "work-rubric";
  ctx: GraderContext;
}

/**
 * Run the rubric agent on a (item, rubric, text) triple. Returns a GraderResult
 * with `perCriterion` populated and `score` computed deterministically as the
 * weighted sum of (criterion.score / 10) × criterion.weight.
 */
export async function runRubricAgent(input: RunRubricAgentInput): Promise<GraderResult> {
  const { item, rubric, text, source, ctx } = input;

  if (text.trim() === "") {
    return { score: 0, feedback: "No response provided.", tier: "deterministic" };
  }

  const userMessage = buildRubricUserMessage(item, rubric, text);
  const events = runOneShot(
    ctx.services.engineResolver(),
    {
      systemPrompt: RUBRIC_SYSTEM_PROMPT,
      tools: { list: () => [], dispatch: noopDispatch },
      maxSteps: 1,
    },
    userMessage,
  );

  let assistantText = "";
  for await (const ev of events) {
    if (ev.type === "model_message") assistantText += ev.content;
    if (ev.type === "error") {
      ctx.log.warn("rubric.engine_error", { error: ev.error.message, source });
      return {
        score: null,
        feedback: `needs-human-review (rubric agent error: ${ev.error.message})`,
        tier: "needs-human-review",
      };
    }
  }

  const parsed = RubricResultSchema.safeParse(extractJsonBlock(assistantText));
  if (!parsed.success) {
    ctx.log.warn("rubric.parse_failed", { errors: parsed.error.flatten(), source });
    return {
      score: null,
      feedback: "needs-human-review (rubric agent output failed validation)",
      tier: "needs-human-review",
    };
  }

  // Validate every per-criterion entry maps to a known criterion id; drop unknowns with a warn.
  const knownIds = new Set(rubric.criteria.map((c) => c.id));
  const validEntries = parsed.data.perCriterion.filter((e) => {
    if (!knownIds.has(e.criterionId)) {
      ctx.log.warn("rubric.unknown_criterion", { criterionId: e.criterionId, source });
      return false;
    }
    return true;
  });
  if (validEntries.length === 0) {
    return {
      score: null,
      feedback: "needs-human-review (rubric agent produced no valid per-criterion entries)",
      tier: "needs-human-review",
    };
  }

  // Deterministic weighted sum: total = Σ((score / 10) × weight).
  // Criteria the agent didn't score get weight 0 contribution (effectively a 0).
  const scoreById = new Map(validEntries.map((e) => [e.criterionId, e.score]));
  let total = 0;
  for (const c of rubric.criteria) {
    const s = scoreById.get(c.id) ?? 0;
    total += (s / 10) * c.weight;
  }
  // Clamp to [0..1] for floating-point safety.
  total = Math.max(0, Math.min(1, total));

  // Build feedback: prefer the agent's overall narrative if provided; otherwise compose from rationales.
  const feedback = parsed.data.feedback ?? composeFeedbackFromCriteria(validEntries, rubric);

  return {
    score: total,
    feedback,
    tier: "rubric-agent",
    perCriterion: validEntries.map((e) => ({
      criterionId: e.criterionId,
      score: e.score,
      rationale: e.rationale,
      source,
    })),
  };
}

function buildRubricUserMessage(item: AssignmentItem, rubric: Rubric, text: string): string {
  // Markdown-ish payload the LLM scans. Includes:
  //   - Item prompt
  //   - Each criterion: id, description, weight, anchors (if any)
  //   - Student text
  // Format implementation in tests; design intent is "criterion-by-criterion narrative".
}

function composeFeedbackFromCriteria(
  entries: Array<{ criterionId: string; score: number; rationale: string }>,
  rubric: Rubric,
): string {
  const byId = new Map(rubric.criteria.map((c) => [c.id, c]));
  return entries
    .map((e) => {
      const c = byId.get(e.criterionId);
      const name = c?.description ?? e.criterionId;
      return `${name}: ${e.score}/10. ${e.rationale}`;
    })
    .join("\n");
}

function extractJsonBlock(text: string): unknown { /* same fenced/bare JSON parser as Phase 6 / 7 */ }

async function noopDispatch(): Promise<{ ok: false; error: { code: string; message: string; recoverable: boolean } }> {
  return { ok: false, error: { code: "no_tools", message: "rubric agent has no tools", recoverable: false } };
}
```

```typescript
// free-response-grader.ts

import type { AssignmentItem, AssignmentResponse } from "../../types/artifacts.js";
import { runRubricAgent } from "./rubric-agent.js";
import type { GraderContext, GraderResult, ItemGrader } from "./types.js";

export class FreeResponseGrader implements ItemGrader {
  readonly kind = "free-response" as const;

  async grade(input: {
    item: AssignmentItem;
    response: AssignmentResponse | null;
    ctx: GraderContext;
  }): Promise<GraderResult> {
    const { item, response, ctx } = input;

    if (!response || response.response.trim() === "") {
      return { score: 0, feedback: "No response provided.", tier: "deterministic" };
    }

    // Exam mode: rubric is REQUIRED (validated at item-create). If present, grade with rubric agent.
    // Quiz/homework: rubric preferred; falls back to acceptedAnswers if absent.
    if (item.rubric) {
      return runRubricAgent({
        item,
        rubric: item.rubric,
        text: response.response,
        source: "rubric",
        ctx,
      });
    }

    if (item.acceptedAnswers && item.acceptedAnswers.length > 0) {
      const ok = matchAcceptedAnswer(
        response.response,
        item.acceptedAnswers,
        item.acceptedAnswerMatch ?? "normalized",
      );
      return {
        score: ok ? 1 : 0,
        feedback: ok ? "Correct." : `Incorrect. Expected one of: ${item.acceptedAnswers.join(", ")}`,
        tier: "deterministic",
      };
    }

    return {
      score: null,
      feedback: "needs-human-review (free-response item has no rubric or acceptedAnswers)",
      tier: "needs-human-review",
    };
  }
}

function matchAcceptedAnswer(/* same helper as ShortAnswerGrader */): boolean { /* ... */ }
```

```typescript
// rubric-prompt.ts

export const RUBRIC_SYSTEM_PROMPT = `You are a rubric grader. Given an assignment item, a rubric with explicit criteria, and a student response, score EACH CRITERION individually with an integer score from 0 to 10 and a one-sentence rationale.

You do NOT produce a total score. The system computes the weighted total deterministically from your per-criterion scores. Your job is per-criterion judgment, nothing more.

Output a single JSON object in a \`\`\`json fence:

{
  "perCriterion": [
    {
      "criterionId": "<exact id from the rubric you were given>",
      "score": <integer 0 to 10>,
      "rationale": "<one sentence: why this score for this criterion, citing specific evidence from the student response>"
    },
    ...
  ],
  "feedback": "<optional: one to two sentences of overall feedback addressed to the student. Omit if the per-criterion rationales speak for themselves.>"
}

Rules:
- Score is INTEGER 0 to 10. Not 0.0 to 1.0. Not 0 to 100. Just 0, 1, 2, ..., 10.
- One entry per criterion in the rubric. Use the EXACT criterionId from the rubric.
- Calibrate to anchors when provided: "anchor at 5" means "this is what a 5 looks like for this criterion."
- Rationale addresses the student directly ("you").
- Do NOT invent criteria not in the rubric.
- Do NOT include any prose outside the JSON fence.`;
```

**Implementation notes**:
- `runRubricAgent` is the **single rubric-grading helper** used by both `FreeResponseGrader` (for `item.rubric`) and `AssignmentService.submit` (for `item.workRubric` blending). Single source of truth for per-criterion scoring.
- The aggregate `score` is computed by the helper, not the agent. The agent never produces a total; it scores per-criterion only.
- Exam mode is no longer special-cased here — `FreeResponseGrader` doesn't check `ctx.mode`. Instead, item-create validation (Unit 11) requires `rubric` for exam free-response items, so by the time grading runs, the rubric is guaranteed present.
- Reuses Phase 6 / 7 extractor's `extractJsonBlock` helper. If not exported, lift into a shared `packages/core/src/services/llm-helpers.ts`.
- Reuses Phase 7 misconception indexer's noop-dispatch pattern.
- The `feedback` field is optional from the agent — if omitted, the helper composes from per-criterion rationales (each criterion's name + score + rationale, joined with newlines).

**Acceptance criteria**:
- [ ] `runRubricAgent` produces `perCriterion` with one entry per criterion, integer scores 0-10.
- [ ] Aggregate `score` matches `Σ((perCriterion[i].score / 10) × rubric.criteria[i].weight)` within float tolerance.
- [ ] Unknown `criterionId` in agent output is dropped with a `warn` log, not a throw.
- [ ] Empty response returns score=0 with deterministic tier (no LLM call).
- [ ] Engine error → `needs-human-review` with descriptive feedback.
- [ ] Schema-invalid LLM output → `needs-human-review`.
- [ ] In quiz/homework: `FreeResponseGrader` grades via rubric agent when `rubric` present, falls back to `acceptedAnswers` when not, returns `needs-human-review` if neither.
- [ ] In exam: items without rubric never reach grading (rejected at create) — `FreeResponseGrader` is never asked to grade an exam free-response item without a rubric.

---

### Unit 6: Approach feedback agent (optional layer)

**Files**:
- `packages/core/src/services/graders/approach-feedback.ts` (new)
- `packages/core/src/services/graders/approach-prompt.ts` (new)

```typescript
// approach-feedback.ts

import { runOneShot } from "@praxis/engines";
import { z } from "zod";
import type { AssignmentItem } from "../../types/artifacts.js";
import type { GraderContext, GraderResult } from "./types.js";
import { APPROACH_SYSTEM_PROMPT } from "./approach-prompt.js";

const ApproachResultSchema = z.object({
  enrichedFeedback: z.string().min(1),
});

/**
 * Given an item, a student response, and the deterministic grading result,
 * run a one-shot LLM to enrich the feedback with approach-level analysis
 * ("your approach was correct but you flipped a sign at step 3").
 *
 * Skipped automatically when:
 *   - mode === "exam" (verification stance)
 *   - score === 1 (no value)
 *   - response is empty (no signal)
 *   - tier === "needs-human-review" (no deterministic anchor)
 *   - tier === "rubric-agent" (per-criterion rationales already provide rich feedback)
 *   - item has a rubric or workRubric (per-criterion grading already happened upstream)
 *
 * Returns the original GraderResult on skip; returns a new GraderResult
 * with feedback replaced (and `tier` unchanged) on enrichment success.
 *
 * Phase 8 v2: this is now a FALLBACK enrichment for items that don't have a
 * rubric or workRubric. Most items with prose-flavored grading get richer
 * per-criterion feedback through the rubric agent; approach-feedback fills
 * the gap for plain math/code items where the agent didn't add a workRubric.
 */
export async function enrichWithApproachFeedback(input: {
  item: AssignmentItem;
  response: string | null;
  base: GraderResult;
  ctx: GraderContext;
}): Promise<GraderResult> {
  if (input.ctx.mode === "exam") return input.base;
  if (input.base.score === 1) return input.base;
  if (input.base.tier === "needs-human-review") return input.base;
  if (input.base.tier === "rubric-agent") return input.base;
  if (input.item.rubric || input.item.workRubric) return input.base;
  if (!input.response || input.response.trim() === "") return input.base;

  // Run one-shot.
  const userMessage = buildApproachPrompt(input.item, input.response, input.base);
  const events = runOneShot(
    input.ctx.services.engineResolver(),
    { systemPrompt: APPROACH_SYSTEM_PROMPT, tools: { list: () => [], dispatch: noopDispatch }, maxSteps: 1 },
    userMessage,
  );

  let assistantText = "";
  for await (const ev of events) {
    if (ev.type === "model_message") assistantText += ev.content;
    if (ev.type === "error") {
      input.ctx.log.warn("approach.engine_error", { error: ev.error.message });
      return input.base; // graceful: return base on any error
    }
  }

  const parsed = ApproachResultSchema.safeParse(extractJsonBlock(assistantText));
  if (!parsed.success) return input.base;
  return {
    ...input.base,
    feedback: parsed.data.enrichedFeedback,
  };
}
```

```typescript
// approach-prompt.ts

export const APPROACH_SYSTEM_PROMPT = `You are a tutor reviewing a student's incorrect or partially-correct answer. You see:
- The item prompt
- The student's response
- The deterministic grader's verdict (score 0-1 and a short feedback line)

Your job: write enriched feedback that helps the student learn, NOT to change the score.
- Identify what was right about the student's approach (if anything).
- Identify the specific step or conception that went wrong.
- Address the student directly ("you").
- Two to four sentences. Concrete, kind, specific.

Output a single JSON object in a \`\`\`json fence:

{
  "enrichedFeedback": "<two to four sentences of enriched feedback>"
}

Do not include any prose outside the fence.`;
```

**Implementation notes**:
- Pure function (top-level export, not a class) — there's no per-item state.
- `enrichWithApproachFeedback` is called by the AssignmentService inside `submit` after the deterministic grader returns. It's not a method on `ItemGrader` because it's mode-aware logic, not item-kind-specific.
- All failures return the base result unchanged. The student always sees at least the deterministic feedback.

**Acceptance criteria**:
- [ ] `enrichWithApproachFeedback` skips on exam mode.
- [ ] Skips on `score === 1`.
- [ ] Skips on empty response.
- [ ] Skips on `tier === "needs-human-review"` or `tier === "rubric-agent"`.
- [ ] Skips when item has `rubric` or `workRubric` (rubric agent already provided per-criterion feedback).
- [ ] On engine error: returns `base` unchanged.
- [ ] On valid LLM output: replaces `feedback` field; preserves `score` and `tier`.

---

### Unit 7: `AssignmentServiceImpl`

**File**: `packages/core/src/services/assignment-service.ts` (new)

```typescript
import { assignmentResponses, assignments } from "@praxis/artifacts/schema";
import { and, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import type {
  Assignment,
  AssignmentId,
  AssignmentItem,
  AssignmentResponse,
  AssignmentService,
  AssignmentSubmissionResult,
  ConceptId,
  CourseId,
  Engine,
  Grade,
  GradeItem,
  Logger,
  StudentId,
  Timestamp,
} from "../types/index.js";
import { brandId } from "../types/index.js";
import { enrichWithApproachFeedback } from "./graders/approach-feedback.js";
import { buildGraderRegistry } from "./graders/registry.js";
import type { GraderContext, GraderServices } from "./graders/types.js";

export interface AssignmentServiceDeps {
  db: PraxisDb;
  log: Logger;
  graderServices: GraderServices;
  /**
   * Resolves the assignment's mode at submit time. The session that's submitting
   * the assignment carries the mode; the service reads it via this closure to
   * pass into GraderContext. Defaults to "quiz" when no session can be resolved.
   */
  resolveSubmissionMode: (assignmentId: AssignmentId) => "quiz" | "homework" | "exam";
  /**
   * Whether to run the approach-feedback layer for incorrect items in
   * quiz/homework. Default true.
   */
  enableApproachFeedback?: boolean;
}

export class AssignmentServiceImpl implements AssignmentService {
  private readonly registry = buildGraderRegistry();

  constructor(private readonly deps: AssignmentServiceDeps) {}

  async create(input: {
    courseId: CourseId;
    studentId: StudentId;
    kind: "quiz" | "homework" | "exam";
    title: string;
    items: AssignmentItem[];
    conceptIds: ConceptId[];
    authoredBy?: "tutor" | "configurator";
  }): Promise<{ assignmentId: AssignmentId }> {
    if (input.items.length === 0) throw new Error("Assignment must have at least one item");
    // Validate items via Zod (Unit 9 schema).
    validateItems(input.items, input.kind);

    const id = uuidv7();
    const now = new Date();
    this.deps.db.insert(assignments).values({
      id,
      courseId: input.courseId,
      kind: input.kind,
      title: input.title,
      itemsJson: input.items.map((it) => ({ ...it, authoredBy: it.authoredBy ?? input.authoredBy ?? "tutor" })),
      conceptIdsJson: input.conceptIds,
      assignedAt: now,
    }).run();
    return { assignmentId: brandId<"AssignmentId">(id) };
  }

  async get(input: { assignmentId: AssignmentId }): Promise<Assignment | null> {
    const row = this.deps.db.select().from(assignments).where(eq(assignments.id, input.assignmentId)).get();
    if (!row) return null;
    return rowToAssignment(row);
  }

  async list(input: { courseId: CourseId; kind?: "quiz" | "homework" | "exam" }): Promise<Assignment[]> {
    const where = input.kind
      ? and(eq(assignments.courseId, input.courseId), eq(assignments.kind, input.kind))
      : eq(assignments.courseId, input.courseId);
    const rows = this.deps.db.select().from(assignments).where(where).all();
    return rows.map(rowToAssignment);
  }

  async recordResponse(input: { assignmentId: AssignmentId; itemId: string; response: string }): Promise<void> {
    const now = new Date();
    this.deps.db.insert(assignmentResponses).values({
      assignmentId: input.assignmentId,
      itemId: input.itemId,
      response: input.response,
      recordedAt: now,
    }).onConflictDoUpdate({
      target: [assignmentResponses.assignmentId, assignmentResponses.itemId],
      set: { response: input.response, recordedAt: now },
    }).run();
  }

  async getResponses(input: { assignmentId: AssignmentId }): Promise<AssignmentResponse[]> {
    const rows = this.deps.db.select().from(assignmentResponses).where(eq(assignmentResponses.assignmentId, input.assignmentId)).all();
    return rows.map((r) => ({
      assignmentId: brandId<"AssignmentId">(r.assignmentId),
      itemId: r.itemId,
      response: r.response,
      recordedAt: r.recordedAt.getTime() as Timestamp,
    }));
  }

  async submit(input: { assignmentId: AssignmentId; responses?: AssignmentResponse[] }): Promise<AssignmentSubmissionResult> {
    const assignment = await this.get({ assignmentId: input.assignmentId });
    if (!assignment) throw new Error(`Assignment not found: ${input.assignmentId}`);
    if (assignment.submittedAt) throw new Error(`Assignment already submitted: ${input.assignmentId}`);

    const responses = input.responses ?? (await this.getResponses({ assignmentId: input.assignmentId }));
    const responseByItemId = new Map(responses.map((r) => [r.itemId, r]));

    const mode = this.deps.resolveSubmissionMode(input.assignmentId);
    const ctx: GraderContext = {
      log: this.deps.log,
      services: this.deps.graderServices,
      mode,
    };

    const perItem: GradeItem[] = [];
    let totalScore = 0;
    let scoredItemCount = 0;
    let highestTier: GradeItem["gradedBy"] = "deterministic";

    for (const item of assignment.items) {
      const grader = this.registry[item.kind];
      const response = responseByItemId.get(item.id) ?? null;

      // 1. Run the kind-specific grader.
      const baseResult = await grader.grade({ item, response, ctx });

      // 2. workRubric blending — only for math/code items with workRubric set.
      let finalResult = baseResult;
      if (
        item.workRubric &&
        (item.kind === "math" || item.kind === "code") &&
        response &&
        response.work !== undefined &&
        response.work.trim() !== ""
      ) {
        const workResult = await runRubricAgent({
          item,
          rubric: item.workRubric,
          text: response.work,
          source: "work-rubric",
          ctx,
        });
        const primaryWeight = item.primaryWeight ?? (mode === "exam" ? 1.0 : 0.5);
        finalResult = blendDeterministicAndWorkRubric(baseResult, workResult, primaryWeight);
      }

      // 3. Approach-feedback fallback — only when no rubric/workRubric was used upstream.
      const enableApproach = this.deps.enableApproachFeedback ?? true;
      if (enableApproach) {
        finalResult = await enrichWithApproachFeedback({
          item,
          response: response?.response ?? null,
          base: finalResult,
          ctx,
        });
      }

      perItem.push({
        itemId: item.id,
        score: finalResult.score,
        feedback: finalResult.feedback,
        gradedBy: finalResult.tier,
        ...(finalResult.perCriterion && { perCriterion: finalResult.perCriterion }),
        ...(finalResult.evidenceEventIds && { evidenceEventIds: finalResult.evidenceEventIds }),
      });
      if (finalResult.score !== null) {
        totalScore += finalResult.score;
        scoredItemCount++;
      }
      if (finalResult.tier === "needs-human-review") highestTier = "needs-human-review";
      else if (finalResult.tier === "rubric-agent" && highestTier !== "needs-human-review") highestTier = "rubric-agent";
    }

    const grade: Grade = {
      total: scoredItemCount > 0 ? totalScore / scoredItemCount : 0,
      perItem,
      reviewedBy: highestTier,
    };

    const submittedAt = new Date();
    this.deps.db.update(assignments).set({
      submittedAt,
      gradeJson: grade,
    }).where(eq(assignments.id, input.assignmentId)).run();

    return {
      assignmentId: input.assignmentId,
      grade,
      submittedAt: submittedAt.getTime() as Timestamp,
    };
  }
}
```

**Implementation notes**:
- The grading loop is sequential (not parallel) because:
  - The rubric agent and approach-feedback agent share the engine via `engineResolver()`. Parallel calls would compete.
  - 5-item quizzes finish in seconds; parallel optimization can come later.
- `Grade.total` is the average of scored items (excludes `null` scores from `needs-human-review` items). If all items are `needs-human-review`, total is 0 (with `reviewedBy: "needs-human-review"`).
- `validateItems` is a Zod-based per-kind validator (Unit 11). Exam-mode items add stricter validation: free-response items MUST have a `rubric`; if both rubric and acceptedAnswers are absent, item-create rejects.
- `blendDeterministicAndWorkRubric(base, work, primaryWeight)` is a small pure helper:
  ```typescript
  function blendDeterministicAndWorkRubric(base: GraderResult, work: GraderResult, primaryWeight: number): GraderResult {
    if (base.score === null || work.score === null) {
      // Either side is needs-human-review → fall back to the side that succeeded, or null.
      if (work.score !== null) return work;
      if (base.score !== null) return base;
      return { score: null, feedback: "needs-human-review", tier: "needs-human-review" };
    }
    const blended = primaryWeight * base.score + (1 - primaryWeight) * work.score;
    const blendedFeedback = `${base.feedback}\n\nWork: ${work.feedback}`;
    return {
      score: Math.max(0, Math.min(1, blended)),
      feedback: blendedFeedback,
      tier: "rubric-agent",  // LLM was involved, so the tier reflects that
      perCriterion: work.perCriterion,
      ...(work.evidenceEventIds && { evidenceEventIds: work.evidenceEventIds }),
    };
  }
  ```
- Submitting twice throws immediately — assignments are write-once.
- When `item.workRubric` is set but the student submits no `work` text: the deterministic grader's result is used (no blending). Students who skip the work field get no partial credit — the system rewards process by paying for it.

**Acceptance criteria**:
- [ ] `create({items: [...]})` validates each item; bad items throw with descriptive errors. Exam free-response items without a `rubric` are rejected.
- [ ] `submit` produces a `Grade` with one `GradeItem` per assignment item.
- [ ] `submit` throws on already-submitted assignment.
- [ ] `submit` reads persisted responses if `responses` arg is omitted.
- [ ] `recordResponse` is idempotent — calling twice with the same itemId updates `recordedAt`, `response`, and `work`.
- [ ] `Grade.total` is the average of non-null scores.
- [ ] After `submit`, `assignments.gradeJson` and `submittedAt` are populated.
- [ ] When item has `workRubric` AND student submitted `work`: blended score equals `primaryWeight × deterministicScore + (1 - primaryWeight) × workScore` within float tolerance.
- [ ] When item has `workRubric` but student submitted no `work`: result is deterministic-only (no blending).
- [ ] When item has rubric or workRubric: approach-feedback layer is skipped (verified by checking that no extra LLM call is made beyond the rubric agent).
- [ ] `GradeItem.perCriterion` is present and well-formed for items graded with rubric/workRubric; `source` field correctly tags `"rubric"` vs `"work-rubric"`.

---

### Unit 8: New modes — `quiz`, `homework`, `exam`

**Files**:
- `packages/curriculum/src/modes/quiz.ts` (new)
- `packages/curriculum/src/modes/homework.ts` (new)
- `packages/curriculum/src/modes/exam.ts` (new)
- `packages/curriculum/src/modes/fragments/quiz-role.ts` (new)
- `packages/curriculum/src/modes/fragments/homework-role.ts` (new)
- `packages/curriculum/src/modes/fragments/exam-role.ts` (new)
- `packages/curriculum/src/modes/fragments/assessment-tools.ts` (new)
- `packages/curriculum/src/modes/fragments/exam-tools.ts` (new)
- `packages/curriculum/src/modes/fragments/assignment-context.ts` (new — fallback)
- `packages/curriculum/src/modes/index.ts` (modified — register the three new modes)

```typescript
// quiz.ts

export const quizMode: Mode = {
  id: "quiz",
  label: "Quiz",
  description: "Short-form retrieval practice. Items shown via card; answers typed in card; immediate feedback after submission.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,
    quizRoleFragment,
    principlesFragment,
    assessmentToolsFragment,
    courseContextFragmentDefault,
    assignmentContextFragmentDefault,
    constraintsFragment,
    postambleFragment,
  ],
  toolNames: [
    "assignment.show",
    "assignment.read_grade",
    "course.what_can_i_teach",
    "course.current_concept",
    "retrieve_from_textbook",
    "grade_math",
    "code_sandbox",
    "update_mastery",
    "record_misconception",
  ],
  uiSurface: "chat",
};
```

```typescript
// homework.ts

export const homeworkMode: Mode = {
  id: "homework",
  label: "Homework",
  description: "Longer practice across multiple concepts. Agent clarifies items but doesn't give answers; feedback delayed until full submission.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,
    homeworkRoleFragment,
    principlesFragment,
    assessmentToolsFragment,
    courseContextFragmentDefault,
    assignmentContextFragmentDefault,
    constraintsFragment,
    postambleFragment,
  ],
  toolNames: quizMode.toolNames, // same as quiz; behavior diverges via prompt
  uiSurface: "chat",
};
```

```typescript
// exam.ts

export const examMode: Mode = {
  id: "exam",
  label: "Exam",
  description: "Gated assessment. Strict tool subset; no help during the exam; feedback only after full submission.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,
    examRoleFragment,
    principlesFragment,
    examToolsFragment,            // ← stricter
    courseContextFragmentDefault,
    assignmentContextFragmentDefault,
    constraintsFragment,
    postambleFragment,
  ],
  toolNames: [
    "assignment.show",
    "assignment.read_grade",
    // No retrieve_from_textbook, no mastery / misconception tools, no graders
    // (server handles all grading). Deliberately minimal.
  ],
  uiSurface: "chat",
};
```

```typescript
// quiz-role.ts

export const quizRoleFragment: PromptFragment = {
  id: "role.quiz",
  position: "role",
  customizable: true,
  template: `You are administering a quiz. Your job:
1. Greet the student and let them know there are <N> items to work through.
2. The items are shown to the student in a structured card. You don't have to read them aloud.
3. The student types their answer into the card. You can offer clarifying hints if asked, but don't give the answer.
4. After the student submits, you'll receive a tool result with their responses and grade. Narrate per-item feedback warmly — celebrate wins, name what to revisit on misses.`,
};
```

```typescript
// homework-role.ts

export const homeworkRoleFragment: PromptFragment = {
  id: "role.homework",
  position: "role",
  customizable: true,
  template: `You are guiding the student through homework. Your job:
1. Greet briefly.
2. The items are in a structured card. The student works through them at their own pace.
3. The student may ask clarifying questions about item wording — answer those without revealing answers.
4. Do NOT give per-item feedback while the student is still working. Wait for submission.
5. After submission, narrate full feedback in one go: what they got right, what to study, suggested next steps.

When you author homework via assignment.create, prefer items that reveal student reasoning. Add a workRubric on multi-step math/code items so the student earns partial credit for showing valid steps. Single-step recall items don't need workRubric — let the deterministic check handle them.`,
};
```

```typescript
// exam-role.ts

export const examRoleFragment: PromptFragment = {
  id: "role.exam",
  position: "role",
  customizable: false, // exam restraint is non-negotiable
  template: `You are proctoring an exam. Your job is to administer, not to teach.
1. Greet briefly. State that this is a graded exam and the chat is muted until they submit.
2. The items are in a structured card. The student fills them out and submits when ready.
3. If the student tries to chat with you mid-exam, acknowledge politely and remind them: "I can't help during an exam. Submit when you're done."
4. Do NOT clarify item meaning beyond reading the prompt back verbatim. The exam is a measure; help would corrupt it.
5. After submission, narrate per-item feedback once. No tutoring during this stage either — the exam is over; we save the learning for the next session.`,
};
```

```typescript
// assessment-tools.ts (shared by quiz + homework)

export const assessmentToolsFragment: PromptFragment = {
  id: "tools.assessment",
  position: "tools",
  customizable: false,
  template: `Tools available during this assessment:
- assignment.show — display the active assignment in the chat surface (the student already sees the card; call this if they ask "what was that quiz again?").
- assignment.read_grade — fetch the grade after the student submits. Use this to narrate feedback.
- course.what_can_i_teach — orient yourself on the active course / lesson.
- course.current_concept — fetch the next un-studied concept for context.
- retrieve_from_textbook — search the student's uploaded textbooks if you need to ground a hint or explanation.
- grade_math — verify a math expression on the fly when discussing answers post-submission. NEVER use this to grade the assignment yourself (the server already did).
- code_sandbox — run code to demonstrate concepts, post-submission only.
- update_mastery — record a mastery signal when you observe a clear teachable moment outside the assignment grading.
- record_misconception — record a misconception with at least one evidence event id.

The server has already graded each item by the time you see the submission. Do not re-grade. Read the per-item feedback from assignment.read_grade and narrate.`,
};
```

```typescript
// exam-tools.ts (stricter)

export const examToolsFragment: PromptFragment = {
  id: "tools.exam",
  position: "tools",
  customizable: false,
  template: `Tools available during this exam:
- assignment.show — display the active exam in the chat surface.
- assignment.read_grade — fetch the grade after the student submits. Use this AFTER submission to narrate per-item feedback.

You have no other tools available. The exam is graded by the server using deterministic graders for math/code/MC/short-answer and a rubric agent (per-criterion 0-10 scoring against the explicit rubric authored at item-create time) for free-response. Approach-feedback enrichment is OFF for exams. Do not attempt to teach, hint, or grade. The exam is a measure; you are the proctor.`,
};
```

```typescript
// assignment-context.ts (default fallback; replaced at session start when assignmentId is set)

export const assignmentContextFragmentDefault: PromptFragment = {
  id: "context.assignment-state",
  position: "context",
  customizable: true,
  template: `No assignment is bound to this session.`,
};
```

```typescript
// modes/index.ts (modified)

import { examMode } from "./exam.js";
import { homeworkMode } from "./homework.js";
import { quizMode } from "./quiz.js";

const MODE_REGISTRY: ReadonlyMap<string, Mode> = new Map([
  [teachMode.id, teachMode],
  [bootstrapMode.id, bootstrapMode],
  [quizMode.id, quizMode],
  [homeworkMode.id, homeworkMode],
  [examMode.id, examMode],
]);

export { teachMode, bootstrapMode, quizMode, homeworkMode, examMode };
```

**Acceptance criteria**:
- [ ] `getMode("quiz")`, `getMode("homework")`, `getMode("exam")` all return their respective modes.
- [ ] `examMode.toolNames.length` is 2 (only `assignment.show`, `assignment.read_grade`).
- [ ] `quizMode.toolNames` includes `retrieve_from_textbook`, `update_mastery`, `record_misconception`.
- [ ] `examRoleFragment.customizable === false` (exam restraint is non-negotiable).
- [ ] All three modes have `uiSurface: "chat"`.

---

### Unit 9: Assignment-context fragment + brief composer integration

**Files**:
- `packages/curriculum/src/brief/assignment-context.ts` (new)
- `packages/core/src/services/session-service.ts` (modified — inject assignment-context fragment when assignmentId is set)

```typescript
// packages/curriculum/src/brief/assignment-context.ts

import type { Assignment, AssignmentResponse, PromptFragment } from "@praxis/core/types";

export interface ComposeAssignmentContextInput {
  assignment: Assignment;
  responses: ReadonlyArray<AssignmentResponse>;
}

/**
 * Build a `context`-position PromptFragment summarizing the active assignment.
 * Includes the assignment kind, title, item count, current submission state,
 * and which items have responses recorded (without revealing the responses
 * themselves — that's not the agent's concern at brief time).
 */
export function composeAssignmentContextFragment(input: ComposeAssignmentContextInput): PromptFragment {
  const { assignment, responses } = input;
  const recordedItemIds = new Set(responses.map((r) => r.itemId));
  const lines: string[] = [];
  lines.push(`Active assignment: "${assignment.title}" (${assignment.kind}, ${assignment.items.length} items)`);
  if (assignment.submittedAt) {
    const grade = assignment.grade;
    lines.push(`Status: SUBMITTED. Total: ${grade ? grade.total.toFixed(2) : "—"}.`);
    if (grade) {
      lines.push(`Per-item: ${grade.perItem.map((p) => `${p.itemId}=${p.score === null ? "needs-review" : p.score.toFixed(2)}`).join(", ")}`);
      lines.push(`Use assignment.read_grade to fetch full per-item feedback for narration.`);
    }
  } else {
    const answered = assignment.items.filter((it) => recordedItemIds.has(it.id)).length;
    lines.push(`Status: IN PROGRESS. ${answered}/${assignment.items.length} items answered.`);
  }
  return {
    id: "context.assignment-state",
    position: "context",
    customizable: true,
    template: lines.join("\n"),
  };
}
```

In `SessionServiceImpl.openActive`, when `args.assignmentId` is set:

```typescript
if (args.assignmentId) {
  const assignment = await this.deps.toolServices.assignments.get({ assignmentId: args.assignmentId });
  const responses = await this.deps.toolServices.assignments.getResponses({ assignmentId: args.assignmentId });
  if (assignment) {
    const fragment = composeAssignmentContextFragment({ assignment, responses });
    overrides = new Map([
      ...(overrides ?? []),
      [fragment.id, fragment.template],
    ]);
  }
}
```

**Implementation notes**:
- The agent sees the submission state (in-progress vs. submitted) and per-item completion count, but NOT the response text. The agent doesn't need to grade or critique mid-flight; the server does that.
- After submission, the brief includes the total score so the agent can decide whether to celebrate or commiserate before calling `assignment.read_grade` for full per-item feedback.
- Combined with the Phase 6 course-context override, both fragments compose cleanly through the same `overrides` map.

**Acceptance criteria**:
- [ ] Sessions started with `{modeId: "quiz", assignmentId}` see an `Active assignment:` line in their system prompt.
- [ ] Sessions WITHOUT an `assignmentId` use the default fallback ("No assignment is bound to this session.").
- [ ] After submission, the prompt reflects "Status: SUBMITTED" and the total score.

---

### Unit 10: SessionService — extend `start` with `assignmentId`

**Files**:
- `packages/core/src/types/client.ts` (modified — `SessionService.start` signature)
- `packages/core/src/types/tool.ts` (modified — server-side `SessionService` mirrors)
- `packages/core/src/services/session-service.ts` (modified — persist + plumb)

```typescript
// client-side SessionService (packages/core/src/types/client.ts)
export interface SessionService {
  start(opts: {
    courseId?: CourseId;
    assignmentId?: AssignmentId; // ← Phase 8 NEW
    modeId: string;
  }): Promise<SessionHandle>;
  // ... others unchanged
}

export interface SessionHandle {
  sessionId: SessionId;
  courseId?: CourseId;
  assignmentId?: AssignmentId; // ← Phase 8 NEW
  modeId: string;
  startedAt: Timestamp;
}
```

`SessionServiceImpl.start` accepts `assignmentId` and writes it to `sessions.assignment_id`. `openActive` reads the column and plumbs into `args.assignmentId` for the brief composer (Unit 9). The `ToolContext` is extended with `assignmentId?: AssignmentId` (mirrors the Phase 6 `courseId` plumb-through).

**Implementation notes**:
- The composer uses an `if (overrides)` accumulator pattern so course-context (Phase 6) and assignment-context (Phase 8) overrides can both apply on the same session.
- Resumed sessions (after a process restart) still know their assignment because it's in the row.
- For non-assessment modes (`teach`, `bootstrap`), `assignmentId` is null — the assignment-context fragment falls back to the default "no assignment" template.

**Acceptance criteria**:
- [ ] `client.session.start({modeId: "quiz", courseId, assignmentId})` returns a handle with `assignmentId` set.
- [ ] Resuming a quiz session (engine swap, process restart) re-reads the assignmentId from the DB and reseeds the brief.
- [ ] Sessions started without `assignmentId` continue to work as before.

---

### Unit 11: Active-path tools — `assignment.create`, `assignment.show`, `assignment.read_grade`

**Files**:
- `packages/tools/src/assignment/create.ts` (new)
- `packages/tools/src/assignment/show.ts` (new)
- `packages/tools/src/assignment/read-grade.ts` (new)
- `packages/tools/src/assignment/item-schema.ts` (new — Zod discriminated union for AssignmentItem)
- `packages/tools/src/assignment/index.ts` (new)

```typescript
// item-schema.ts — Zod discriminated union per AssignmentItem.kind

import { z } from "zod";

const RubricSchema = z.object({
  criteria: z.array(z.object({
    id: z.string().min(1),
    description: z.string().min(1),
    weight: z.number().min(0).max(1),
    anchors: z.array(z.object({
      score: z.number().int().min(0).max(10),
      description: z.string().min(1),
    })).optional(),
  })).min(1).refine(
    (criteria) => Math.abs(criteria.reduce((s, c) => s + c.weight, 0) - 1.0) < 0.01,
    { message: "Criterion weights must sum to 1.0 (within ±0.01)" },
  ),
  maxScore: z.number().positive(),
});

const BaseItem = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  /** Phase 8 v2: optional partial-credit rubric for math/code work. */
  workRubric: RubricSchema.optional(),
  /** Default 0.5 for quiz/homework, 1.0 for exam. Validated 0..1. */
  primaryWeight: z.number().min(0).max(1).optional(),
});

export const AssignmentItemSchema = z.discriminatedUnion("kind", [
  BaseItem.extend({
    kind: z.literal("multiple-choice"),
    options: z.array(z.string()).min(2),
    correctOptionIndex: z.number().int().nonnegative(),
  }),
  BaseItem.extend({
    kind: z.literal("short-answer"),
    acceptedAnswers: z.array(z.string()).min(1),
    acceptedAnswerMatch: z.enum(["exact", "substring", "normalized"]).optional(),
  }),
  BaseItem.extend({
    kind: z.literal("math"),
    expectedSolution: z.object({
      variable: z.string().min(1),
      value: z.string().min(1),
    }),
  }),
  BaseItem.extend({
    kind: z.literal("code"),
    language: z.enum(["javascript", "python"]),
    testCases: z.array(z.object({
      stdin: z.string().optional(),
      expectedStdout: z.string(),
      timeoutMs: z.number().int().positive().optional(),
    })).min(1),
  }),
  BaseItem.extend({
    kind: z.literal("free-response"),
    rubric: RubricSchema.optional(),
    acceptedAnswers: z.array(z.string()).optional(),
  }),
]);

/**
 * Mode-aware additional validation. Exam free-response items MUST have a rubric.
 * Called by the assignment.create tool after the per-kind schema validates.
 */
export function validateForMode(items: z.infer<typeof AssignmentItemSchema>[], mode: "quiz" | "homework" | "exam"): void {
  if (mode === "exam") {
    for (const item of items) {
      if (item.kind === "free-response" && !item.rubric) {
        throw new Error(`Exam free-response items require a rubric: item "${item.id}" has none`);
      }
    }
  }
}
```

```typescript
// create.ts

const InputSchema = z.object({
  courseId: z.string(),
  kind: z.enum(["quiz", "homework", "exam"]),
  title: z.string().min(1),
  items: z.array(AssignmentItemSchema).min(1),
  conceptIds: z.array(z.string()),
});
const OutputSchema = z.object({
  ok: z.literal(true),
  assignmentId: z.string(),
  itemCount: z.number().int().positive(),
});

export const createAssignmentTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "assignment.create",
  description: `Author a new assignment (quiz, homework, or exam) for the active course. Provide a title, list of items, and the conceptIds the assignment covers. Items must include grader-specific fields per kind:
- multiple-choice: options[] + correctOptionIndex
- short-answer: acceptedAnswers[] + acceptedAnswerMatch ("exact" | "substring" | "normalized")
- math: expectedSolution { variable, value }
- code: language ("javascript" | "python") + testCases[]
- free-response: rubric (REQUIRED for exam mode; quiz/homework can fall back to acceptedAnswers)

Optional workRubric for partial credit on shown work (math/code items only):

Add a workRubric ONLY when the item rewards process — multi-step problems where the steps reveal understanding (algebra word problems, geometry proofs, physics derivations, code where structure matters). Skip workRubric for:
  - One-step recall items ("what is 2+3?", "factor x²+5x+6")
  - Multiple choice or short-answer (no work to show)
  - Items where the work IS the answer

By mode:
  - quiz: workRubric is rare. Items are short retrieval practice; partial credit slows the loop. Reserve for the 1-2 multi-step items per quiz where it adds real value.
  - homework: workRubric is common. Items are practice for depth; partial credit on shown reasoning is the point.
  - exam: workRubric is judgment-call per item. Set primaryWeight to reflect stakes — 1.0 (deterministic-only) for high-stakes items unless a pre-authored rubric warrants partial credit.

Rubrics use criteria with weights summing to 1.0 (validated). Each criterion has a description and an integer 0-10 score is produced by the rubric agent at grading time.`,
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: ["artifact.mutate"],
  async handler(args, ctx) {
    const { assignmentId } = await ctx.services.assignments.create({
      courseId: brandId<"CourseId">(args.courseId),
      studentId: ctx.studentId,
      kind: args.kind,
      title: args.title,
      items: args.items as unknown as AssignmentItem[],
      conceptIds: args.conceptIds.map((id) => brandId<"ConceptId">(id)),
      authoredBy: "tutor",
    });
    return { ok: true, assignmentId, itemCount: args.items.length };
  },
};
```

```typescript
// show.ts

const InputSchema = z.object({
  assignmentId: z.string().optional(),
});
const OutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    assignment: z.unknown(), // Assignment (full object); UI renders via DraftCard-style dispatch
  }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("no_assignment_in_session") }),
]);

export const showAssignmentTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "assignment.show",
  description: "Display the active assignment in the chat surface. The student already sees the card; call this if they ask 'what was that quiz again?' or if you want to redirect attention to it. If no assignmentId is provided, uses the session's bound assignmentId.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx) {
    const id = args.assignmentId ?? ctx.assignmentId;
    if (!id) return { kind: "no_assignment_in_session" as const };
    const a = await ctx.services.assignments.get({ assignmentId: brandId<"AssignmentId">(id) });
    if (!a) return { kind: "not_found" as const };
    return { kind: "ok" as const, assignment: a };
  },
};
```

```typescript
// read-grade.ts

const InputSchema = z.object({
  assignmentId: z.string().optional(),
});
const OutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("graded"),
    grade: z.unknown(), // Grade
    submittedAt: z.number(),
  }),
  z.object({ kind: z.literal("not_yet_submitted") }),
  z.object({ kind: z.literal("not_found") }),
]);

export const readGradeTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "assignment.read_grade",
  description: "Fetch the grade for an assignment. Use this AFTER submission to narrate per-item feedback in the chat. Each item's feedback explains what was right/wrong; the gradedBy field tells you whether the grade came from a deterministic grader (definitive) or the rubric agent (advisory).",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx) {
    const id = args.assignmentId ?? ctx.assignmentId;
    if (!id) return { kind: "not_found" as const };
    const a = await ctx.services.assignments.get({ assignmentId: brandId<"AssignmentId">(id) });
    if (!a) return { kind: "not_found" as const };
    if (!a.submittedAt || !a.grade) return { kind: "not_yet_submitted" as const };
    return { kind: "graded" as const, grade: a.grade, submittedAt: a.submittedAt };
  },
};
```

```typescript
// index.ts

export { createAssignmentTool } from "./create.js";
export { showAssignmentTool } from "./show.js";
export { readGradeTool } from "./read-grade.js";

import { createAssignmentTool } from "./create.js";
import { readGradeTool } from "./read-grade.js";
import { showAssignmentTool } from "./show.js";

/** Tools the tutor (teach mode) uses to author assignments. */
export const ASSIGNMENT_TUTOR_TOOLS = [createAssignmentTool] as const;

/** Tools used during taking an assignment (quiz / homework / exam modes). */
export const ASSIGNMENT_TAKE_TOOLS = [showAssignmentTool, readGradeTool] as const;
```

**Implementation notes**:
- `assignment.create` validates each item via the discriminated-union Zod schema — bad items fail at tool dispatch with a precise error.
- `assignment.show` and `assignment.read_grade` accept an optional `assignmentId` arg; default to the session's `ctx.assignmentId` when omitted.
- `teach` mode adds `assignment.create` to its `toolNames` (Unit 12 wiring).

**Acceptance criteria**:
- [ ] `assignment.create` rejects items missing required per-kind fields (e.g., math without `expectedSolution`).
- [ ] `assignment.show` returns `kind: "no_assignment_in_session"` when called outside an assignment-bound session with no explicit ID.
- [ ] `assignment.read_grade` returns `kind: "not_yet_submitted"` before submission.

---

### Unit 12: ServiceDeps + buildServices wiring

**Files**:
- `packages/core/src/services/types.ts` (modified — `toolServices.assignments`)
- `packages/desktop/electron/main/services.ts` (modified)
- `packages/curriculum/src/modes/teach.ts` (modified — append `assignment.create`)

```typescript
// teach.ts — append
toolNames: [
  // ... existing ...
  "assignment.create",  // ← Phase 8
],
```

```typescript
// services.ts — additions inside buildServices

import { AssignmentServiceImpl } from "@praxis/core/services";
import { examMode, homeworkMode, quizMode } from "@praxis/curriculum/modes";
import { ASSIGNMENT_TAKE_TOOLS, ASSIGNMENT_TUTOR_TOOLS } from "@praxis/tools/assignment";

const assignmentService = new AssignmentServiceImpl({
  db,
  log,
  graderServices: {
    sympy,
    sandbox,
    engineResolver: bootstrapEngineResolver, // reuse Phase 6's resolver
  },
  resolveSubmissionMode: (assignmentId) => {
    // Look up the most recent session with this assignmentId; return its modeId.
    // Fallback: read the assignment's `kind` (which mirrors the mode id).
    const a = db.select().from(assignments).where(eq(assignments.id, assignmentId)).get();
    return (a?.kind as "quiz" | "homework" | "exam") ?? "quiz";
  },
  enableApproachFeedback: true,
});

const modes = new Map([
  [teachMode.id, teachMode],
  [bootstrapMode.id, bootstrapMode],
  [quizMode.id, quizMode],          // ← Phase 8
  [homeworkMode.id, homeworkMode],  // ← Phase 8
  [examMode.id, examMode],          // ← Phase 8
]);

const toolDefinitions = [
  // ... existing ...
  ...ASSIGNMENT_TUTOR_TOOLS,    // ← Phase 8
  ...ASSIGNMENT_TAKE_TOOLS,     // ← Phase 8
];

const deps: ServiceDeps = {
  // ... existing ...
  toolServices: {
    // ... existing ...
    assignments: assignmentService, // ← Phase 8
  },
};

return {
  // ... existing ...
  assignments: assignmentService,    // ← Phase 8 (exposed for IPC)
};
```

**Acceptance criteria**:
- [ ] `buildServices` exposes `assignments` on the `Services` interface.
- [ ] `teachMode.toolNames` includes `assignment.create`.
- [ ] `quizMode`, `homeworkMode`, `examMode` are registered in the mode registry.

---

### Unit 13: `praxis.assignments.*` IPC + `AssignmentsClient`

**Files**:
- `packages/desktop/electron/main/ipc-server.ts` (modified)
- `packages/client/src/services/assignments-client.ts` (new)
- `packages/client/src/client.ts` (modified — wire `AssignmentsClient`)
- `packages/core/src/types/client.ts` (modified — add `AssignmentsClient` to `PraxisClient`)

IPC channels:

```
praxis.assignments.get               -> Assignment | null
praxis.assignments.list              -> Assignment[]
praxis.assignments.recordResponse    -> void
praxis.assignments.getResponses      -> AssignmentResponse[]
praxis.assignments.submit            -> AssignmentSubmissionResult
```

```typescript
// packages/client/src/services/assignments-client.ts

import type {
  Assignment,
  AssignmentId,
  AssignmentResponse,
  AssignmentSubmissionResult,
  CourseId,
} from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = {
  get: "praxis.assignments.get",
  list: "praxis.assignments.list",
  recordResponse: "praxis.assignments.recordResponse",
  getResponses: "praxis.assignments.getResponses",
  submit: "praxis.assignments.submit",
} as const;

export interface AssignmentsClient {
  get(input: { assignmentId: AssignmentId }): Promise<Assignment | null>;
  list(input: { courseId: CourseId; kind?: "quiz" | "homework" | "exam" }): Promise<Assignment[]>;
  recordResponse(input: { assignmentId: AssignmentId; itemId: string; response: string }): Promise<void>;
  getResponses(input: { assignmentId: AssignmentId }): Promise<AssignmentResponse[]>;
  submit(input: { assignmentId: AssignmentId }): Promise<AssignmentSubmissionResult>;
}

class AssignmentsClientImpl implements AssignmentsClient {
  constructor(private readonly transport: ClientTransport) {}

  get(input: { assignmentId: AssignmentId }): Promise<Assignment | null> {
    return this.transport.invoke<Assignment | null>(C.get, input);
  }

  list(input: { courseId: CourseId; kind?: "quiz" | "homework" | "exam" }): Promise<Assignment[]> {
    return this.transport.invoke<Assignment[]>(C.list, input);
  }

  recordResponse(input: { assignmentId: AssignmentId; itemId: string; response: string }): Promise<void> {
    return this.transport.invoke<void>(C.recordResponse, input);
  }

  getResponses(input: { assignmentId: AssignmentId }): Promise<AssignmentResponse[]> {
    return this.transport.invoke<AssignmentResponse[]>(C.getResponses, input);
  }

  submit(input: { assignmentId: AssignmentId }): Promise<AssignmentSubmissionResult> {
    return this.transport.invoke<AssignmentSubmissionResult>(C.submit, input);
  }
}

export { AssignmentsClientImpl as AssignmentsClient };
```

The IPC `submit` handler must, after grading completes, **synthesize a `tool_result` event** for the active session bound to that assignmentId so the agent's next turn picks it up:

```typescript
handle("praxis.assignments.submit", async (_event, input: { assignmentId: string }) => {
  const result = await services.assignments.submit({ assignmentId: brandId<"AssignmentId">(input.assignmentId) });

  // Synthesize a tool_result event into the active session's stream.
  const sessionId = services.session.findActiveSessionForAssignment(input.assignmentId);
  if (sessionId) {
    services.session.injectSyntheticEvent(sessionId, {
      type: "tool_result",
      callId: `synthetic-${input.assignmentId}`,
      result: { ok: true, value: { kind: "submission_received", assignmentId: input.assignmentId, grade: result.grade }, tier: "grounded" },
    });
  }
  return result;
});
```

`SessionService` gains two helper methods:
- `findActiveSessionForAssignment(assignmentId): string | null`
- `injectSyntheticEvent(sessionId, event: EngineEvent): void` — appends to episodic AND pushes onto the active EngineSession's outgoing stream (if open). Implementation detail: the orchestrator already holds the AsyncIterator; injection requires a small queue per session that the iterator consumes alongside engine events.

**Implementation notes**:
- The synthetic-event injection is the trickiest part of Phase 8. The simplest implementation: add a per-session `pendingExternalEvents: EngineEvent[]` queue on `SessionServiceImpl`. The `for-await` loop in `send` checks the queue at each iteration and yields any pending events before the next engine event. **OR**: skip the synthetic-event approach and have the agent receive submission via a synthetic user_message instead ("The student just submitted. Grade: X. Per-item: ...").
- Easier alternative: do nothing automatic. The student types "I submitted, what'd I get?" and the agent calls `assignment.read_grade`. This is simpler but requires the student to prompt the agent. Acceptable for v1; document in CURRICULUM.md.
- I'll specify the **easier alternative** for Phase 8: no synthetic event injection. The agent reads the grade when prompted by the user OR by detecting the submission state from the brief context (the assignment-context fragment notes "Status: SUBMITTED" so the agent on its next turn knows submission happened and can call `read_grade`).

**Revised behavior**: post-submission, the brief includes "Status: SUBMITTED. Total: 0.80." The agent's next turn sees this and naturally calls `assignment.read_grade` to narrate. The student's next message can be anything — the agent picks up the submission contextually.

**Acceptance criteria**:
- [ ] `client.assignments.submit({assignmentId})` returns the `AssignmentSubmissionResult`.
- [ ] The `assignments` row has `submittedAt` and `gradeJson` populated after `submit`.
- [ ] The next turn in the active session sees the updated brief context (Status: SUBMITTED).

---

### Unit 14: UI components — `<AssignmentCard>`, `<AssignmentItemCard>`, `<AssignmentFeedback>`

**Files**:
- `packages/ui/src/components/assignment-card.tsx` (new)
- `packages/ui/src/components/assignment-item-card.tsx` (new)
- `packages/ui/src/components/assignment-feedback.tsx` (new)
- `packages/ui/src/hooks/use-assignment.ts` (new)

```typescript
// hooks/use-assignment.ts

export function useAssignment(assignmentId: AssignmentId | undefined): {
  assignment: Assignment | null;
  responses: Map<string, string>;
  /** Phase 8 v2: shown work per item id (only set for items with workRubric). */
  work: Map<string, string>;
  loading: boolean;
  error: string | null;
  recordResponse: (itemId: string, response: string, work?: string) => Promise<void>;
  submit: () => Promise<AssignmentSubmissionResult>;
  refresh: () => Promise<void>;
};
```

```tsx
// components/assignment-card.tsx (sketch)

interface AssignmentCardProps {
  assignmentId: AssignmentId;
  /** True for exam mode — disables chat composer at the parent level too. */
  examLockdown?: boolean;
}

export function AssignmentCard({ assignmentId, examLockdown }: AssignmentCardProps) {
  const { assignment, responses, recordResponse, submit, loading, error } = useAssignment(assignmentId);
  const [submitting, setSubmitting] = useState(false);
  const [grade, setGrade] = useState<Grade | null>(null);

  // Auto-save on response change (1s debounce).
  // ...

  const handleSubmit = async () => {
    setSubmitting(true);
    const result = await submit();
    setGrade(result.grade);
    setSubmitting(false);
  };

  if (!assignment) return null;
  return (
    <article className={styles.card}>
      <header>
        <span className={styles.kindBadge}>{assignment.kind.toUpperCase()}</span>
        <h3>{assignment.title}</h3>
        <p>{assignment.items.length} items</p>
      </header>
      <ol className={styles.items}>
        {assignment.items.map((item, i) => {
          const itemGrade = grade?.perItem.find((p) => p.itemId === item.id);
          return (
            <li key={item.id}>
              <AssignmentItemCard
                item={item}
                index={i}
                response={responses.get(item.id) ?? ""}
                onResponseChange={(r) => recordResponse(item.id, r)}
                disabled={!!grade || submitting}
              />
              {itemGrade && <AssignmentFeedback grade={itemGrade} />}
            </li>
          );
        })}
      </ol>
      {!grade && (
        <button
          type="button"
          className={styles.submitBtn}
          disabled={submitting}
          onClick={handleSubmit}
        >
          {submitting ? "Grading…" : "Submit"}
        </button>
      )}
    </article>
  );
}
```

```tsx
// components/assignment-item-card.tsx (sketch)

interface AssignmentItemCardProps {
  item: AssignmentItem;
  index: number;
  response: string;
  /** Phase 8 v2: shown work text (only relevant when item has workRubric). */
  work?: string;
  onResponseChange: (response: string) => void;
  /** Called when shown work changes — only invoked for items with workRubric. */
  onWorkChange?: (work: string) => void;
  disabled?: boolean;
}

export function AssignmentItemCard({ item, index, response, work, onResponseChange, onWorkChange, disabled }: AssignmentItemCardProps) {
  const hasWorkRubric = !!item.workRubric;

  return (
    <div className={styles.itemCard}>
      <header>
        <span className={styles.itemNumber}>Item {index + 1}</span>
        <span className={styles.itemKind}>{item.kind}</span>
        {hasWorkRubric && <span className={styles.partialCreditBadge}>partial credit available</span>}
      </header>
      <p className={styles.prompt}>{item.prompt}</p>

      {/* Work field — shown for math/code items with workRubric */}
      {hasWorkRubric && (item.kind === "math" || item.kind === "code") && (
        <div className={styles.workSection}>
          <label className={styles.workLabel}>Show your work (optional, earns partial credit):</label>
          <textarea
            className={item.kind === "code" ? styles.codeInput : styles.workInput}
            value={work ?? ""}
            onChange={(e) => onWorkChange?.(e.target.value)}
            disabled={disabled}
            rows={item.kind === "code" ? 10 : 5}
          />
        </div>
      )}

      {/* Primary input — always present */}
      {item.kind === "multiple-choice" && item.options && (
        <ul className={styles.options}>
          {item.options.map((opt, i) => (
            <li key={i}>
              <label>
                <input
                  type="radio"
                  name={`item-${item.id}`}
                  value={i}
                  checked={response === String(i)}
                  onChange={() => onResponseChange(String(i))}
                  disabled={disabled}
                />
                {opt}
              </label>
            </li>
          ))}
        </ul>
      )}
      {item.kind === "short-answer" && (
        <input
          type="text"
          value={response}
          onChange={(e) => onResponseChange(e.target.value)}
          disabled={disabled}
        />
      )}
      {item.kind === "math" && (
        <div className={styles.mathAnswer}>
          {hasWorkRubric && <label className={styles.answerLabel}>Final answer:</label>}
          <input
            type="text"
            className={styles.mathInput}
            value={response}
            onChange={(e) => onResponseChange(e.target.value)}
            disabled={disabled}
            placeholder="Enter your answer (e.g., x = 3)"
          />
        </div>
      )}
      {item.kind === "code" && !hasWorkRubric && (
        <textarea
          className={styles.codeInput}
          value={response}
          onChange={(e) => onResponseChange(e.target.value)}
          disabled={disabled}
          rows={10}
        />
      )}
      {/* For code items WITH workRubric, the work field IS the code; no separate "answer" field. */}
      {item.kind === "code" && hasWorkRubric && null}
      {item.kind === "free-response" && (
        <textarea
          value={response}
          onChange={(e) => onResponseChange(e.target.value)}
          disabled={disabled}
          rows={5}
        />
      )}
    </div>
  );
}
```

For code items with `workRubric`: the rubric agent grades the code-as-work, and the deterministic grader runs on the SAME code text (the `response` field is set to the code by the UI when it submits). The two fields collapse to one input — the code is both work and answer.

```tsx
// components/assignment-feedback.tsx (sketch)

interface AssignmentFeedbackProps {
  grade: GradeItem;
  /** The full rubric (for rendering criterion names alongside per-criterion scores). */
  rubric?: Rubric;
  workRubric?: Rubric;
}

export function AssignmentFeedback({ grade, rubric, workRubric }: AssignmentFeedbackProps) {
  const tone =
    grade.gradedBy === "needs-human-review" ? "review" :
    grade.score === null ? "review" :
    grade.score >= 0.7 ? "good" :
    grade.score >= 0.4 ? "partial" :
    "miss";

  const criterionNameById = new Map<string, string>();
  for (const c of rubric?.criteria ?? []) criterionNameById.set(c.id, c.description);
  for (const c of workRubric?.criteria ?? []) criterionNameById.set(c.id, c.description);

  return (
    <div className={`${styles.feedback} ${styles[tone]}`}>
      <span className={styles.scoreBadge}>
        {grade.score === null ? "needs review" : `${(grade.score * 100).toFixed(0)}%`}
      </span>
      <p className={styles.feedbackText}>{grade.feedback}</p>
      {grade.perCriterion && grade.perCriterion.length > 0 && (
        <details className={styles.perCriterion}>
          <summary>Per-criterion breakdown</summary>
          <ul>
            {grade.perCriterion.map((c) => (
              <li key={`${c.source}:${c.criterionId}`} className={styles.criterionRow}>
                <span className={styles.criterionName}>
                  {criterionNameById.get(c.criterionId) ?? c.criterionId}
                </span>
                <span className={styles.criterionScore}>{c.score}/10</span>
                <span className={styles.criterionSource}>
                  {c.source === "work-rubric" ? "(work)" : ""}
                </span>
                <p className={styles.criterionRationale}>{c.rationale}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
      {grade.gradedBy === "rubric-agent" && <small className={styles.tier}>(rubric agent)</small>}
    </div>
  );
}
```

The `<AssignmentCard>` parent passes the item's `rubric` and `workRubric` to `<AssignmentFeedback>` so criterion descriptions render with the per-criterion scores.

**Implementation notes**:
- Auto-save debounces by 1s (single-flight; cancel pending on new input).
- The card is rendered by the chat route when `session.assignmentId` is set. It sits inline with chat messages, visually distinct (border + background to look like a card).
- `<AssignmentCard examLockdown={mode === "exam"}>` passes through to disable chat composer at the chat route level (Unit 15).

**Acceptance criteria**:
- [ ] All five item kinds render their appropriate input control.
- [ ] Items with `workRubric` (math/code) show a "Show your work" textarea above the answer input; items without it show only the answer input.
- [ ] Auto-save fires on response change with 1s debounce, including when only `work` changes.
- [ ] Submit button shows "Grading…" while pending; disables card after grade lands.
- [ ] Per-item feedback renders with tone-coded styling.
- [ ] When `GradeItem.perCriterion` is present, the feedback card includes a collapsible per-criterion breakdown showing criterion description, integer 0-10 score, source tag (rubric vs work-rubric), and rationale.
- [ ] "Partial credit available" badge is visible on items with `workRubric`.

---

### Unit 15: Chat route integration

**File**: `packages/ui/src/routes/chat.tsx` (modified)

```tsx
// Inside ChatRoute, when session has assignmentId:

const examLockdown = session?.modeId === "exam" && /* assignment not yet submitted */;

return (
  <div className={styles.layout}>
    {/* Documents sidebar — unchanged */}
    {/* Main chat area */}
    <div className={styles.container}>
      {/* Existing message list */}
      <div className={styles.messages}>
        {messages.map((msg) => <MessageBubble key={msg.id} {...msg} />)}
        {/* Phase 8: render AssignmentCard inline if session is assignment-bound */}
        {session?.assignmentId && (
          <AssignmentCard
            assignmentId={session.assignmentId}
            examLockdown={examLockdown}
          />
        )}
      </div>
      {/* Composer — disabled in exam lockdown */}
      <Composer onSend={handleSend} disabled={isStreaming || examLockdown} />
      {examLockdown && (
        <div className={styles.lockdownNotice}>
          The chat is muted during the exam. Submit your answers to continue.
        </div>
      )}
    </div>
  </div>
);
```

**Implementation notes**:
- `examLockdown` becomes false once the assignment is submitted (re-render via `useAssignment` hook returning the latest state).
- The card sits at the bottom of the message list so it's visible without scrolling on session start.
- The chat composer behavior is just a `disabled` prop pass-through (Composer already supports it).

**Acceptance criteria**:
- [ ] Sessions with `assignmentId` render an `<AssignmentCard>` inline.
- [ ] Sessions without `assignmentId` behave exactly as Phase 6 (no card).
- [ ] In exam mode while unsubmitted: composer disabled, lockdown notice shown.
- [ ] In exam mode after submission: composer re-enabled.

---

### Unit 16: Tool-result dispatch in `useStreamedSend`

**File**: `packages/ui/src/hooks/use-streamed-send.ts` (modified)

When `tool_result` for `assignment.show` arrives, the UI doesn't need to do anything special — the `<AssignmentCard>` is already mounted (from session.assignmentId). When `tool_result` for `assignment.read_grade` arrives during a chat where the assignment is post-submission, the UI uses the agent's `model_message` content (which the agent narrates from the grade) — no special rendering needed.

**Implementation notes**:
- Keep `useStreamedSend` simple: the existing `lastToolCallName` tracking continues. We don't add new dispatch branches for `assignment.show` (the card is mounted from session state, not from the tool result). We don't add new dispatch for `assignment.read_grade` (the agent narrates).
- This is a deliberate simplification — the tools exist for the agent's benefit, not the UI's.

**Acceptance criteria**:
- [ ] No changes to `useStreamedSend` are required for Phase 8 beyond what's already there.

---

### Unit 17: `pnpm db:grades` script

**File**: `scripts/db-grades.ts` (new)

```typescript
import { openDb } from "@praxis/core/db";
import { assignments, courses } from "@praxis/artifacts/schema";
import { isNotNull } from "drizzle-orm";

const { db } = openDb({ readonly: true });
const rows = db.select().from(assignments).where(isNotNull(assignments.submittedAt)).all();
const courseTitles = new Map(
  db.select({ id: courses.id, title: courses.title }).from(courses).all().map((c) => [c.id, c.title]),
);

const formatted = rows.map((r) => {
  const grade = r.gradeJson as { total: number; perItem: Array<{ itemId: string; score: number | null }>; reviewedBy: string } | null;
  return {
    course: courseTitles.get(r.courseId) ?? r.courseId,
    title: r.title,
    kind: r.kind,
    total: grade ? grade.total.toFixed(2) : "—",
    items: grade ? `${grade.perItem.filter((p) => p.score !== null && p.score >= 0.7).length}/${grade.perItem.length} ≥0.7` : "—",
    reviewedBy: grade?.reviewedBy ?? "—",
    submittedAt: r.submittedAt?.toISOString() ?? "—",
  };
});
console.table(formatted);
```

Add `scripts.db:grades` entry to root `package.json`.

**Acceptance criteria**:
- [ ] `pnpm db:grades` runs without error on empty DB.
- [ ] After a real submission, the table includes the assignment with its score.

---

### Unit 18: Documentation updates

**Files**:
- `docs/ROADMAP.md` (modified — Phase 8 description)
- `docs/CURRICULUM.md` (modified — three new modes section)
- `docs/CONTRACT.md` (modified — assignment lifecycle note)

**ROADMAP.md** — Phase 8 replacement:

```markdown
## Phase 8: Multi-mode + assessment

**Goal:** Tutor authors quizzes / homework / exams; student takes them as structured artifacts in the chat surface; server grades each item; agent narrates per-item feedback.

**Build:**
- Three new modes (`quiz`, `homework`, `exam`) — distinct prompt fragments + tool subsets; same chat surface; chat composer disabled in exam mode while assignment is unsubmitted
- `AssignmentServiceImpl` with per-item grader dispatch (`MathGrader` / `CodeGrader` / `MultipleChoiceGrader` / `ShortAnswerGrader` / `FreeResponseGrader`); registry-driven (single source of truth)
- **Per-criterion 0-10 rubric grading** via shared `runRubricAgent` helper. The agent scores each criterion with an integer 0-10 + rationale; the system computes the 0..1 aggregate deterministically as a weighted sum. Allowed in all modes including exam (verification stance preserved by explicit pre-authored rubric + per-criterion auditability + deterministic aggregation).
- **Optional `workRubric` per item** for partial credit on shown work (math/code only). Agent decides per-item at create time whether to add it; deterministic check + work rubric blend via `primaryWeight`. Defaults: 0.5 for quiz/homework, 1.0 for exam.
- **Approach feedback layer** as a fallback: enriches feedback for items WITHOUT a rubric or workRubric in quiz/homework; skipped for exam. Items with rubrics get richer feedback through per-criterion rationales directly.
- Resumable per-item progress (`assignment_responses` table with optional `work` column; auto-save with 1s debounce)
- Active-path tools: `assignment.create` (teach mode, with detailed authoring guidance for workRubric heuristics), `assignment.show`, `assignment.read_grade` (assessment modes)
- UI: `<AssignmentCard>` rendered inline in chat when session has `assignmentId`; structured per-item input with optional "show your work" field; tone-coded post-submission feedback with collapsible per-criterion breakdown
- `praxis.assignments.*` IPC + `AssignmentsClient`
- `pnpm db:grades` CLI

**Deferred to a later phase**: configurator-authored assignments (Phase 11 configure mode); sketch input for assignments (Phase 13); photo upload for handwritten work (Phase 13); gate auto-evaluation on exam pass (Phase 9); canonical pre-made assessment packs (Phase 10 / Phase 15); per-criterion deterministic kinds (Phase 14 — e.g., key-term-presence criteria graded without LLM).

**Test checkpoint:** Tutor in teach mode authors a 5-item quiz on the active concepts. Student starts a quiz session; the `<AssignmentCard>` renders inline with the items. Student answers (some correctly, some not), submits. Server grades; per-item feedback renders inline (color-coded, with approach feedback for incorrect items). Grade artifact is in DB; `pnpm db:grades` shows the result. Agent narrates feedback in chat after the student asks "how did I do?" or naturally on the next turn.
```

**CURRICULUM.md** — append to the modes section:

```markdown
### `quiz`
Short-form retrieval practice during or between lessons. Items rendered as a structured `<AssignmentCard>` inline in the chat. Agent voice: lively scaffolding; offers hints sparingly during work; narrates per-item feedback warmly after submission.

- Tools: `assignment.show`, `assignment.read_grade`, `course.what_can_i_teach`, `course.current_concept`, `retrieve_from_textbook`, `grade_math`, `code_sandbox`, `update_mastery`, `record_misconception`
- `workRubric`: rare. Reserve for the 1-2 multi-step items per quiz where partial credit adds value.
- Approach feedback layer: ON for items without a rubric/workRubric (fallback enrichment)
- Submission: chat composer remains active throughout

### `homework`
Longer practice across multiple concepts, submitted in one batch. Agent voice: helpful clarifier; answers item-meaning questions but does not give answers; full feedback delayed until submission.

- Tools: same as `quiz`
- `workRubric`: common. Items rewarding process get partial credit on shown work.
- Approach feedback layer: ON for items without a rubric/workRubric (fallback)
- Submission: chat composer remains active throughout

### `exam`
Gated assessment. Strict tool subset, no help during the exam.

- Tools: `assignment.show`, `assignment.read_grade` (and nothing else)
- Approach feedback layer: OFF (verification stance — no post-hoc feedback enrichment)
- **Free-response items require an explicit `rubric`** (validated at item-create). Rubric agent scores per-criterion (integer 0-10) with written rationales; total computed deterministically as weighted sum. Verification stance preserved through pre-committed criteria + per-criterion auditability + deterministic aggregation.
- `workRubric`: judgment-call per item. `primaryWeight` defaults to 1.0 (deterministic-only) unless explicitly authored otherwise.
- Submission: chat composer DISABLED until the student submits; re-enabled for post-submission feedback narration
```

**CONTRACT.md** — append to "Artifact schemas → Assignment / Exam" section:

```markdown
> **v1 status (Phase 8)**: Assignments are structured artifacts taken inline in the chat surface. Submission flows through `praxis.assignments.submit`, not through agent tools — the server runs the grader dispatch and persists the Grade.
>
> **Free-response grading uses a rubric agent** with per-criterion 0-10 integer scoring. The agent's job is per-criterion judgment ("on criterion X, score 0-10 with rationale"); the system computes the 0..1 aggregate as a deterministic weighted sum of `(score / 10) × weight`. This satisfies SPEC.md's "graded against an explicitly-written rubric the tutor produces before grading" by pre-committing to criteria, narrowing per-criterion judgment scope, and keeping aggregation deterministic. Allowed in all modes including exam; exam free-response items are required to have a rubric (validated at create time).
>
> **`workRubric` opt-in per item** lets math/code items award partial credit for shown work. The deterministic check (sympy / test cases) and the work rubric blend via `primaryWeight` (default 0.5 for quiz/homework, 1.0 for exam). The agent decides at item-create time whether to add a workRubric — guidance lives in the `assignment.create` tool description.
>
> **Approach-feedback layer** is a fallback for items WITHOUT a rubric/workRubric in quiz/homework only — it enriches `feedback` text without modifying `score`. Items with rubrics get per-criterion rationales as their feedback. Approach-feedback never runs for exam.
>
> The deterministic grader's score is the ground truth for items without a rubric; rubric scores are deterministic-aggregated from per-criterion judgment. Items are typed-only in v1; sketch / photo input lands in Phase 13.
```

**Acceptance criteria**:
- [ ] `docs/ROADMAP.md` Phase 8 description reflects the structured-artifact + per-mode-prompt design.
- [ ] `docs/CURRICULUM.md` documents the three new modes with their tool subsets.
- [ ] `docs/CONTRACT.md` notes the assignment lifecycle.

---

### Unit 19: Tests

| Test file | Type | What it tests |
|---|---|---|
| `packages/core/src/services/graders/__tests__/multiple-choice-grader.test.ts` | unit, fast | Correct/incorrect index; null answer; missing answer key. |
| `packages/core/src/services/graders/__tests__/short-answer-grader.test.ts` | unit, fast | Each match strategy (exact / substring / normalized); missing answers. |
| `packages/core/src/services/graders/__tests__/math-grader.test.ts` | unit, fast (mocked SymPy) | Correct, incorrect, parse error → needs-human-review. |
| `packages/core/src/services/graders/__tests__/code-grader.test.ts` | unit, fast (mocked sandbox) | Partial credit; timeout; stderr; missing test cases. |
| `packages/core/src/services/graders/__tests__/rubric-agent.test.ts` | unit, fast (FakeEngine) | Per-criterion 0-10 integer scoring; deterministic weighted-sum total; unknown criterionId dropped; engine error → needs-human-review; schema-invalid output → needs-human-review; missing criteria filled in as 0. |
| `packages/core/src/services/graders/__tests__/free-response-grader.test.ts` | unit, fast (FakeEngine) | Rubric path; acceptedAnswers fallback in quiz/homework; needs-human-review when both absent; quiz/homework/exam all use rubric agent when rubric present. |
| `packages/core/src/services/graders/__tests__/approach-feedback.test.ts` | unit, fast (FakeEngine) | Skipped on exam; skipped on score=1; skipped on empty response; skipped when item has rubric/workRubric; skipped when tier is rubric-agent; preserves score and tier on enrichment success; returns base on engine error. |
| `packages/core/src/services/__tests__/assignment-service.test.ts` | unit, fast (real DB) | `create` validates items; rubric weights must sum to 1.0; exam free-response without rubric rejected; `submit` produces full Grade; `submit` throws on second call; `recordResponse` upserts response + work; `getResponses` returns persisted state. |
| `packages/core/src/services/__tests__/assignment-service-blending.test.ts` | unit, fast (FakeEngine + mocked sympy) | workRubric blending: blended score = primaryWeight × deterministic + (1 - primaryWeight) × work; default primaryWeight is 0.5 in quiz/homework and 1.0 in exam; missing work field falls back to deterministic-only; perCriterion populated with source="work-rubric". |
| `packages/curriculum/src/brief/__tests__/assignment-context.test.ts` | unit, fast | Fragment renders correctly for in-progress and submitted states. |
| `packages/curriculum/src/__tests__/quiz-mode.test.ts` | unit, fast | Mode + tool subset + role fragment. |
| `packages/curriculum/src/__tests__/homework-mode.test.ts` | unit, fast | Mode + tool subset + role fragment. |
| `packages/curriculum/src/__tests__/exam-mode.test.ts` | unit, fast | Mode toolNames are minimal; exam role fragment is `customizable: false`. |
| `packages/tools/src/assignment/__tests__/create.test.ts` | unit, fast | `assignment.create` validates per-kind; rejects malformed items. |
| `packages/tools/src/assignment/__tests__/show.test.ts` | unit, fast | Default to `ctx.assignmentId`; not_found / no_assignment_in_session paths. |
| `packages/tools/src/assignment/__tests__/read-grade.test.ts` | unit, fast | not_yet_submitted / graded paths. |
| `packages/desktop/src/__tests__/ipc-server-assignments.test.ts` | unit | All 5 IPC channels route correctly. |
| `packages/client/src/__tests__/assignments-client.test.ts` | unit | Client invokes correct channels. |
| `packages/ui/src/__tests__/assignment-card.test.tsx` | unit (jsdom) | Renders for in-progress; renders for submitted; submit calls service; auto-save debounces. |
| `packages/ui/src/__tests__/assignment-item-card.test.tsx` | unit (jsdom) | Each kind renders its appropriate input control. |
| `tests/quiz-end-to-end.test.ts` | integration, fast (FakeEngine + mocked sympy/sandbox) | Full flow: `assignment.create` (with one workRubric item) → start quiz session → fill responses + work → submit → verify Grade in DB with per-criterion breakdown → next turn's brief includes `Status: SUBMITTED`. |
| `tests/exam-end-to-end.test.ts` | integration, fast | Exam mode: free-response with rubric grades via rubric agent; free-response without rubric is rejected at create; approach-feedback is never invoked; per-criterion breakdown is present on rubric-graded items. |

Slow tests (real engine for rubric / approach-feedback) gated behind `PRAXIS_RUN_SLOW_TESTS=1`.

---

## Implementation Order

1. **Unit 1** — Type contract additions (extends AssignmentItem, Grade; adds AssignmentResponse, AssignmentSubmissionResult; defines server-side AssignmentService).
2. **Unit 2** — Schema additions (`assignment_responses` table; `sessions.assignment_id` column). Run `pnpm db:generate`.
3. **Unit 3** — `ItemGrader` port + `buildGraderRegistry`.
4. **Unit 4** — Deterministic graders (parallelizable).
5. **Unit 5** — Free-response grader (rubric agent).
6. **Unit 6** — Approach feedback agent.
7. **Unit 7** — `AssignmentServiceImpl` (depends on Units 3–6).
8. **Unit 8** — New modes + fragments.
9. **Unit 9** — Assignment-context fragment + brief composer integration.
10. **Unit 10** — `SessionService.start` extension.
11. **Unit 11** — Active-path tools (`assignment.create` / `show` / `read_grade`).
12. **Unit 12** — `ServiceDeps` + `buildServices` wiring.
13. **Unit 13** — IPC + `AssignmentsClient`.
14. **Unit 14** — UI components.
15. **Unit 15** — Chat route integration.
16. **Unit 16** — Tool-result dispatch (no-op).
17. **Unit 17** — `pnpm db:grades` script.
18. **Unit 18** — Doc updates.
19. **Unit 19** — Tests interspersed.

Units 4 (deterministic graders) and 5 / 6 (LLM graders) can be parallelized once Unit 3's port lands.

---

## Verification

```bash
pnpm install                               # if native modules need refreshing
pnpm rebuild better-sqlite3                # if NODE_MODULE_VERSION mismatch
pnpm db:generate                           # produce migration files
pnpm typecheck                             # MUST pass
pnpm lint                                  # MUST pass
pnpm test                                  # MUST pass — fast suite
PRAXIS_RUN_SLOW_TESTS=1 pnpm test          # slow lane (real engine rubric / approach-feedback)
pnpm db:grades                             # MUST run on empty DB

# Manual checkpoint (Phase 8)
pnpm desktop:build && pnpm dev
# 1. Start a teach session against an existing course (Phase 6 flow).
# 2. Tell the tutor: "Make me a homework on the current concepts with 5 items, including some that reward showing work."
# 3. Tutor calls `assignment.create` with 5 items; at least one math item includes a `workRubric` (verified in DB or by the UI badge).
# 4. Tutor narrates: "I made you a 5-item homework. Click 'Start' to begin."
# 5. UI presents an option to start (a button or a /courses/:id/assignments link).
# 6. Click → new session opens with `modeId: "homework", assignmentId`.
# 7. AssignmentCard renders inline. The workRubric item shows BOTH a "Show your work" textarea AND a "Final answer" input, plus a "partial credit available" badge.
# 8. Fill out items: get the workRubric item's final answer wrong but show valid work; answer 3 others correctly; leave 1 blank.
# 9. Click Submit. UI shows "Grading…" briefly.
# 10. Per-item feedback renders inline with tone-coded styling. The workRubric item shows partial credit (e.g. ~50%) with a collapsible "Per-criterion breakdown" listing each criterion at integer score X/10 + rationale.
# 11. Ask the agent in chat: "explain item 3" → agent calls `assignment.read_grade` and narrates.
# 12. End the session. Phase 7 indexers run; mastery updates from the grade.
# 13. `pnpm db:grades` shows the assignment with total score.
# 14. Try an exam with a free-response item: "Make me a 3-item exam on linear equations including a short essay item explaining slope." → exam mode session → composer disabled.
# 15. Verify the agent included an explicit rubric on the essay item (otherwise create rejects).
# 16. Fill out exam (essay gets a real prose response). Submit → feedback renders with per-criterion breakdown for the essay item → composer re-enables.
```
