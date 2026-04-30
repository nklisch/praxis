# Design: Phase 9 — Gates + Progress Map

## Overview

Phase 9 makes the gate system real. Phase 6 created `gates` rows (one per lesson, chained, all initially `locked`). Phase 7 produced graduated mastery. Phase 8 produced graded assignments. Phase 9 is the **integration milestone (M2)**: gates evaluate at session-end against mastery + grades; locked content stops the agent from acting on it; passing an assessment unlocks the next gate; the student sees their path in a progress-map UI; the agent narrates unlocks at session close.

After Phase 9: a course with three chained gates → student works through Lesson 1, mastery rises to ≥0.7, end-of-session evaluator unlocks Gate 1 → next session opens with Lesson 2 in scope and the agent narrating "you unlocked Word Problems"; student takes the unit exam (Phase 8 flow), passes 0.7+, evaluator unlocks the topic-completion gate; progress map reflects all of it. `pnpm db:gates` shows transitions in the DB.

**Key design moves (from user discussion):**

1. **Course-local gates in v1.** Gates evaluate within one course. Cross-course mastery already flows through shared concept IDs (Phase 7 mastery is per-(studentId, conceptId) — courses with shared `conceptGraphId` see each other's mastery for free). Cross-course `SuccessCriteria` variants (e.g., `external-mastery`) are deferred to Phase 11 as a non-breaking discriminated-union extension.
2. **Bounded brief visibility window.** The agent sees: current lesson (full detail), next lesson (title + concept count + lock reason), active gate (the one the student is working toward), and a course-shape summary line (`"4 of 12 lessons complete; 8 ahead"`). Locked content beyond the next lesson is summarized, not enumerated. The agent has enough context to answer "what's next?" without sprawl.
3. **Read-broad, write-narrow tools.** Read tools (`course.what_can_i_teach`, `course.current_concept`, `retrieve_from_textbook`) return locked content with status tags. Write tools (`course.start_lesson`, `course.mark_studied`, `assignment.create`) refuse with descriptive errors when called against locked content. Belt-and-suspenders enforcement: prompt fragment + tool-level validation.
4. **Session-end evaluation, start-time refresh.** `SessionService.end()` runs the evaluator over all gates in the active session's course; transitions are atomic; new unlocks land in `SessionSummary.unlockedGates`. `SessionService.start()` reads current gate states from DB without re-evaluating — trusts the last end-of-session result. The agent's pre-session brief reflects the latest state. Mid-session unlocks are explicitly NOT a v1 feature (per ARCHITECTURE.md).
5. **React Flow for the progress map.** Use `@xyflow/react` (already in SPEC.md for Phase 11's gate editor). Auto-layout from the prerequisite graph; concept nodes colored by mastery; gate-state badges on edges. Reuses Phase 11's stack — single dependency, single visual idiom. The map is read-only in Phase 9; Phase 11's configure mode adds editing.
6. **Unlock narration + toast badge.** Agent narrates inline during the post-submission turn ("You unlocked Word Problems — want to start that next session?"). UI surfaces a small badge in `/courses` for unlocked gates since last view. No modal — keeps the conversational stance from Phase 6.

**What ships:**

- **Schema additions** (`@praxis/artifacts/schema.ts`):
  - `gate_unlock_events` — per-(studentId, gateId, unlockedAt) audit trail. Used by `SessionSummary.unlockedGates`, the courses-list "newly unlocked" badge, and the `pnpm db:gates` script.
  - No changes to the existing `gates` table — the `state_json` column already stores `GateState`.
- **Type additions** (`@praxis/core/types/`):
  - `GateEvaluator` port + `GateEvaluation` result + `GateTransition` discriminated union.
  - Extended `CourseStateSnapshot` with `gates: GateView[]` and `activeGate: GateView | null`.
  - New `GateView` (server-side enriched gate with display strings: `summary`, `lockReason`, `progress`).
  - `MasteryReader` port (narrow read interface for gate evaluation; implemented by `MemoryServiceImpl`).
  - `GradeReader` port (narrow read interface for gate evaluation; implemented by `AssignmentServiceImpl`).
- **`GateEvaluatorImpl`** in `@praxis/curriculum/src/gates/` — pure logic. Takes a list of gates + a `MasteryReader` + a `GradeReader` + a now timestamp. Returns gate-by-gate evaluation + a list of transitions. Lives in curriculum because gate-evaluation is curriculum logic (sits next to mode definitions, brief composer, etc.).
- **`ArtifactsServiceImpl` extensions**:
  - `evaluateAndPersistGates(input)` — runs the evaluator, persists state changes in one transaction, writes `gate_unlock_events` rows for transitions, returns the unlocked gate IDs.
  - `gateView(input)` — enriched read that returns `GateView[]` for UI rendering (gate state, progress %, lock reason, success criteria summary).
  - `markedNewlyUnlocked` query — used by the courses-list badge ("3 new unlocks since you last viewed").
- **Brief composer extension** — `composeCourseContextFragment` consumes the new `gates` and `activeGate` fields in `CourseStateSnapshot`. Renders next-lesson tag + active-gate working-toward line + course-shape summary. Locked-content tags include lock reason ("locked: requires mastery ≥ 0.7 on Linear Equations").
- **Tool lock enforcement**:
  - `course.start_lesson` — checks the lesson's gate state; refuses with `"cannot start lesson \"X\": gate locked, requires \"reason\""` if locked.
  - `course.mark_studied` — checks the concept's lesson's gate state; same refusal pattern.
  - `assignment.create` — checks each conceptId's lesson's gate state; refuses if any are locked.
  - All refusals include the gate's `lockReason` in the error message so the agent can narrate to the student.
- **`SessionService.end` integration** — after Phase 7 `runAtSessionEnd` and the existing `update sessions set endedAt`, the service calls `artifacts.evaluateAndPersistGates({studentId, courseId})`. Newly-unlocked gate IDs land in `SessionSummary.unlockedGates`. Wrapped in a try/catch so a gate-evaluation error doesn't fail session end (logged at warn).
- **`SessionService.start` refresh** — when starting a session against a course, the brief composer reads `gates` via `ArtifactsService.gateView(...)` and uses them to compute the visibility window. No re-evaluation; just reads current state.
- **`praxis.artifacts.gateView` IPC** — read-only view for UI rendering. Returns `GateView[]` with display strings precomputed.
- **`praxis.artifacts.evaluateGates(courseId)` IPC** — manual trigger for debugging / configurator override (Phase 11 will use this). Calls `evaluateAndPersistGates`. Phase 9 exposes for `pnpm db:gates --evaluate` CLI flag.
- **UI: Progress Map at `/courses/:courseId/map`** — new route. React Flow canvas. Concept nodes colored by mastery (mastered = green; in-progress = yellow; locked = gray). Lessons as cluster groupings. Gate state shown as edge labels. Click a concept → side panel with concept description + mastery score + reference list.
- **UI: courses-list newly-unlocked badge** — `<CourseListItem>` shows a small badge ("2 new unlocks") when there are unlocked gates the user hasn't yet viewed.
- **Unlock narration in agent turn** — when `SessionSummary.unlockedGates.length > 0`, the post-submission brief context includes "Newly unlocked: {gate names}". The agent's role fragment (Phase 6 + 7) gets a small addition: "If newly unlocked content is mentioned in your context, celebrate it briefly with the student before disconnect."
- **`AssignmentServiceImpl.submit` ordering** — Phase 8 submits already write `gradeJson + submittedAt`. Phase 9 doesn't change this. The end-of-session evaluator reads exam grades after submission.
- **`pnpm db:gates` CLI** — formatted listing of gates per course with state + last transition + summary criteria.
- **Doc updates**: `docs/ROADMAP.md` Phase 9 section verbatim per Unit 14; `docs/CURRICULUM.md` gating-philosophy section updated to reflect course-local-in-v1; `docs/CONTRACT.md` adds gate-lifecycle note.

**What does not ship (deferred):**

- **Cross-course `SuccessCriteria` variant** — Phase 11 (`external-mastery` adds a discriminated-union variant; evaluator branch is one switch case).
- **Soft gates / topic-exploration mode** — design doc CURRICULUM.md mentions this as a configurable per-course default. Phase 9 ships strict gating only (matching Phase 6 bootstrap's default thresholds).
- **Gate editor (React Flow with custom node components for editing)** — Phase 11 configure mode.
- **Gate override (`GateState.kind: "overridden"`)** — Phase 11 (configure mode is the writer; type already exists).
- **Adaptive routing / spaced-review insertion** — Phase 10 (canonical packs make the routing inputs richer).
- **Visual unlock animation / celebration screen** — explicitly deferred per UX choice. Phase 9 does inline narration + small badge.
- **Multi-course progress dashboard** — Phase 9's progress map is scoped to one course.
- **Gate-completion certificates / printable transcripts** — out of v1.
- **Gate-evaluation event streaming** (live UI updates as gates evaluate) — synchronous evaluation in `SessionService.end()` is fast enough; no streaming needed.

## Why these choices (decision rationale)

**Why gates are course-local in v1.** The data model says so: `PrerequisiteEdge` lives within a `ConceptGraph`, and Phase 6 creates one graph per bootstrapped course. Cross-course gates would require a `SuccessCriteria` variant that names another course's concepts — which works fine in code but has no consumer until Phase 10's canonical packs make ID-sharing real. The Phase 7 mastery layer already crosses courses through shared concept IDs (it's keyed on `conceptId`, not `(courseId, conceptId)`), so the **mastery-flow** part of cross-course works today. The **gate-criteria** part is what's deferred. Adding it is one new case in the evaluator's exhaustive switch — non-breaking.

**Why session-end evaluation, not continuous.** ARCHITECTURE.md commits: "Gates re-evaluate at session boundaries, not mid-session. Mid-session unlocks are confusing. Unlocks surface as accomplishments at session end." Phase 9 honors this. Practically: continuous re-evaluation would mean the brief drifts mid-session as the student gets answers right, which complicates the agent's ability to give consistent guidance. Session-end is the natural beat — the student just earned a result; the system rewards them when they pause. Start-time refresh is a separate pure-read concern: gate states might have changed between sessions for *other* reasons (configurator manual unlock, future Phase 11), so the brief reads fresh.

**Why bounded brief visibility (current + next + active gate).** The agent's job is to teach what's now and orient toward what's next. A course with 50 concepts dumped into context at every turn would (a) burn tokens, (b) tempt the agent to teach ahead of the student, (c) create noise around the active concept. The current-lesson + next-lesson + active-gate window keeps the brief proportional to action: enough to answer "what's coming up?" without enough to teach it prematurely. The "12 more lessons follow" summary line lets the agent acknowledge scope without listing.

**Why locked content is visible (with status tags) but not actionable.** The student will ask "what about word problems?" and "when do we get to derivatives?". The agent that doesn't know future content can only say "I don't know" — frustrating, and worse, dishonest, since the system DOES know. The agent that sees future content tagged `locked (requires X)` can say "we'll get there once you've reached 0.7 on linear equations". That's the right answer. The action-side (start_lesson, mark_studied, assignment.create) is locked at the tool layer so even an agent that misjudges and tries to teach ahead gets a hard refusal it has to narrate to the student. Two layers of enforcement: prompt-level orientation, tool-level safety.

**Why gates live in `@praxis/curriculum`, not `@praxis/core/services`.** Gate evaluation is curriculum logic, not infrastructure. It sits naturally beside mode definitions, brief composers, and adaptive routing (Phase 10). `@praxis/core/services` is the orchestration layer (sessions, indexers, IPC); `@praxis/curriculum` is the curriculum layer (modes, gating, BKT-config, future routing). Putting `GateEvaluatorImpl` in core would mean importing curriculum types into core's service layer; putting it in curriculum keeps the dependency direction clean.

**Why React Flow.** SPEC.md already commits to React Flow for Phase 11's gate editor. Reusing the same library for Phase 9's read-only progress map means: (a) one node-component vocabulary across phases, (b) accessibility / keyboard-nav for free, (c) layout helpers (dagre integration) handle the auto-layout we'd otherwise hand-roll, (d) Phase 11's editor is a one-package extension instead of a parallel UI stack. The trade-off — less custom visual identity than a hand-rolled SVG — is acceptable for v1; the visual identity layer can come later.

**Why narration + toast badge instead of a modal.** The conversational stance from Phase 6 says everything is dialogue. A celebration modal interrupts; a toast plus the agent saying "you unlocked Word Problems — want to start that next session?" is in voice. The badge in the courses list catches the case where the student exits before the agent narrates. Same signal, two surfaces, no interruption.

**Why `gate_unlock_events` instead of querying `gates.stateJson` for transitions.** The `gates.stateJson` column holds the *current* state. To detect newly-unlocked-since-last-view we need an event log (timestamp per transition). The events table is small (~10 rows per course over a year), append-only, and gives `pnpm db:gates` a clean transition history. Querying state alone would force us to track "last viewed state" client-side, which couples the UI to the DB schema.

## Scope and assumptions

- **Single-student per install** (v1 invariant).
- **Gates evaluate against the student's current mastery + grades.** Mastery is read via `MemoryService.studentModel(studentId)` (Phase 7); grades are read via `AssignmentService.list(...)` filtered to the gate's referenced assignmentIds.
- **State transitions are atomic per evaluation.** All gate state changes for a single course evaluation happen in one Drizzle transaction. Failure in any single gate's persistence rolls back all changes for that evaluation; logged at warn; the next session's evaluator tries again.
- **Idempotency.** Evaluating the same `(courseId, mastery state, grade state)` twice produces the same result. The evaluator is a pure function; persistence layer is an upsert.
- **Decay-aware mastery.** Gate evaluation reads `effectivePKnown` (decay-applied), not raw `pKnown`. A student who hasn't practiced linear equations in 60 days may drop below 0.7 and have downstream gates re-lock — but Phase 9 doesn't re-lock unlocked gates (see "Unlock-only transitions" below).
- **Unlock-only transitions in v1.** A gate that has been unlocked stays unlocked, even if mastery later decays below threshold. Re-locking creates a frustrating UX ("the system took away my progress") that needs careful UX work; deferred. The `GateEvaluator` records the transition direction; downstream consumers can interpret. The decay-driven re-lock case lands in Phase 14 alongside spaced-review nudges.
- **Soft-gate enforcement is OFF in v1.** The bootstrap default produces strict gates. CURRICULUM.md mentions soft gates as a future configurable; Phase 9 ships strict only.
- **Configurator overrides (`GateState.kind: "overridden"`)** are out of scope. The type exists; Phase 11 implements the configure-mode tool. Phase 9's evaluator handles `overridden` as "treat as unlocked, never re-evaluate" — the data model just works.
- **`assignment.create` lock check inspects all referenced conceptIds.** If even one concept's lesson is locked, the create fails. Mixed-lock assignments aren't a Phase 9 concern.
- **Cross-course gates are not supported.** A gate in Course A cannot reference concepts/assignments in Course B. The evaluator throws a `gate.cross_course_unsupported` error if it encounters such a `SuccessCriteria` (defensive — won't happen in v1 since no authoring path produces them).
- **Brief visibility cap.** The brief shows ≤ 1 lesson ahead in detail (next lesson title only); summarizes the rest as a count. Bounded regardless of course size.
- **Slow tests gated** behind `PRAXIS_RUN_SLOW_TESTS=1` (Phase 9 has no real-engine tests; integration tests use FakeEngine).

## Dependency direction (Phase 9 additions)

```
@praxis/artifacts/schema.ts
  └─ NEW: gate_unlock_events table

@praxis/core/types
  ├─ MODIFIED: tool.ts — CourseStateSnapshot.gates + .activeGate; new MasteryReader, GradeReader ports;
  │                       extended ArtifactsService with gateView, evaluateAndPersistGates
  └─ NEW: gate.ts — GateView, GateEvaluator, GateEvaluation, GateTransition

@praxis/curriculum/src/
  ├─ NEW: gates/types.ts — re-export curriculum-local types if needed
  ├─ NEW: gates/evaluator.ts — GateEvaluatorImpl (pure)
  ├─ NEW: gates/criteria.ts — evaluateSuccessCriteria(criteria, mastery, grades) — pure recursive helper
  ├─ NEW: gates/index.ts — barrel
  └─ MODIFIED: brief/course-context.ts — bounded visibility window with gate awareness

@praxis/core/src/services
  ├─ MODIFIED: artifacts-service.ts — gateView + evaluateAndPersistGates + markGatesViewed
  └─ MODIFIED: session-service.ts — call evaluator at end; populate SessionSummary.unlockedGates

@praxis/tools/src/course
  ├─ MODIFIED: start-lesson.ts — lock check
  └─ MODIFIED: mark-studied.ts — lock check

@praxis/tools/src/assignment
  └─ MODIFIED: create.ts — concept-lock check

@praxis/desktop/electron/main/
  └─ MODIFIED: ipc-server.ts — praxis.artifacts.gateView + .evaluateGates + .markGatesViewed

@praxis/client/src/services/
  └─ MODIFIED: artifacts-client.ts — gateView, evaluateGates, markGatesViewed methods

@praxis/ui/src/
  ├─ NEW: routes/course-map.tsx + .module.css — /courses/$courseId/map (React Flow)
  ├─ NEW: components/concept-node.tsx — React Flow custom node component
  ├─ NEW: components/gate-edge-label.tsx — edge-label component
  ├─ NEW: components/concept-side-panel.tsx — click-to-detail
  ├─ NEW: hooks/use-course-gates.ts
  ├─ MODIFIED: components/course-list-item.tsx — newly-unlocked badge
  ├─ MODIFIED: components/nav.tsx — link to map (optional)
  ├─ MODIFIED: routes/course-detail.tsx — "View progress map" button
  └─ MODIFIED: router.tsx — register new route

scripts/
  └─ NEW: db-gates.ts

docs/
  ├─ MODIFIED: ROADMAP.md (Phase 9 description tightened)
  ├─ MODIFIED: CURRICULUM.md (gating philosophy in v1)
  └─ MODIFIED: CONTRACT.md (gate lifecycle status)
```

No Python in Phase 9.

---

## Implementation Units

### Unit 1: Type contract additions

**Files**:
- `packages/core/src/types/gate.ts` (new)
- `packages/core/src/types/tool.ts` (modified — `CourseStateSnapshot.gates`, `CourseStateSnapshot.activeGate`; new ports `MasteryReader`, `GradeReader`; extended `ArtifactsService` methods)
- `packages/core/src/types/index.ts` (re-export)

```typescript
// packages/core/src/types/gate.ts (new)

import type { Timestamp } from "./common.js";
import type { Logger } from "./common.js";
import type { ConceptId, GateId, StudentId } from "./ids.js";
import type { Gate, GateState, SuccessCriteria } from "./artifacts.js";

/**
 * Enriched gate view used by UI and brief composer. Server-side
 * helpers compute display strings so the UI / brief don't have to
 * walk the SuccessCriteria tree.
 */
export interface GateView {
  gate: Gate;
  /** Short human-readable summary of the gate's success criteria. */
  summaryText: string;
  /** Reason the gate is locked (or empty when unlocked). */
  lockReason: string;
  /** Progress fraction toward unlock (0..1). 1.0 if already unlocked. */
  progress: number;
  /** Whether this gate is the active "next to unlock" gate for the student. */
  isActive: boolean;
}

/**
 * Pure-function port. Takes the inputs needed to evaluate gate states
 * and returns the evaluation result. No DB writes; persistence is the
 * caller's job.
 */
export interface GateEvaluator {
  evaluate(input: GateEvaluatorInput): GateEvaluation;
}

export interface GateEvaluatorInput {
  studentId: StudentId;
  gates: ReadonlyArray<Gate>;
  /** Read mastery by concept id, decay applied. Returns 0 when no record. */
  masteryReader: MasteryReader;
  /** Read assignment grades for a list of assignment ids. */
  gradeReader: GradeReader;
  now: Timestamp;
  log?: Logger;
}

export interface GateEvaluation {
  /** Per-gate result. Same length / order as input.gates. */
  perGate: GateEvaluationEntry[];
  /** Subset of perGate where state changed in this evaluation. */
  transitions: GateTransition[];
}

export interface GateEvaluationEntry {
  gateId: GateId;
  beforeState: GateState;
  afterState: GateState;
  progress: number;
  lockReason: string;
  summaryText: string;
}

export type GateTransition =
  | { kind: "unlocked"; gateId: GateId; at: Timestamp; evidence: ReadonlyArray<{ kind: "event" | "assignment" | "manual"; id: string }> }
  | { kind: "re-locked"; gateId: GateId; at: Timestamp; reason: string }; // not produced in v1; type exists for future

/**
 * Narrow port for reading current mastery during gate evaluation.
 * Implemented by MemoryServiceImpl (already exists from Phase 7).
 * The port keeps GateEvaluator pure and easy to test in isolation.
 */
export interface MasteryReader {
  /** Effective decay-aware mastery for a concept. Returns 0 when no record. */
  read(input: { studentId: StudentId; conceptId: ConceptId }): Promise<number>;
}

/**
 * Narrow port for reading assignment grades during gate evaluation.
 * Implemented by AssignmentServiceImpl.
 */
export interface GradeReader {
  /** Get the grade total for an assignment, or null when unsubmitted / not found. */
  readGrade(input: { assignmentId: string }): Promise<{ total: number; submittedAt: Timestamp } | null>;
}
```

```typescript
// packages/core/src/types/tool.ts — modifications

// Existing CourseStateSnapshot extended:
export interface CourseStateSnapshot {
  course: Course;
  lessons: Lesson[];
  currentLesson: Lesson | null;
  conceptsByLesson: Map<LessonId, ConceptStateRow[]>;
  conceptsById: Map<ConceptId, ConceptStateRow>;
  /** ← Phase 9 NEW. Enriched gates for the UI / brief composer. */
  gates: GateView[];
  /** ← Phase 9 NEW. The single "next gate to unlock" — the closest locked gate
   *  the student is currently working toward, or null when nothing locked. */
  activeGate: GateView | null;
  /** ← Phase 9 NEW. Lessons summarized for the bounded visibility window. */
  visibilityWindow: VisibilityWindow;
}

export interface VisibilityWindow {
  /** Index of the current lesson (or 0). */
  currentLessonIndex: number;
  /** Number of lessons after the next-lesson detail (i.e. total - currentLessonIndex - 2). */
  remainingCount: number;
}

// ArtifactsService extensions:
export interface ArtifactsService {
  // ... existing methods ...

  /** ← Phase 9 NEW. Computed view for UI rendering. */
  gateView(input: { studentId: StudentId; courseId: CourseId }): Promise<GateView[]>;

  /**
   * ← Phase 9 NEW. Run gate evaluation for the course, persist transitions, write
   * gate_unlock_events for newly-unlocked gates. Returns the unlocked gate ids.
   * Atomic: all persistence in one transaction.
   */
  evaluateAndPersistGates(input: {
    studentId: StudentId;
    courseId: CourseId;
  }): Promise<{ unlockedGateIds: GateId[] }>;

  /**
   * ← Phase 9 NEW. Mark all unlock events for a course as "viewed by student".
   * Used to clear the courses-list "newly unlocked" badge.
   */
  markGatesViewed(input: { studentId: StudentId; courseId: CourseId }): Promise<void>;

  /**
   * ← Phase 9 NEW. Count of unlock events for a course since the last
   * markGatesViewed (or all unlock events if never viewed). Used by
   * CoursesList badge.
   */
  newlyUnlockedCount(input: { studentId: StudentId; courseId: CourseId }): Promise<number>;
}
```

**Implementation notes**:
- `GateEvaluator` is a port; `GateEvaluatorImpl` is the implementation. Tests inject either real readers or stubs.
- `MasteryReader` and `GradeReader` are thin wrappers; `MemoryServiceImpl` and `AssignmentServiceImpl` already have the underlying methods, so the wrappers are 5-line classes (Unit 2).
- `GateTransition.kind === "re-locked"` is reserved for Phase 14. Phase 9 evaluator never produces it.
- `VisibilityWindow` simplifies the brief composer's calculation (Unit 5); pre-computing `remainingCount` here keeps the composer pure.

**Acceptance criteria**:
- [ ] All types re-exported from `packages/core/src/types/index.ts`.
- [ ] `CourseStateSnapshot.gates` and `.activeGate` and `.visibilityWindow` are non-optional (always populated by `ArtifactsServiceImpl.read`).
- [ ] `GateEvaluator.evaluate` is synchronous in shape (returns `GateEvaluation` directly, not Promise) — the underlying readers are async, so the input includes async readers but evaluate is invoked from inside an async context. **Correction**: `evaluate` returns `Promise<GateEvaluation>` because it awaits readers. Keep the interface consistent.
- [ ] `MasteryReader.read` returns `0` (not `null` / undefined) for unknown concepts — fail-safe.

---

### Unit 2: Schema additions

**File**: `packages/artifacts/src/schema.ts` (modified)

```typescript
export const gateUnlockEvents = sqliteTable(
  "gate_unlock_events",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    gateId: text("gate_id")
      .notNull()
      .references(() => gates.id, { onDelete: "cascade" }),
    unlockedAt: integer("unlocked_at", { mode: "timestamp_ms" }).notNull(),
    /** Optional evidence pointers (event ids, assignment ids). */
    evidenceJson: text("evidence_json", { mode: "json" }),
    /** ISO-8601 timestamp the student viewed this in /courses; null if never. */
    viewedAt: integer("viewed_at", { mode: "timestamp_ms" }),
  },
  (t) => ({
    studentCourseIdx: index("gate_unlock_events_student_course_idx").on(t.studentId, t.courseId),
    gateIdx: index("gate_unlock_events_gate_idx").on(t.gateId),
  }),
);

export const artifactsSchema = {
  // ... existing tables ...
  gateUnlockEvents, // ← Phase 9
};
```

**Implementation notes**:
- One row per unlock transition. Permanent audit trail.
- `viewedAt` is updated by `markGatesViewed` — bulk update where `studentId, courseId` match.
- ID is `uuidv7` (matches Phase 7 / 8 convention).
- Migration generated via `pnpm db:generate`.

**Acceptance criteria**:
- [ ] `pnpm db:generate` produces a migration creating the new table.
- [ ] `pnpm db:migrate` applies cleanly on a fresh DB and idempotently on an existing DB.
- [ ] FK cascade works: deleting a course removes its unlock-event rows.

---

### Unit 3: `MasteryReader` and `GradeReader` adapters

**Files**:
- `packages/core/src/services/memory/memory-service.ts` (modified — add `MasteryReader` impl method)
- `packages/core/src/services/assignment-service.ts` (modified — add `GradeReader` impl method)

```typescript
// memory-service.ts — addition

import type { MasteryReader } from "../../types/gate.js";

export class MemoryServiceImpl implements MemoryService, MasteryReader {
  // ... existing methods ...

  /**
   * MasteryReader.read implementation. Returns the decay-aware
   * effectivePKnown, or 0 when no row exists.
   */
  async read(input: { studentId: StudentId; conceptId: ConceptId }): Promise<number> {
    const row = this.deps.db
      .select()
      .from(studentMastery)
      .where(
        and(
          eq(studentMastery.studentId, input.studentId),
          eq(studentMastery.conceptId, input.conceptId),
        ),
      )
      .get();
    if (!row) return 0;
    return applyDecay({
      pKnown: row.pKnown / 1000,
      lastPracticedAt: row.lastPracticedAt?.getTime(),
      now: Date.now(),
      decayDays: this.deps.decayDaysFor(input.conceptId),
    });
  }
}
```

```typescript
// assignment-service.ts — addition

import type { GradeReader } from "../types/gate.js";

export class AssignmentServiceImpl implements AssignmentService, GradeReader {
  // ... existing methods ...

  /**
   * GradeReader.readGrade implementation. Returns total + submittedAt
   * if submitted; null otherwise.
   */
  async readGrade(input: { assignmentId: string }): Promise<{ total: number; submittedAt: Timestamp } | null> {
    const row = this.deps.db
      .select()
      .from(assignments)
      .where(eq(assignments.id, input.assignmentId))
      .get();
    if (!row || !row.submittedAt) return null;
    const grade = row.gradeJson as { total: number } | null;
    if (!grade) return null;
    return {
      total: grade.total,
      submittedAt: row.submittedAt.getTime() as Timestamp,
    };
  }
}
```

**Implementation notes**:
- Both adapters reuse existing service infrastructure (DB, decayDaysFor closure). No new state.
- `MasteryReader.read` returning 0 (not throwing) is the fail-safe for unknown concepts — gate evaluation proceeds and reports the gate as locked rather than crashing.
- `MemoryServiceImpl implements MemoryService, MasteryReader` — same instance, two interfaces (cleanly via TypeScript's structural typing). Same pattern as `ArtifactsServiceImpl implements ArtifactsService, CourseStateReader` from Phase 6.

**Acceptance criteria**:
- [ ] `MemoryServiceImpl.read` returns 0 for unknown concept; non-zero for known concepts (decay applied).
- [ ] `AssignmentServiceImpl.readGrade` returns null for unsubmitted; returns `{total, submittedAt}` for submitted.
- [ ] Both adapters typecheck against the `MasteryReader` / `GradeReader` interfaces.

---

### Unit 4: `GateEvaluatorImpl` + criteria evaluator

**Files**:
- `packages/curriculum/src/gates/criteria.ts` (new)
- `packages/curriculum/src/gates/evaluator.ts` (new)
- `packages/curriculum/src/gates/index.ts` (new)

```typescript
// criteria.ts — pure recursive evaluator over SuccessCriteria

import type { GradeReader, MasteryReader } from "@praxis/core/types";
import type { SuccessCriteria } from "@praxis/core/types";

export interface CriteriaEvaluation {
  satisfied: boolean;
  /** 0..1; for AND/OR, weighted (avg / max) progress. */
  progress: number;
  /** Human-readable summary of the criteria. */
  summary: string;
  /** Reason it's not satisfied (or empty when satisfied). */
  unsatisfiedReason: string;
}

/**
 * Pure evaluator. Walks the SuccessCriteria tree, awaiting reader calls.
 * Cross-course criteria are NOT supported in v1 — would throw if encountered.
 */
export async function evaluateSuccessCriteria(
  criteria: SuccessCriteria,
  studentId: string,
  masteryReader: MasteryReader,
  gradeReader: GradeReader,
): Promise<CriteriaEvaluation> {
  switch (criteria.kind) {
    case "mastery-threshold":
      return evaluateMasteryThreshold(criteria, studentId, masteryReader);
    case "exam-pass":
      return evaluateExamPass(criteria, gradeReader);
    case "and":
      return evaluateAnd(criteria, studentId, masteryReader, gradeReader);
    case "or":
      return evaluateOr(criteria, studentId, masteryReader, gradeReader);
    default: {
      // Exhaustiveness check for future variants
      const _exhaust: never = criteria;
      void _exhaust;
      throw new Error(`gate.unknown_criteria_kind: ${(criteria as { kind: string }).kind}`);
    }
  }
}

async function evaluateMasteryThreshold(
  c: Extract<SuccessCriteria, { kind: "mastery-threshold" }>,
  studentId: string,
  reader: MasteryReader,
): Promise<CriteriaEvaluation> {
  const scores = await Promise.all(
    c.conceptIds.map((id) => reader.read({ studentId: studentId as never, conceptId: id })),
  );
  const minScore = Math.min(...scores);
  const satisfied = c.conceptIds.length > 0 && scores.every((s) => s >= c.minScore);
  const progress = c.conceptIds.length === 0 ? 0 : Math.min(1, minScore / c.minScore);
  const summary = `mastery ≥ ${c.minScore.toFixed(2)} on ${c.conceptIds.length} concept${c.conceptIds.length === 1 ? "" : "s"}`;
  const unsatisfiedReason = satisfied
    ? ""
    : `lowest mastery is ${minScore.toFixed(2)}; need ≥ ${c.minScore.toFixed(2)}`;
  return { satisfied, progress, summary, unsatisfiedReason };
}

async function evaluateExamPass(
  c: Extract<SuccessCriteria, { kind: "exam-pass" }>,
  reader: GradeReader,
): Promise<CriteriaEvaluation> {
  const grade = await reader.readGrade({ assignmentId: c.assignmentId });
  if (!grade) {
    return {
      satisfied: false,
      progress: 0,
      summary: `exam pass ≥ ${c.minScore.toFixed(2)}`,
      unsatisfiedReason: "exam not yet submitted",
    };
  }
  const satisfied = grade.total >= c.minScore;
  const progress = Math.min(1, grade.total / c.minScore);
  const summary = `exam pass ≥ ${c.minScore.toFixed(2)}`;
  const unsatisfiedReason = satisfied
    ? ""
    : `exam total ${grade.total.toFixed(2)} < ${c.minScore.toFixed(2)}`;
  return { satisfied, progress, summary, unsatisfiedReason };
}

async function evaluateAnd(
  c: Extract<SuccessCriteria, { kind: "and" }>,
  studentId: string,
  masteryReader: MasteryReader,
  gradeReader: GradeReader,
): Promise<CriteriaEvaluation> {
  const subs = await Promise.all(
    c.criteria.map((sub) => evaluateSuccessCriteria(sub, studentId, masteryReader, gradeReader)),
  );
  const satisfied = subs.every((s) => s.satisfied);
  const progress = subs.length === 0 ? 0 : subs.reduce((sum, s) => sum + s.progress, 0) / subs.length;
  const summary = subs.map((s) => s.summary).join(" AND ");
  const unsatisfiedReason = subs
    .filter((s) => !s.satisfied)
    .map((s) => s.unsatisfiedReason)
    .join("; ");
  return { satisfied, progress, summary, unsatisfiedReason };
}

async function evaluateOr(
  c: Extract<SuccessCriteria, { kind: "or" }>,
  studentId: string,
  masteryReader: MasteryReader,
  gradeReader: GradeReader,
): Promise<CriteriaEvaluation> {
  const subs = await Promise.all(
    c.criteria.map((sub) => evaluateSuccessCriteria(sub, studentId, masteryReader, gradeReader)),
  );
  const satisfied = subs.some((s) => s.satisfied);
  const progress = subs.length === 0 ? 0 : Math.max(...subs.map((s) => s.progress));
  const summary = subs.map((s) => s.summary).join(" OR ");
  const unsatisfiedReason = satisfied ? "" : "no branch satisfied";
  return { satisfied, progress, summary, unsatisfiedReason };
}
```

```typescript
// evaluator.ts — top-level GateEvaluatorImpl

import type {
  Gate,
  GateEvaluation,
  GateEvaluationEntry,
  GateEvaluator,
  GateEvaluatorInput,
  GateTransition,
} from "@praxis/core/types";
import { evaluateSuccessCriteria } from "./criteria.js";

export class GateEvaluatorImpl implements GateEvaluator {
  async evaluate(input: GateEvaluatorInput): Promise<GateEvaluation> {
    // Build a lookup so prerequisite checks don't redo work.
    const byId = new Map(input.gates.map((g) => [g.id, g] as const));
    const evaluations = new Map<string, GateEvaluationEntry>();

    // Topological-ish: a gate's afterState depends on prerequisites' afterStates.
    // Iterate in `prerequisites-before-dependents` order. We approximate via a
    // simple repeated pass — at most O(N^2), N ≤ ~30 in v1, totally fine.
    let changed = true;
    let safety = input.gates.length + 1;
    while (changed && safety-- > 0) {
      changed = false;
      for (const gate of input.gates) {
        if (evaluations.has(gate.id)) continue;
        // All prerequisites must have been evaluated.
        if (!gate.prerequisites.every((p) => evaluations.has(p))) continue;

        const entry = await this.evaluateGate(gate, evaluations, input);
        evaluations.set(gate.id, entry);
        changed = true;
      }
    }
    if (evaluations.size !== input.gates.length) {
      input.log?.warn("gate.evaluator.cycle_or_missing_prereq", {
        evaluated: evaluations.size,
        total: input.gates.length,
      });
    }

    const perGate = input.gates
      .map((g) => evaluations.get(g.id))
      .filter((e): e is GateEvaluationEntry => e !== undefined);

    const transitions: GateTransition[] = [];
    for (const e of perGate) {
      if (e.beforeState.kind !== "unlocked" && e.afterState.kind === "unlocked") {
        transitions.push({
          kind: "unlocked",
          gateId: e.gateId,
          at: input.now,
          evidence: e.afterState.evidence,
        });
      }
      // re-locked transitions not produced in v1
    }

    return { perGate, transitions };
  }

  private async evaluateGate(
    gate: Gate,
    priorEvaluations: Map<string, GateEvaluationEntry>,
    input: GateEvaluatorInput,
  ): Promise<GateEvaluationEntry> {
    // Already overridden? Treat as unlocked, never change.
    if (gate.state.kind === "overridden") {
      return {
        gateId: gate.id,
        beforeState: gate.state,
        afterState: gate.state,
        progress: 1,
        lockReason: "",
        summaryText: "(manually overridden)",
      };
    }

    // Already unlocked? Stay unlocked. (No re-locking in v1.)
    if (gate.state.kind === "unlocked") {
      return {
        gateId: gate.id,
        beforeState: gate.state,
        afterState: gate.state,
        progress: 1,
        lockReason: "",
        summaryText: this.summarizeCriteria(gate.successCriteria),
      };
    }

    // Currently locked. Check prereqs first.
    const missingPrereqs = gate.prerequisites.filter((p) => {
      const prior = priorEvaluations.get(p);
      return !prior || prior.afterState.kind !== "unlocked";
    });

    if (missingPrereqs.length > 0) {
      const after = { kind: "locked" as const, missingPrerequisites: missingPrereqs };
      return {
        gateId: gate.id,
        beforeState: gate.state,
        afterState: after,
        progress: 0,
        lockReason: `prerequisite gates not yet unlocked (${missingPrereqs.length})`,
        summaryText: this.summarizeCriteria(gate.successCriteria),
      };
    }

    // Prereqs OK — evaluate the criteria.
    const ev = await evaluateSuccessCriteria(
      gate.successCriteria,
      input.studentId,
      input.masteryReader,
      input.gradeReader,
    );

    if (ev.satisfied) {
      const after: GateState = {
        kind: "unlocked",
        unlockedAt: input.now,
        evidence: this.collectEvidence(gate.successCriteria),
      };
      return {
        gateId: gate.id,
        beforeState: gate.state,
        afterState: after,
        progress: 1,
        lockReason: "",
        summaryText: ev.summary,
      };
    }

    return {
      gateId: gate.id,
      beforeState: gate.state,
      afterState: { kind: "locked", missingPrerequisites: [] },
      progress: ev.progress,
      lockReason: ev.unsatisfiedReason,
      summaryText: ev.summary,
    };
  }

  private summarizeCriteria(c: SuccessCriteria): string {
    // Lightweight pre-eval summary that doesn't need readers.
    switch (c.kind) {
      case "mastery-threshold":
        return `mastery ≥ ${c.minScore.toFixed(2)} on ${c.conceptIds.length} concept${c.conceptIds.length === 1 ? "" : "s"}`;
      case "exam-pass":
        return `exam pass ≥ ${c.minScore.toFixed(2)}`;
      case "and":
        return c.criteria.map((s) => this.summarizeCriteria(s)).join(" AND ");
      case "or":
        return c.criteria.map((s) => this.summarizeCriteria(s)).join(" OR ");
    }
  }

  private collectEvidence(c: SuccessCriteria): ReadonlyArray<{ kind: "event" | "assignment" | "manual"; id: string }> {
    // Walk the tree, collect assignmentIds (assignment evidence) and conceptIds (event evidence — skipped in v1).
    switch (c.kind) {
      case "mastery-threshold":
        // Phase 14 may add concept-event evidence; v1 leaves empty.
        return [];
      case "exam-pass":
        return [{ kind: "assignment", id: c.assignmentId }];
      case "and":
      case "or":
        return c.criteria.flatMap((s) => this.collectEvidence(s));
    }
  }
}
```

```typescript
// gates/index.ts

export { GateEvaluatorImpl } from "./evaluator.js";
export { evaluateSuccessCriteria } from "./criteria.js";
```

**Implementation notes**:
- Cyclic prerequisites are defended by the `safety` counter — protects against pathological gate authoring (Phase 11 might let configurators write cycles).
- The criteria evaluator's `progress` for AND is the average; for OR it's the max. The semantics: AND's progress reflects how close ALL branches are; OR's reflects how close the BEST branch is.
- `summarizeCriteria` and `evaluateSuccessCriteria` both produce a `summary` string. The latter is more accurate (knows current state); the former is used as a fallback for unlocked gates where we don't want to re-evaluate just for display. They produce the same output for a given criteria.

**Acceptance criteria**:
- [ ] `evaluate` produces one `GateEvaluationEntry` per gate.
- [ ] `transitions` includes only newly-unlocked gates.
- [ ] Already-unlocked gates stay unlocked; never produce a re-lock transition.
- [ ] Already-overridden gates stay overridden.
- [ ] Locked gate with mastery just below threshold: `progress = currentMastery / threshold`.
- [ ] Locked gate with prereq not unlocked: `progress = 0` regardless of own criteria.
- [ ] AND criteria progress is the mean of children; OR is the max.
- [ ] Cyclic prerequisite protection: pathological cycle yields a warn log, not infinite loop.

---

### Unit 5: `ArtifactsServiceImpl` extensions

**File**: `packages/core/src/services/artifacts-service.ts` (modified)

```typescript
// New helper imports
import { gateUnlockEvents } from "@praxis/artifacts/schema";
import { GateEvaluatorImpl } from "@praxis/curriculum/gates";

export class ArtifactsServiceImpl implements ArtifactsService, CourseStateReader {
  // ... existing constructor, methods ...

  /**
   * Phase 9: Computed view of all gates for a course, with display strings.
   * Pure read; does not run the evaluator (uses persisted state + a quick
   * progress estimate).
   */
  async gateView(input: { studentId: StudentId; courseId: CourseId }): Promise<GateView[]> {
    const gates = await this.gates(input.courseId);
    if (gates.length === 0) return [];

    // For locked gates, run the criteria evaluator to produce a real progress %.
    // This is read-only — no persistence.
    const evaluator = new GateEvaluatorImpl();
    const result = await evaluator.evaluate({
      studentId: input.studentId,
      gates,
      masteryReader: this.deps.masteryReader,
      gradeReader: this.deps.gradeReader,
      now: Date.now() as Timestamp,
      log: this.deps.log,
    });

    // Identify the active gate: first locked gate with all prereqs unlocked.
    let activeGateIdx = -1;
    for (let i = 0; i < result.perGate.length; i++) {
      const e = result.perGate[i]!;
      if (e.afterState.kind !== "unlocked" && e.afterState.kind !== "overridden" && e.lockReason !== `prerequisite gates not yet unlocked (${e.afterState.kind === "locked" ? e.afterState.missingPrerequisites.length : 0})`) {
        activeGateIdx = i;
        break;
      }
    }

    return result.perGate.map((entry, i) => ({
      gate: gates[i]!,
      summaryText: entry.summaryText,
      lockReason: entry.lockReason,
      progress: entry.progress,
      isActive: i === activeGateIdx,
    }));
  }

  /**
   * Phase 9: Run gate evaluation, persist transitions atomically, write
   * gate_unlock_events for newly-unlocked gates. Returns unlocked gate ids.
   */
  async evaluateAndPersistGates(input: {
    studentId: StudentId;
    courseId: CourseId;
  }): Promise<{ unlockedGateIds: GateId[] }> {
    const gates = await this.gates(input.courseId);
    if (gates.length === 0) return { unlockedGateIds: [] };

    const evaluator = new GateEvaluatorImpl();
    const result = await evaluator.evaluate({
      studentId: input.studentId,
      gates,
      masteryReader: this.deps.masteryReader,
      gradeReader: this.deps.gradeReader,
      now: Date.now() as Timestamp,
      log: this.deps.log,
    });

    if (result.transitions.length === 0) {
      // No-op write avoidance.
      return { unlockedGateIds: [] };
    }

    return this.deps.db.transaction((tx) => {
      const unlockedGateIds: GateId[] = [];
      for (const entry of result.perGate) {
        if (entry.beforeState.kind === entry.afterState.kind) continue; // no change
        tx.update(gatesTable)
          .set({ stateJson: entry.afterState })
          .where(eq(gatesTable.id, entry.gateId))
          .run();
      }
      for (const transition of result.transitions) {
        if (transition.kind !== "unlocked") continue;
        tx.insert(gateUnlockEvents).values({
          id: uuidv7(),
          studentId: input.studentId,
          courseId: input.courseId,
          gateId: transition.gateId,
          unlockedAt: new Date(transition.at),
          evidenceJson: transition.evidence,
        }).run();
        unlockedGateIds.push(transition.gateId);
      }
      return { unlockedGateIds };
    });
  }

  /**
   * Phase 9: Mark all unlock events for a course as viewed.
   */
  async markGatesViewed(input: { studentId: StudentId; courseId: CourseId }): Promise<void> {
    this.deps.db
      .update(gateUnlockEvents)
      .set({ viewedAt: new Date() })
      .where(
        and(
          eq(gateUnlockEvents.studentId, input.studentId),
          eq(gateUnlockEvents.courseId, input.courseId),
          isNull(gateUnlockEvents.viewedAt),
        ),
      )
      .run();
  }

  /**
   * Phase 9: Count of unlock events for a course since the last markGatesViewed.
   */
  async newlyUnlockedCount(input: { studentId: StudentId; courseId: CourseId }): Promise<number> {
    const rows = this.deps.db
      .select()
      .from(gateUnlockEvents)
      .where(
        and(
          eq(gateUnlockEvents.studentId, input.studentId),
          eq(gateUnlockEvents.courseId, input.courseId),
          isNull(gateUnlockEvents.viewedAt),
        ),
      )
      .all();
    return rows.length;
  }

  /**
   * Phase 9: Extend CourseStateReader.read() to populate gates + activeGate + visibilityWindow.
   */
  async read(input: { studentId: StudentId; courseId: CourseId }): Promise<CourseStateSnapshot | null> {
    // ... existing implementation that builds course/lessons/conceptsByLesson/conceptsById ...

    const gateViews = await this.gateView(input);
    const activeGate = gateViews.find((g) => g.isActive) ?? null;

    const currentLessonIndex = lessonsList.findIndex((l) => l.id === currentLesson?.id);
    const visibilityWindow: VisibilityWindow = {
      currentLessonIndex: currentLessonIndex >= 0 ? currentLessonIndex : 0,
      remainingCount: Math.max(0, lessonsList.length - (currentLessonIndex + 2)),
    };

    return {
      course,
      lessons: lessonsList,
      currentLesson,
      conceptsByLesson,
      conceptsById,
      gates: gateViews,           // ← Phase 9
      activeGate,                  // ← Phase 9
      visibilityWindow,            // ← Phase 9
    };
  }
}

interface ArtifactsServiceDeps {
  db: PraxisDb;
  log: Logger;
  /** ← Phase 9 NEW. Injected by buildServices — same instance as MemoryServiceImpl. */
  masteryReader: MasteryReader;
  /** ← Phase 9 NEW. Injected by buildServices — same instance as AssignmentServiceImpl. */
  gradeReader: GradeReader;
}
```

**Implementation notes**:
- The `gates` table import is aliased to `gatesTable` to disambiguate from the local `gates` method.
- `evaluateAndPersistGates` is the only writer; reads are go via `gateView`.
- `read()` (the `CourseStateReader.read`) extension means **every Phase 6/7/8 caller of `courseStateReader.read(...)` automatically gets gates** — backward-compatible because consumers can ignore the new fields.

**Acceptance criteria**:
- [ ] `gateView` returns one entry per gate with `summaryText`, `lockReason`, `progress`, `isActive`.
- [ ] `evaluateAndPersistGates` writes only when there are transitions.
- [ ] Atomic: throws midway → no partial DB state.
- [ ] `read()` returns `gates`, `activeGate`, `visibilityWindow` on the snapshot.
- [ ] `markGatesViewed` updates only events for the (student, course) pair where `viewedAt is null`.
- [ ] `newlyUnlockedCount` reflects unviewed unlock events accurately.

---

### Unit 6: Brief composer extension — bounded visibility window

**File**: `packages/curriculum/src/brief/course-context.ts` (modified)

```typescript
export interface ComposeCourseContextInput {
  snapshot: CourseStateSnapshot;
  masteryByConceptId?: ReadonlyMap<string, number>;
}

export function composeCourseContextFragment(input: ComposeCourseContextInput): PromptFragment {
  const { snapshot, masteryByConceptId } = input;
  const lines: string[] = [];

  // Header
  lines.push(`Active course: ${snapshot.course.title} (${snapshot.course.subject}, ${snapshot.course.gradeLevel})`);

  // Course shape one-liner
  const totalLessons = snapshot.lessons.length;
  const completedLessons = snapshot.lessons.filter((l, i) => i < snapshot.visibilityWindow.currentLessonIndex).length;
  lines.push(`Course progress: ${completedLessons} of ${totalLessons} lessons complete; ${totalLessons - completedLessons - 1} ahead.`);

  // Current lesson — full detail
  if (snapshot.currentLesson) {
    lines.push(`Current lesson: ${snapshot.currentLesson.title}`);
    const conceptRows = snapshot.conceptsByLesson.get(snapshot.currentLesson.id) ?? [];
    if (conceptRows.length > 0) {
      lines.push(`Concepts in this lesson:`);
      for (const c of conceptRows) {
        const mastery = masteryByConceptId?.get(c.conceptId);
        const tag = formatMasteryTag(mastery, c.studied);
        lines.push(`  • ${c.name} — ${tag}`);
      }
    }
    if (snapshot.currentLesson.references.length > 0) {
      lines.push(`References:`);
      for (const r of snapshot.currentLesson.references) {
        const locP = r.locator?.page ? ` (p.${r.locator.page})` : "";
        const locS = r.locator?.section ? ` [${r.locator.section}]` : "";
        lines.push(`  • ${r.kind}: ${r.source}${locP}${locS}`);
      }
    }
    lines.push(`Suggested strategy: ${snapshot.currentLesson.suggestedStrategy}`);
  } else {
    lines.push(`This course has no in-progress lesson; all lessons are completed or none have been started.`);
  }

  // Next lesson — title + concept count + lock status
  const nextLessonIndex = snapshot.visibilityWindow.currentLessonIndex + 1;
  if (nextLessonIndex < snapshot.lessons.length) {
    const nextLesson = snapshot.lessons[nextLessonIndex]!;
    const nextLessonGate = snapshot.gates.find((g) =>
      g.gate.guards.kind === "lesson" && g.gate.guards.lessonId === nextLesson.id,
    );
    const lockTag =
      nextLessonGate && nextLessonGate.gate.state.kind !== "unlocked" && nextLessonGate.gate.state.kind !== "overridden"
        ? ` — locked${nextLessonGate.lockReason ? `: ${nextLessonGate.lockReason}` : ""}`
        : "";
    const conceptCount = nextLesson.conceptIds.length;
    lines.push(`Up next: "${nextLesson.title}" (${conceptCount} concept${conceptCount === 1 ? "" : "s"})${lockTag}`);
  }

  // Bounded visibility — summarize anything beyond next lesson
  if (snapshot.visibilityWindow.remainingCount > 0) {
    lines.push(`(${snapshot.visibilityWindow.remainingCount} more lesson${snapshot.visibilityWindow.remainingCount === 1 ? "" : "s"} follow.)`);
  }

  // Active gate — what the student is working toward
  if (snapshot.activeGate) {
    lines.push(`Working toward: unlock — ${snapshot.activeGate.summaryText}`);
    if (snapshot.activeGate.lockReason) {
      lines.push(`  Current status: ${snapshot.activeGate.lockReason}`);
    }
  }

  // Newly unlocked (Phase 9): if any are present, narrate
  // Note: SessionService injects unlockedGates via a separate fragment override
  // (see Unit 8). composeCourseContextFragment doesn't read SessionSummary.

  return {
    id: "context.course-state",
    position: "context",
    customizable: true,
    template: lines.join("\n"),
  };
}
```

**Implementation notes**:
- `formatMasteryTag` from Phase 7 is reused unchanged.
- The "newly unlocked" line is injected via a separate prompt fragment when `SessionSummary.unlockedGates.length > 0`. See Unit 8 for the integration point.
- The bounded visibility window keeps the brief proportional to course size: a 50-lesson course produces the same brief shape as a 5-lesson course; the `remainingCount` line is the only thing that varies.

**Acceptance criteria**:
- [ ] Brief includes course-progress one-liner.
- [ ] Brief includes current lesson detail; references when present.
- [ ] Brief includes next lesson title with lock tag when applicable.
- [ ] Brief includes "(X more lessons follow)" when there are more than one ahead.
- [ ] Brief includes active-gate "Working toward" line when there's a locked gate the student is currently working toward.
- [ ] Brief stays bounded regardless of course size (no per-lesson detail beyond next).

---

### Unit 7: Tool lock enforcement

**Files**:
- `packages/tools/src/course/start-lesson.ts` (modified)
- `packages/tools/src/course/mark-studied.ts` (modified)
- `packages/tools/src/assignment/create.ts` (modified)
- `packages/tools/src/lock-helpers.ts` (new — shared)

```typescript
// lock-helpers.ts — pure helper used by all lock checks

import type { ConceptId, CourseStateSnapshot, LessonId } from "@praxis/core/types";

export interface LockCheckInput {
  snapshot: CourseStateSnapshot;
}

export type LockCheckResult =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Check whether a lesson can be acted on (started, mark concepts as studied).
 * A lesson is locked if its lesson-guarding gate is in `locked` state.
 */
export function checkLessonNotLocked(
  snapshot: CourseStateSnapshot,
  lessonId: LessonId,
): LockCheckResult {
  const gate = snapshot.gates.find(
    (g) => g.gate.guards.kind === "lesson" && g.gate.guards.lessonId === lessonId,
  );
  if (!gate) return { ok: true }; // no gate guards this lesson
  const state = gate.gate.state;
  if (state.kind === "unlocked" || state.kind === "overridden") return { ok: true };
  return {
    ok: false,
    reason: `Lesson is locked: ${gate.lockReason || "prerequisites not met"}.`,
  };
}

/**
 * Check whether a concept can be acted on. Walks lessons-by-concept index.
 */
export function checkConceptNotLocked(
  snapshot: CourseStateSnapshot,
  conceptId: ConceptId,
): LockCheckResult {
  const conceptRow = snapshot.conceptsById.get(conceptId);
  if (!conceptRow) return { ok: false, reason: `Concept not found in this course.` };
  return checkLessonNotLocked(snapshot, conceptRow.lessonId);
}
```

```typescript
// start-lesson.ts (modified handler)

async handler(args, ctx) {
  // Phase 9: Lock check.
  if (ctx.courseId) {
    const snapshot = await ctx.services.courseState.read({
      studentId: ctx.studentId,
      courseId: ctx.courseId,
    });
    if (snapshot) {
      const lessonId = brandId<"LessonId">(args.lessonId);
      const lockCheck = checkLessonNotLocked(snapshot, lessonId);
      if (!lockCheck.ok) throw new Error(`cannot start_lesson "${args.lessonId}": ${lockCheck.reason}`);
    }
  }
  // ... existing handler logic
}
```

```typescript
// mark-studied.ts (modified handler)

async handler(args, ctx) {
  // Phase 9: Lock check.
  if (ctx.courseId) {
    const snapshot = await ctx.services.courseState.read({
      studentId: ctx.studentId,
      courseId: ctx.courseId,
    });
    if (snapshot) {
      const conceptId = brandId<"ConceptId">(args.conceptId);
      const lockCheck = checkConceptNotLocked(snapshot, conceptId);
      if (!lockCheck.ok) throw new Error(`cannot mark_studied "${args.conceptId}": ${lockCheck.reason}`);
    }
  }
  // ... existing handler logic
}
```

```typescript
// assignment/create.ts (modified handler — add lock check before persistence)

async handler(args, ctx) {
  // Phase 9: Lock check on every conceptId.
  if (ctx.courseId) {
    const snapshot = await ctx.services.courseState.read({
      studentId: ctx.studentId,
      courseId: ctx.courseId,
    });
    if (snapshot) {
      for (const cId of args.conceptIds) {
        const conceptId = brandId<"ConceptId">(cId);
        const lockCheck = checkConceptNotLocked(snapshot, conceptId);
        if (!lockCheck.ok) {
          throw new Error(`cannot create assignment: concept "${cId}" — ${lockCheck.reason}`);
        }
      }
    }
  }
  // ... existing handler logic (assignment.create persistence)
}
```

**Implementation notes**:
- `checkLessonNotLocked` and `checkConceptNotLocked` are pure functions over the snapshot. No DB reads.
- Throws are caught by the `InProcessToolRegistry.dispatch` wrapper (Phase 4) — emerge as `tool_result.ok = false, error.message = "cannot start_lesson..."`. The agent reads the error and narrates.
- Sessions without a `courseId` (plain teach without course context) skip lock checks — backward-compatible.

**Acceptance criteria**:
- [ ] `course.start_lesson(lockedLessonId)` throws with the lock reason in the message.
- [ ] `course.mark_studied(conceptInLockedLesson)` throws with the lock reason.
- [ ] `assignment.create` rejects when any conceptId is in a locked lesson; succeeds when all are unlocked.
- [ ] Calls without a `courseId` skip lock checks (don't break in pre-Phase-6 tests).
- [ ] Read tools (`course.what_can_i_teach`, `course.current_concept`, `assignment.show`, `assignment.read_grade`, `retrieve_from_textbook`) are not affected.

---

### Unit 8: SessionService integration — end-of-session evaluation + unlock narration

**File**: `packages/core/src/services/session-service.ts` (modified)

```typescript
async end(sessionId: SessionId): Promise<SessionSummary> {
  const sessionRow = this.deps.db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  if (!sessionRow) throw new Error(`Session not found: ${sessionId}`);

  // Phase 7: misconception indexer + post-turn indexers run.
  await this.deps.indexerOrchestrator?.runAtSessionEnd({
    studentId: brandId<"StudentId">(sessionRow.studentId),
    sessionId,
  });

  // Phase 9: Run gate evaluator if the session has a courseId.
  let unlockedGates: GateId[] = [];
  if (sessionRow.courseId) {
    try {
      const result = await this.deps.toolServices.artifacts.evaluateAndPersistGates({
        studentId: brandId<"StudentId">(sessionRow.studentId),
        courseId: brandId<"CourseId">(sessionRow.courseId),
      });
      unlockedGates = result.unlockedGateIds;
    } catch (cause) {
      this.deps.log.warn("session.end.gate_eval_failed", {
        sessionId,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }
  }

  // Phase 7: Cancel any pending indexer timers.
  this.deps.indexerOrchestrator?.cancel(sessionId);

  // Existing: mark session ended.
  const endedAt = new Date();
  this.deps.db.update(sessions).set({ endedAt }).where(eq(sessions.id, sessionId)).run();

  return {
    sessionId,
    endedAt: endedAt.getTime() as Timestamp,
    unlockedGates, // ← Phase 9
    newMisconceptions: 0, // Phase 7 fills this in (TODO Phase 7+, may already be wired)
  };
}
```

For start-time unlock narration on the *next* session: the brief composer at session start reads the `gateView` (gate states, including newly unlocked ones from the prior session-end). The course-context fragment already covers active-gate progress. To call out *newly unlocked since last session*, we add a small additional fragment when there are unviewed unlock events:

```typescript
// session-service.ts — additional override in openActive

if (args.courseId) {
  // ... existing course-context fragment composition ...

  // Phase 9: If there are newly-unlocked gates the student hasn't viewed yet,
  // inject a small "Newly unlocked" fragment.
  const newlyUnlockedCount = await this.deps.toolServices.artifacts.newlyUnlockedCount({
    studentId: args.studentId,
    courseId: args.courseId,
  });
  if (newlyUnlockedCount > 0) {
    const newlyFragment: PromptFragment = {
      id: "context.newly-unlocked",
      position: "context",
      customizable: true,
      template: `Newly unlocked since your last session: ${newlyUnlockedCount} gate${newlyUnlockedCount === 1 ? "" : "s"} now available. Celebrate this with the student briefly before getting into the lesson.`,
    };
    overrides.set(newlyFragment.id, newlyFragment.template);
  }
}
```

**Implementation notes**:
- The newly-unlocked fragment goes in the `overrides` map alongside Phase 6's `context.course-state` and Phase 8's `context.assignment-state` overrides.
- The agent's role fragment doesn't need to know about gates explicitly — the prompt fragment ("Celebrate this with the student briefly") is enough.
- The student "viewing" the unlocks (clearing the badge) happens via either: (a) explicit `client.artifacts.markGatesViewed()` from the courses-list UI, or (b) starting the next teach session against that course (the brief includes the unlock note; once the agent narrates it, the UI can call `markGatesViewed` after the first `model_message` event).

**Acceptance criteria**:
- [ ] `SessionService.end` returns `SessionSummary.unlockedGates` populated when gates unlock.
- [ ] Gate-evaluation failure during `end` doesn't fail the session-end (logged at warn).
- [ ] Sessions without `courseId` skip gate evaluation cleanly.
- [ ] Next session against the same course: brief includes "Newly unlocked" fragment when there are unviewed unlock events.

---

### Unit 9: IPC + client extensions

**Files**:
- `packages/desktop/electron/main/ipc-server.ts` (modified)
- `packages/client/src/services/artifacts-client.ts` (modified)

```typescript
// IPC handler additions in ipc-server.ts

ipcMain.handle("praxis.artifacts.gateView", async (_e, courseId: string) => {
  const studentId = services.getDefaultStudentId();
  return services.artifacts.gateView({
    studentId: brandId<"StudentId">(studentId),
    courseId: brandId<"CourseId">(courseId),
  });
});

ipcMain.handle("praxis.artifacts.evaluateGates", async (_e, courseId: string) => {
  const studentId = services.getDefaultStudentId();
  return services.artifacts.evaluateAndPersistGates({
    studentId: brandId<"StudentId">(studentId),
    courseId: brandId<"CourseId">(courseId),
  });
});

ipcMain.handle("praxis.artifacts.markGatesViewed", async (_e, courseId: string) => {
  const studentId = services.getDefaultStudentId();
  return services.artifacts.markGatesViewed({
    studentId: brandId<"StudentId">(studentId),
    courseId: brandId<"CourseId">(courseId),
  });
});

ipcMain.handle("praxis.artifacts.newlyUnlockedCount", async (_e, courseId: string) => {
  const studentId = services.getDefaultStudentId();
  return services.artifacts.newlyUnlockedCount({
    studentId: brandId<"StudentId">(studentId),
    courseId: brandId<"CourseId">(courseId),
  });
});
```

```typescript
// artifacts-client.ts — additions

class ArtifactsClientImpl implements ArtifactsClient {
  // ... existing methods ...

  gateView(courseId: CourseId): Promise<GateView[]> {
    return this.transport.invoke<GateView[]>("praxis.artifacts.gateView", courseId);
  }

  evaluateGates(courseId: CourseId): Promise<{ unlockedGateIds: GateId[] }> {
    return this.transport.invoke("praxis.artifacts.evaluateGates", courseId);
  }

  markGatesViewed(courseId: CourseId): Promise<void> {
    return this.transport.invoke<void>("praxis.artifacts.markGatesViewed", courseId);
  }

  newlyUnlockedCount(courseId: CourseId): Promise<number> {
    return this.transport.invoke<number>("praxis.artifacts.newlyUnlockedCount", courseId);
  }
}
```

The `ArtifactsClient` interface in `packages/core/src/types/client.ts` is extended with the four new methods.

**Acceptance criteria**:
- [ ] `client.artifacts.gateView(courseId)` returns enriched gate views.
- [ ] `client.artifacts.evaluateGates(courseId)` triggers an evaluation (used by `pnpm db:gates --evaluate`).
- [ ] `client.artifacts.markGatesViewed(courseId)` clears the unlock badge.
- [ ] `client.artifacts.newlyUnlockedCount(courseId)` returns the unviewed unlock count.

---

### Unit 10: ServiceDeps + buildServices wiring

**Files**:
- `packages/core/src/services/types.ts` (modified — `ArtifactsServiceDeps` gets `masteryReader` + `gradeReader`)
- `packages/desktop/electron/main/services.ts` (modified)

```typescript
// services.ts — relevant changes

const memoryService = new MemoryServiceImpl({
  db,
  log,
  decayDaysFor: () => 14,
});

const assignmentService = new AssignmentServiceImpl({
  db,
  log,
  graderServices,
  resolveSubmissionMode: (assignmentId) => {
    const a = db.select().from(assignments).where(eq(assignments.id, assignmentId)).get();
    return (a?.kind as "quiz" | "homework" | "exam") ?? "quiz";
  },
});

const artifactsService = new ArtifactsServiceImpl({
  db,
  log,
  masteryReader: memoryService, // ← Phase 9
  gradeReader: assignmentService, // ← Phase 9
});

// CRITICAL ORDERING: ArtifactsServiceImpl construction must happen AFTER memoryService and assignmentService.
// services.ts already does this implicitly; verify ordering doesn't change.
```

**Acceptance criteria**:
- [ ] `buildServices` constructs services in the right order: memory → assignment → artifacts.
- [ ] `pnpm desktop:build` succeeds with the new injection.
- [ ] First-run boot still works against an empty DB.

---

### Unit 11: UI — Progress Map at `/courses/$courseId/map`

**Files**:
- `packages/ui/src/routes/course-map.tsx` (new)
- `packages/ui/src/routes/course-map.module.css` (new)
- `packages/ui/src/components/concept-node.tsx` (new — React Flow custom node)
- `packages/ui/src/components/gate-edge-label.tsx` (new — edge label renderer)
- `packages/ui/src/components/concept-side-panel.tsx` (new — click-to-detail panel)
- `packages/ui/src/hooks/use-course-gates.ts` (new)
- `packages/ui/src/router.tsx` (modified — register route)
- `packages/ui/src/routes/course-detail.tsx` (modified — add "View progress map" button)

Add `@xyflow/react` to `packages/ui/package.json` dependencies.

```typescript
// hooks/use-course-gates.ts

export function useCourseGates(courseId: CourseId | undefined): {
  gates: GateView[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const client = usePraxisClient();
  const [gates, setGates] = useState<GateView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!courseId) return;
    setLoading(true);
    try {
      const result = await client.artifacts.gateView(courseId);
      setGates(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, courseId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { gates, loading, error, refresh };
}
```

```tsx
// routes/course-map.tsx (sketch)

import { ReactFlow, Background, Controls, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";

export function CourseMapRoute() {
  const { courseId } = useParams({ strict: false });
  // ... fetch course, lessons, gates, mastery via existing hooks ...

  // Build React Flow nodes/edges from concept graph + gate state.
  const { nodes, edges } = useMemo(() => buildGraph({ course, lessons, conceptsByLesson, masteryByConceptId, gates }), [course, lessons, conceptsByLesson, masteryByConceptId, gates]);

  return (
    <div className={styles.layout}>
      <header>
        <button onClick={() => navigate({ to: "/courses/$courseId", params: { courseId } })}>← Course</button>
        <h1>{course.title} — Progress Map</h1>
      </header>
      <div className={styles.canvas}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={{ concept: ConceptNode }}
          edgeTypes={{ gateEdge: GateEdgeLabel }}
          fitView
        >
          <Background />
          <Controls />
        </ReactFlow>
      </div>
      {selectedConceptId && (
        <ConceptSidePanel conceptId={selectedConceptId} onClose={() => setSelectedConceptId(null)} />
      )}
    </div>
  );
}

function buildGraph(args: { course: Course; lessons: Lesson[]; conceptsByLesson: Map<LessonId, ConceptStateRow[]>; masteryByConceptId: Map<string, number>; gates: GateView[] }): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  // dagre auto-layout: position nodes per lesson left-to-right, concepts vertically within lesson.
  // (Use @xyflow/react built-in layout helpers OR external 'dagre' lib.)
  // Attach gate state to edges between lessons.
  return { nodes, edges };
}
```

```tsx
// components/concept-node.tsx (sketch — React Flow custom node)

interface ConceptNodeData {
  name: string;
  mastery: number; // 0..1
  studied: boolean;
  locked: boolean;
}

export function ConceptNode({ data }: { data: ConceptNodeData }) {
  const tone = data.locked ? "locked" : data.mastery >= 0.7 ? "mastered" : data.mastery > 0 ? "in-progress" : "not-started";
  return (
    <div className={`${styles.node} ${styles[tone]}`}>
      <span className={styles.name}>{data.name}</span>
      {!data.locked && <span className={styles.score}>{data.mastery.toFixed(2)}</span>}
      {data.locked && <span className={styles.lockIcon}>🔒</span>}
    </div>
  );
}
```

```tsx
// components/gate-edge-label.tsx (sketch — edge between lessons, shows gate state)

export function GateEdgeLabel({ data }: { data: { gate: GateView } }) {
  const { gate } = data;
  const tone = gate.gate.state.kind === "unlocked" ? "open" : "locked";
  return (
    <div className={`${styles.edgeLabel} ${styles[tone]}`}>
      <span>{gate.summaryText}</span>
      {gate.gate.state.kind !== "unlocked" && (
        <progress max={1} value={gate.progress} />
      )}
    </div>
  );
}
```

**Implementation notes**:
- Auto-layout: use `dagre` (small dep, ~10 KB) to compute node positions before passing to ReactFlow. Alternative: hand-tune left-to-right by lesson index.
- Color palette per design (color-blind safe per CONTRACT.md): green = mastered (avoid red/green-only), yellow/amber = in-progress, gray = locked / not started. Use icon + color (locks with 🔒) for accessibility.
- The route fetches multiple things (course, lessons, gates, mastery). Use React Query / SWR pattern OR just bundle into a single hook that loads them in parallel.

**Acceptance criteria**:
- [ ] `/courses/$courseId/map` renders without error for a course with gates.
- [ ] Concept nodes are color-coded by mastery + lock state.
- [ ] Gate edges between lessons show `summaryText` and unlock-progress bar.
- [ ] Click on a concept opens a side panel with description, references, mastery score.
- [ ] "Back to course" navigation works.

---

### Unit 12: UI — newly-unlocked badge + course-detail map button

**Files**:
- `packages/ui/src/components/course-list-item.tsx` (modified)
- `packages/ui/src/routes/course-detail.tsx` (modified)
- `packages/ui/src/hooks/use-courses.ts` (modified — fetch newly-unlocked count)

```tsx
// course-list-item.tsx — add badge

interface CourseListItemProps {
  course: CourseSummary;
  newlyUnlockedCount?: number; // ← Phase 9
  onClick: () => void;
}

export function CourseListItem({ course, newlyUnlockedCount, onClick }: CourseListItemProps) {
  return (
    <li className={styles.item}>
      <button onClick={onClick}>
        <span className={styles.title}>{course.title}</span>
        <span className={styles.meta}>{course.subject} · {course.gradeLevel}</span>
        {newlyUnlockedCount !== undefined && newlyUnlockedCount > 0 && (
          <span className={styles.unlockBadge}>{newlyUnlockedCount} new unlock{newlyUnlockedCount === 1 ? "" : "s"}</span>
        )}
      </button>
    </li>
  );
}
```

```tsx
// course-detail.tsx — add "View progress map" button to actions section

// In the existing actions <section>:
<button type="button" className={styles.startBtn} onClick={handleStartSession}>
  Start session
</button>
<button type="button" className={styles.mapBtn} onClick={() => navigate({ to: "/courses/$courseId/map", params: { courseId } })}>
  View progress map
</button>
```

```typescript
// use-courses.ts — augment to fetch unlock counts in parallel

export function useCourses() {
  // ... existing list fetch ...

  // After courses load, fetch newly-unlocked counts in parallel.
  useEffect(() => {
    if (courses.length === 0) return;
    Promise.all(
      courses.map(async (c) => ({
        courseId: c.courseId,
        count: await client.artifacts.newlyUnlockedCount(c.courseId),
      })),
    ).then((results) => {
      setNewlyUnlocked(new Map(results.map((r) => [r.courseId, r.count])));
    });
  }, [client, courses]);

  return { courses, newlyUnlocked, ... };
}
```

**Acceptance criteria**:
- [ ] Courses list shows "N new unlocks" badge for courses with unviewed unlock events.
- [ ] Course detail page has a "View progress map" button next to "Start session".
- [ ] Clicking into a course (or starting a session, after the agent narrates) clears the badge via `markGatesViewed`.

---

### Unit 13: `pnpm db:gates` CLI

**File**: `scripts/db-gates.ts` (new)

```typescript
import { openDb } from "@praxis/core/db";
import { courses, gateUnlockEvents, gates } from "@praxis/artifacts/schema";
import { ArtifactsServiceImpl } from "@praxis/core/services";
import { MemoryServiceImpl } from "@praxis/core/services";
// ... imports ...

const args = process.argv.slice(2);
const evaluateFlag = args.includes("--evaluate");

const { db } = openDb({ readonly: !evaluateFlag });

if (evaluateFlag) {
  // Construct services to call evaluateAndPersistGates per course.
  // ...
  console.log("Re-evaluated all gates for all courses.");
}

const courseRows = db.select().from(courses).all();
for (const c of courseRows) {
  console.log(`\n## ${c.title} (${c.id})`);
  const gateRows = db.select().from(gates).where(eq(gates.courseId, c.id)).all();
  console.table(
    gateRows.map((g) => ({
      gateId: g.id.slice(0, 8),
      guards: (g.guardsJson as { kind: string }).kind,
      state: (g.stateJson as { kind: string }).kind,
    })),
  );
  const unlockRows = db.select().from(gateUnlockEvents).where(eq(gateUnlockEvents.courseId, c.id)).all();
  if (unlockRows.length > 0) {
    console.log(`  ${unlockRows.length} unlock events:`);
    for (const u of unlockRows) {
      console.log(`    ${u.gateId.slice(0, 8)} unlocked at ${u.unlockedAt.toISOString()}${u.viewedAt ? " (viewed)" : ""}`);
    }
  }
}
```

Add `db:gates` script entry to root `package.json`.

**Acceptance criteria**:
- [ ] `pnpm db:gates` runs without error on empty DB.
- [ ] After Phase 6 bootstrap, lists all gates per course with state.
- [ ] After `--evaluate`, runs `evaluateAndPersistGates` for each course.

---

### Unit 14: Documentation updates

**Files**:
- `docs/ROADMAP.md` (modified — Phase 9 description)
- `docs/CURRICULUM.md` (modified — gating philosophy v1 details)
- `docs/CONTRACT.md` (modified — gate lifecycle)

**ROADMAP.md** — Phase 9 verbatim:

```markdown
## Phase 9: Gates + progress map

**Goal:** Gates evaluate at session-end against mastery + grades; locked content stops the agent from acting on it; passing an assessment unlocks the next gate; progress map renders the path; agent narrates unlocks.

**Build:**
- `GateEvaluator` port + `GateEvaluatorImpl` (pure, lives in `@praxis/curriculum/gates`)
- `MasteryReader` + `GradeReader` adapter ports (Phase 7's `MemoryServiceImpl` and Phase 8's `AssignmentServiceImpl` implement them)
- `ArtifactsService.evaluateAndPersistGates` runs evaluator at session-end inside `SessionService.end`; transitions are atomic; unlock events written to `gate_unlock_events`
- Brief composer extension — bounded visibility window (current lesson + next lesson + active gate + course-shape summary)
- Tool lock enforcement — `course.start_lesson`, `course.mark_studied`, `assignment.create` refuse with descriptive errors when content is locked
- `SessionSummary.unlockedGates` populated; agent narrates inline; courses-list shows "N new unlocks" badge
- Progress map UI at `/courses/$courseId/map` — React Flow with custom concept-node + gate-edge-label components; auto-layout from prerequisite graph
- `pnpm db:gates` CLI

**Deferred:** cross-course `SuccessCriteria` variants (Phase 10/11); soft gates / topic-exploration mode (Phase 14); gate editor (Phase 11); decay-driven re-locking (Phase 14); gate overrides via configure mode (Phase 11).

**Test checkpoint:** Course with three chained gated topics. Pass exam → next session has next topic unlocked. `Gate.state.kind` transitions in DB. `pnpm db:gates` shows transition timestamps. Brief shows the active gate's progress and lock reason.

**Integration milestone M2:** bootstrap → learn → assess → unlock → progress all wired.
```

**CURRICULUM.md** — gating-philosophy section update:

```markdown
**Phase 9 v1 status:** Gates evaluate at session-end (not mid-session, per ARCHITECTURE.md). Gates are course-local — `SuccessCriteria` references concepts and assignments within one course's graph. **Cross-course mastery flows automatically through shared concept IDs** — if Course A and Course B share a `conceptGraphId` (via Phase 10 canonical packs), mastery on those concepts is visible to both. Cross-course `SuccessCriteria` variants (e.g., `external-mastery`) are deferred to Phase 11. Soft-gating defaults are deferred to Phase 14. Decay-driven re-locking is deferred to Phase 14 to avoid the "system took my progress away" UX issue without spaced-review nudges in place.
```

**CONTRACT.md** — gate lifecycle:

```markdown
> **v1 status (Phase 9)**: Gates are evaluated at session-end via `ArtifactsService.evaluateAndPersistGates`. Once unlocked, gates stay unlocked (no re-locking in v1 even if mastery decays). State transitions are recorded in `gate_unlock_events` for audit + the courses-list badge. Cross-course success criteria are deferred — `SuccessCriteria` is a discriminated union and adding `external-mastery` later is non-breaking. Mid-session unlocks are explicitly out of scope.
```

**Acceptance criteria**:
- [ ] `docs/ROADMAP.md` Phase 9 description reflects the M2 integration milestone.
- [ ] `docs/CURRICULUM.md` documents course-local-in-v1 stance.
- [ ] `docs/CONTRACT.md` notes the gate lifecycle.

---

### Unit 15: Tests

| Test file | Type | What it tests |
|---|---|---|
| `packages/curriculum/src/gates/__tests__/criteria.test.ts` | unit, fast | mastery-threshold (satisfied/unsatisfied/progress); exam-pass (graded/ungraded); AND/OR composition; future-variant exhaustiveness compile-check. |
| `packages/curriculum/src/gates/__tests__/evaluator.test.ts` | unit, fast | One-pass evaluation; multi-gate prereq chain; cycle defense; unlock-only transitions (no re-lock); overridden gates stay; locked-with-prereq-missing has progress 0. |
| `packages/core/src/services/__tests__/artifacts-service-gates.test.ts` | unit, fast (real DB via useTempDb) | `gateView` produces enriched views; `evaluateAndPersistGates` writes unlock events; `markGatesViewed` clears `viewedAt`; `newlyUnlockedCount` reflects unviewed count; `read()` returns enriched snapshot. |
| `packages/core/src/services/memory/__tests__/memory-service-mastery-reader.test.ts` | unit, fast (real DB) | `MemoryServiceImpl.read` returns 0 for unknown; correct decay-aware value for known. |
| `packages/core/src/services/__tests__/assignment-service-grade-reader.test.ts` | unit, fast (real DB) | `AssignmentServiceImpl.readGrade` returns null when unsubmitted; returns total when submitted. |
| `packages/curriculum/src/brief/__tests__/course-context-bounded.test.ts` | unit, fast | Bounded visibility window: 50-lesson course produces same brief shape; remainingCount is correct; active-gate line appears when activeGate set. |
| `packages/tools/src/course/__tests__/start-lesson-locked.test.ts` | unit, fast | Lock check refuses with descriptive error; allows when unlocked. |
| `packages/tools/src/course/__tests__/mark-studied-locked.test.ts` | unit, fast | Same. |
| `packages/tools/src/assignment/__tests__/create-locked.test.ts` | unit, fast | Concept-lock check across multiple conceptIds. |
| `packages/core/src/services/__tests__/session-service-gates.test.ts` | unit, fast (FakeEngine) | `SessionService.end` runs evaluator; `unlockedGates` populated; gate-eval failure doesn't break session-end (logged at warn). |
| `packages/desktop/src/__tests__/ipc-server-gates.test.ts` | unit | All 4 new IPC channels route correctly. |
| `packages/client/src/__tests__/artifacts-client-gates.test.ts` | unit | Client invokes correct channels. |
| `packages/ui/src/__tests__/use-course-gates.test.tsx` | unit (jsdom), fast | Hook loads gates; refresh re-fetches; error state. |
| `packages/ui/src/__tests__/concept-node.test.tsx` | unit (jsdom) | Renders mastered/in-progress/locked tones. |
| `packages/ui/src/__tests__/course-list-item-badge.test.tsx` | unit (jsdom) | Badge appears when newlyUnlockedCount > 0; absent otherwise. |
| `tests/gates-end-to-end.test.ts` | integration, fast (FakeEngine + mocked sympy/sandbox) | Full M2 flow: bootstrap a course (Phase 6) → teach session with mastery rises (Phase 7 indexers fire) → submit a quiz with score 0.8 (Phase 8) → end session → assert `SessionSummary.unlockedGates` has the gate; assert `gate_unlock_events` row created; assert subsequent session's brief includes "Newly unlocked" fragment. |

---

## Implementation Order

1. **Unit 1** — Type contracts (gate.ts, extended tool.ts).
2. **Unit 2** — Schema (`gate_unlock_events` table + migration).
3. **Unit 3** — `MasteryReader` + `GradeReader` adapters on existing services.
4. **Unit 4** — `GateEvaluatorImpl` + criteria evaluator.
5. **Unit 5** — `ArtifactsServiceImpl` extensions.
6. **Unit 6** — Brief composer extension.
7. **Unit 7** — Tool lock enforcement.
8. **Unit 8** — `SessionService` integration.
9. **Unit 10** — `ServiceDeps` + `buildServices` wiring (depends on 5).
10. **Unit 9** — IPC + client extensions.
11. **Unit 12** — UI: course-list badge + course-detail map button.
12. **Unit 11** — UI: progress map.
13. **Unit 13** — `pnpm db:gates` CLI.
14. **Unit 14** — Doc updates.
15. **Unit 15** — Tests interspersed throughout.

Units 4 (evaluator) and 6 (brief) can be parallelized once Unit 1 (types) lands.

---

## Verification

```bash
pnpm install
pnpm rebuild better-sqlite3   # if NODE_MODULE_VERSION mismatch
pnpm db:generate              # produce migration files (commit them)
pnpm typecheck                # MUST pass
pnpm lint                     # MUST pass
pnpm test                     # MUST pass — fast suite
pnpm db:gates                 # MUST run on empty DB

# Manual checkpoint (Phase 9, M2 milestone)
pnpm desktop:build && pnpm dev
# 1. Phase 6 bootstrap: drop syllabus + textbook → bootstrap a course → confirm draft.
# 2. /courses → see new course → click → "View progress map".
# 3. Map: see all lessons + concepts + gates. All gates initially locked except first lesson.
# 4. "Start session" → teach mode → work through lesson 1, get math answers right.
# 5. End session → SessionSummary shows mastery updates (Phase 7) but no unlocks yet (mastery 0.5).
# 6. New session → continue lesson 1 → mastery now 0.7+ on all concepts.
# 7. End session → SessionSummary.unlockedGates populated → agent narrates "you unlocked Lesson 2!".
# 8. /courses → "1 new unlock" badge on this course.
# 9. Click course → map updates: lesson 1 gate green, lesson 2 unlocked, concept nodes for lesson 2 now visible.
# 10. New session → brief includes "Newly unlocked" fragment → agent celebrates briefly.
# 11. Phase 8: tutor authors a quiz on lesson 2 concepts → student takes it → ends session → if exam-gate criteria met, next gate unlocks.
# 12. `pnpm db:gates` → see all gate transitions with timestamps.
# 13. Try locked content during a session: "let's do lesson 5" → agent calls `course.start_lesson(lesson5Id)` → tool throws → agent narrates "we're not there yet — you need to pass lesson 2's exam first".
```
