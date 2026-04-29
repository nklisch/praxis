# Design: Phase 7 — Adaptive Memory (Semantic + Misconception)

## Overview

Phase 7 closes the personalization loop. The system stops being a stateless tutor that rediscovers the student every session and becomes one that **remembers how well the student knows each concept**. Two projection layers populate from the immutable episodic log:

1. **Semantic (concept mastery)** — a per-(student, concept) BKT-style probability `pKnown`, with uncertainty and a decay-aware `effectivePKnown`. Updated post-turn by a deterministic indexer that scans recent events. Read by `course.what_can_i_teach`, by the course-context prompt fragment, and (Phase 9+) by the gate evaluator and adaptive router.
2. **Misconception** — a list of explicit wrong mental models the student has demonstrated, each with a description, error form, evidence event IDs, and a remediation strategy. Authored at session-end by an agent-driven indexer that reads the full session in one pass.

Two **active-path tools** let the tutoring agent record judgment moments the deterministic indexer can't reach:

- `update_mastery` — emit an explicit signal (`correct`, `incorrect`, `slip`, `hint_requested`, `timeout`) attributed to a concept, with an evidence event id.
- `record_misconception` — emit a misconception in the moment the agent identifies one, without waiting for the session-end indexer.

Both flow into the same projection tables as the indexers. The intercept layer (passive) and active tools converge to the same source of truth.

After Phase 7: a multi-turn session with deliberate wrong answers updates `student_mastery` to reflect the missed concepts; `pnpm db:mastery` lists the per-concept scores and uncertainties; the next session opens with a course-context fragment showing graduated mastery numbers (not just "studied"); misconceptions appear in the database with evidence event IDs that trace back to the originating turns.

**Key design move:** the **mastery indexer is deterministic** in Phase 7. The active-path `update_mastery` tool is the agent's escape valve for cases the deterministic logic can't classify (e.g., "that wrong answer was a slip, not a miss"). LLM-driven mastery refinement is **deferred to a future Phase 7.x** — the `Indexer` interface accommodates a `LlmMasteryRefinementIndexer` as a one-file addition with zero infra changes. We ship the loop first, evaluate it with real sessions in Phase 14, and add intelligence where evidence justifies it.

**What ships:**

- **No new schema** (it all already exists from Phase 1: `student_mastery`, `misconceptions`, `episodic_events`).
- **`Indexer` port + `IndexerOrchestrator`** in `@praxis/core/services/indexers/` — runs registered indexers post-turn (debounced) and at session-end. Failures are logged but don't propagate; projections continue from last known good state per `ARCHITECTURE.md`.
- **`MasteryIndexer`** (deterministic, post-turn) — scans recent episodic events for grading + course-mark + active-path signals; applies BKT updates per concept; writes `student_mastery`.
- **`MisconceptionIndexer`** (agent-driven, session-end) — reads the full session via `runOneShot` against the active engine; returns structured misconception entries; merges into `misconceptions` table (deduplicating by `errorForm` + concept).
- **BKT helper** (`packages/core/src/services/memory/bkt.ts`) — the four-parameter Bayesian Knowledge Tracing update. Pure functions, no DB access.
- **Decay helper** (`packages/core/src/services/memory/decay.ts`) — exponential decay applied at read time: `effectivePKnown = pKnown * exp(-Δdays / decayDays)`. Pure function.
- **Active-path tools** in `@praxis/tools/memory/` — `update_mastery`, `record_misconception`. Tier `"grounded"` for record_misconception; tier `"deterministic"` for update_mastery (math is pure BKT).
- **`MemoryServiceImpl`** in `@praxis/core/services/memory-service.ts` — implements `studentModel()`, `misconceptions()`, `episodic({sessionId?, range?})`, `procedural()` and `affective()` (return empty defaults — Phase 14 fills), `export()`, `delete({confirm: true})`.
- **`praxis.memory.*` IPC** — `studentModel`, `misconceptions`, `episodic` (streamed), `export`, `delete`. The `MemoryClient` Phase 3 stub is replaced with a real implementation.
- **Course-context fragment update** — graduated mastery rendering ("mastered (0.85)" / "in progress (0.42)" / "not yet started"). Pulls from `student_mastery` via `CourseStateReader`.
- **`teach` mode update** — adds `update_mastery` and `record_misconception` to `toolNames`; tools fragment gets a section explaining when to call each.
- **`SessionServiceImpl` integration** — after each turn's event stream completes, `IndexerOrchestrator.scheduleAfterTurn(...)` runs (debounced, fire-and-forget). On `SessionService.end`, `IndexerOrchestrator.runAtSessionEnd(...)` runs synchronously before the session row's `endedAt` is set, so misconceptions land before the UI navigates away.
- **`pnpm db:mastery` script** at `scripts/db-mastery.ts` — table-formatted listing of per-(student, concept) mastery with effective decay applied.
- **Tests**: BKT correctness, decay correctness, deterministic-mastery indexer scenarios, misconception indexer with FakeEngine, debounce timing, MemoryService export/delete round-trips.
- **Doc updates**: `docs/ROADMAP.md` Phase 7 description (clarifies indexer split + deferred LLM refinement); `docs/CURRICULUM.md` and `docs/CONTRACT.md` (small clarifications around BKT defaults and active-path tools).

**What does not ship (deferred):**

- **LLM mastery refinement** — Phase 7.x or later. Same `Indexer` interface can add it without rework.
- **Procedural memory (strategy preferences) + affective memory (engagement/frustration)** — Phase 14. `MemoryService.procedural()` and `affective()` return safe defaults.
- **Misconception remediation in `study-skills` mode** — Phase 14.
- **Adaptive router using mastery** — Phase 9/10. Phase 7 makes mastery available; consumption lands later.
- **Gate auto-evaluation on mastery threshold** — Phase 9. Phase 7 writes mastery; Phase 9 reads it to evaluate `SuccessCriteria.kind: "mastery-threshold"`.
- **Memory inspector UI** — Phase 11 (configure mode). Phase 7 ships the `MemoryService` reads + the CLI script; the UI inspector is part of the lock-gated authoring surface.
- **Cross-graph concept linking via embeddings** — Phase 10. Per-graph mastery only in v1.
- **Per-concept BKT parameter overrides** — Phase 14, after eval data justifies tuning. Single global default in v1.
- **`record_misconception` triggering immediate remediation in chat** — agent narration only; explicit remediation flow lands with `study-skills` mode in Phase 14.

## Why these choices (decision rationale)

**Why deterministic mastery indexer in v1.** The mastery loop has to run to be evaluated. Shipping a deterministic baseline that updates BKT from grade results, `course.mark_studied` calls, and active-path tool signals lets us watch real student sessions, see where mastery scores drift from intuition, and justify LLM refinement (or BKT-parameter tuning) with eval data instead of guesswork. The active-path `update_mastery` tool gives the tutoring agent an escape hatch for the slip-vs-miss case the deterministic logic can't classify. Together they cover ~80% of cases at a fraction of the cost of running an LLM indexer per turn.

**Why misconception indexer is agent-driven.** Misconception detection is pattern recognition over conversational evidence ("the student keeps treating an inequality as an equality after dividing by a negative"). Deterministic detection would require enumerating misconception patterns by hand — a Phase 10 / 14 problem, not a Phase 7 problem. A small agent reading the full session at session-end produces useful entries from day one and improves naturally as the model improves.

**Why session-end for misconception.** Token-cost bounded (one LLM call per session, not per turn), full-context (the agent sees the whole arc, not just the last turn's snippet), and aligned with how a human reviewer would do it (read the transcript end-to-end). Misconceptions don't appear mid-session in the UI, but they don't need to — the gate-evaluation and adaptive-routing consumers (Phase 9+) read between sessions, not within.

**Why post-turn debounce for mastery.** The mastery indexer is cheap (deterministic, ~10ms). Running it after every turn means the next turn's brief reflects the current mastery state. Debounce 3 seconds — collapses bursts of rapid-fire turns into a single run, but doesn't make the indexer wait long enough that the agent's *next* brief misses the just-arrived signal.

**Why decay at read time, not via scheduled sweep.** A scheduled sweep means a clock tick somewhere is mutating projection state on a periodic interval. That's an extra moving part with no real benefit when the read path already has access to `lastPracticedAt` and can apply the decay function. `effectivePKnown` is computed on every read; the persisted `pKnown` stays untouched between practice events. Easier to reason about, easier to test.

**Why active-path tools are tier `"grounded"` (record_misconception) and `"deterministic"` (update_mastery).** `record_misconception` writes a structured artifact backed by event IDs the model cited — the artifact is grounded in the episodic log. `update_mastery` runs pure BKT math against an explicit signal — deterministic math, no LLM judgment in the math itself. The agent's *choice* to call the tool is model-derived (judgment), but the tool's effect is deterministic.

**Why no new schema.** Phase 1 already created `student_mastery`, `misconceptions`, `episodic_events` with the right columns (millified `pKnown`, evidence JSON, status enum). Phase 7 implements the producers and consumers; the storage layer is ready.

**Why `MemoryService.export()` and `delete()` ship in Phase 7.** SPEC.md commits to "students own their memory: export to a portable format, delete on demand." If we don't land them alongside the writes that populate the tables, the SPEC commitment becomes a vague future promise. Better to ship the contract complete and watch it work.

**Why no UI for memory inspection in Phase 7.** The memory inspector lives behind the configure-mode lock (Phase 11). v1 ships `pnpm db:mastery` (CLI) for power users + the brief-context fragment that surfaces mastery to the tutor through the system prompt. The student sees mastery indirectly via the agent's behavior. The configurator/parent sees it directly when they unlock configure mode.

## Scope and assumptions

- **Single-student per install** (v1 invariant). Indexers operate over `(studentId, ...)` rows.
- **Indexers are independent and idempotent.** Re-running an indexer over the same event range produces the same projection state. This is what makes "regenerable from episodic" hold.
- **Debounce is per-session, fire-and-forget.** A pending mastery indexer run is cancelled and rescheduled when a new turn arrives in the same session. The orchestrator holds at most one pending timer per (sessionId, indexerId).
- **Misconception indexer runs on `SessionService.end`** synchronously (awaited). End time waits for the run; UI sees the new misconceptions immediately. If the engine call fails, the run aborts gracefully — the session still ends.
- **Failures are non-fatal.** A throw inside an indexer is caught by the orchestrator; logged at `warn`; doesn't propagate to the session loop. Episodic events are immutable, so the indexer can be re-run later.
- **Concept attribution from session context.** The mastery indexer attributes signals to the active session's "current concept" (via `CourseStateReader`). When the agent calls `update_mastery({conceptId})`, that explicit attribution wins over inference. When no current concept is resolvable, the indexer is conservative and skips that signal (logs at debug).
- **BKT defaults.** `P(L0) = 0.1` (prior knowledge), `P(T) = 0.1` (transition), `P(G) = 0.2` (guess), `P(S) = 0.1` (slip). Single global config in `@praxis/curriculum/bkt-config.ts`. Per-concept overrides are deferred to Phase 14.
- **Decay constant.** Pulled from the active course's `ThresholdConfig.decayDays` (default 14, set during Phase 6 bootstrap). Concepts not associated with any course (rare in v1) use a global default of 14 days.
- **Misconception dedup.** Two misconception entries with the same `(studentId, conceptId, errorForm)` merge: evidence arrays union; `lastObservedAt` updates to the more recent observation; `firstObservedAt` keeps the older value. Status remains `"active"` unless explicitly transitioned.
- **`MemoryService.delete({confirm: true})`** wipes `student_mastery`, `misconceptions`, `procedural_strategies`, `affective_samples` for the student, but **does not touch `episodic_events`** — those carry `redactedAt` set to now. Re-running indexers on redacted episodic produces empty projections. Episodic survives because re-deriving projections from redacted events is honest about what was deleted.
- **Slow tests gated** behind `PRAXIS_RUN_SLOW_TESTS=1` (real engine misconception runs against fixture sessions).

## Dependency direction (Phase 7 additions)

```
@praxis/core/types
  ├─ MODIFIED: tool.ts — ToolServices.memory: MemoryService (was unknown)
  ├─ NEW: memory.ts — Indexer port, IndexerEvent, MasterySignal, IndexerContext
  └─ MODIFIED: client.ts — no breaking changes; reads/writes match Phase 3 stub

@praxis/curriculum
  ├─ NEW: bkt-config.ts — global BKT params + decay default
  ├─ MODIFIED: brief/course-context.ts — graduated mastery tags
  ├─ MODIFIED: modes/teach.ts — add update_mastery + record_misconception to toolNames
  └─ MODIFIED: modes/fragments/tools.ts — explain when to call active-path tools

@praxis/core/services
  ├─ NEW: memory/bkt.ts — pure BKT helpers
  ├─ NEW: memory/decay.ts — pure decay helper
  ├─ NEW: memory/memory-service.ts — MemoryServiceImpl
  ├─ NEW: indexers/types.ts — Indexer port, IndexerOrchestrator interface
  ├─ NEW: indexers/orchestrator.ts — IndexerOrchestratorImpl (debounce + run-at-end)
  ├─ NEW: indexers/mastery-indexer.ts — deterministic mastery
  ├─ NEW: indexers/misconception-indexer.ts — agent-driven misconception
  ├─ MODIFIED: types.ts — ServiceDeps.toolServices.memory; deps.indexerOrchestrator
  └─ MODIFIED: session-service.ts — schedule indexers post-turn + at session end

@praxis/tools
  └─ NEW: memory/
      ├─ update-mastery.ts
      ├─ record-misconception.ts
      └─ index.ts — export MEMORY_TOOLS

@praxis/desktop
  ├─ MODIFIED: services.ts — wire MemoryServiceImpl + IndexerOrchestratorImpl + indexers
  └─ MODIFIED: ipc-server.ts — register praxis.memory.* handlers + episodic stream

@praxis/client
  └─ MODIFIED: services/memory-client.ts — replace Phase 3 stub with real impl

scripts/
  └─ NEW: db-mastery.ts — CLI table dump

docs/
  ├─ MODIFIED: ROADMAP.md (Phase 7 description tightened)
  ├─ MODIFIED: CURRICULUM.md (BKT defaults note + active-path tools)
  └─ MODIFIED: CONTRACT.md (note that MemoryService is concrete in v1)
```

No Python in Phase 7.

---

## Implementation Units

### Unit 1: Type contract additions

**Files**:
- `packages/core/src/types/tool.ts` (modified — `ToolServices.memory` becomes concrete)
- `packages/core/src/types/memory.ts` (modified — add `MasterySignal`, `IndexerEvent`, `Indexer`, `IndexerContext`, `IndexerOrchestrator`)

```typescript
// packages/core/src/types/tool.ts — modification

export interface ToolServices {
  memory: MemoryService;          // ← Phase 7 (was: unknown)
  artifacts: ArtifactsService;    // Phase 6
  bootstrap: BootstrapService;    // Phase 6
  courseState: CourseStateReader; // Phase 6
  vectorStore: VectorStore;
  ftsStore: FtsStore;
  sandbox: CodeSandbox;
  sympy: SymPyService;
  embeddings: EmbeddingService;
  documents: DocumentsReader;
  /** ← Phase 7 NEW — used by active-path tools to schedule indexer re-runs after a tool-driven write. */
  indexerOrchestrator?: IndexerOrchestrator;
  pedagogyPack: unknown; // Phase 14
}
```

```typescript
// packages/core/src/types/memory.ts — additions

import type { ConceptId, EventId, SessionId, StudentId } from "./ids.js";
import type { Timestamp } from "./common.js";
import type { Logger } from "./common.js";
import type { EngineEvent } from "./engine.js";

// ─── Mastery update signals ──────────────────────────────────────────────────

export type MasterySignalKind =
  | "correct"
  | "incorrect"
  | "slip"            // student understood but made an arithmetic / typo / mechanical error
  | "hint_requested"  // student asked for help — not an error, but a sign of low confidence
  | "timeout"         // student stalled past productive-failure window
  | "exam_pass"       // exam-grade evidence
  | "exam_fail";

export interface MasterySignal {
  conceptId: ConceptId;
  kind: MasterySignalKind;
  /** Episodic event ID this signal was derived from. Empty array allowed for active-path tools that don't have a single source event. */
  evidenceEventIds: EventId[];
  /** Optional confidence weight (0..1). Defaults to 1. Phase 7.x LLM refinement uses this; deterministic indexer always emits 1. */
  confidence?: number;
}

// ─── Indexer port ────────────────────────────────────────────────────────────

export interface IndexerContext {
  studentId: StudentId;
  sessionId: SessionId;
  /** Episodic events the indexer should consider for this run. Filter / range owned by the orchestrator. */
  events: ReadonlyArray<{ id: EventId; turnIndex: number; ts: Timestamp; event: EngineEvent }>;
  log: Logger;
}

export interface Indexer {
  /** Stable id; used in logs and to scope debouncing per (sessionId, indexerId). */
  readonly id: string;
  /** When this indexer wants to run. */
  readonly schedule: "post-turn" | "session-end";
  /** Run the indexer over the given context. Throws are caught and logged by the orchestrator. */
  run(ctx: IndexerContext): Promise<void>;
}

// ─── Orchestrator ────────────────────────────────────────────────────────────

export interface IndexerOrchestrator {
  /**
   * Schedule a debounced post-turn indexer pass for the given session. Cancels
   * any pending pass for the same session before scheduling a new one.
   * Fire-and-forget — does not throw or return a promise the caller awaits.
   */
  scheduleAfterTurn(input: { studentId: StudentId; sessionId: SessionId }): void;

  /**
   * Run all session-end indexers synchronously for the given session. Awaits
   * completion. Used by SessionService.end() before the session row is closed.
   */
  runAtSessionEnd(input: { studentId: StudentId; sessionId: SessionId }): Promise<void>;

  /**
   * Cancel any pending debounce timer for the session (e.g., when ending the
   * session — runAtSessionEnd handles the work synchronously).
   */
  cancel(sessionId: SessionId): void;

  /** Test/observability: count active timers. */
  pendingCount(): number;
}
```

**Implementation notes**:
- `MasterySignal.kind` is a discriminated set (single source of truth — derived enum, not duplicated). Use `as const` registry pattern.
- `IndexerOrchestrator` is on `ServiceDeps` (so `SessionServiceImpl` can call it) and on `ToolServices` (so active-path tools can request a re-run). Optional on `ToolServices` to keep tests that don't wire it from breaking.
- The orchestrator reads events itself in production; the `events` field on `IndexerContext` is provided by the orchestrator just before calling `Indexer.run`. Tests can construct `IndexerContext` directly to call `run` without the orchestrator.

**Acceptance criteria**:
- [ ] `ToolServices.memory` is `MemoryService` (was `unknown`); existing tests still typecheck.
- [ ] `Indexer`, `IndexerContext`, `IndexerOrchestrator`, `MasterySignal` exported through `packages/core/src/types/index.ts`.
- [ ] `MasterySignalKind` enum is the single source of truth — no duplicates anywhere.

---

### Unit 2: BKT helper

**File**: `packages/core/src/services/memory/bkt.ts` (new)

```typescript
import type { MasterySignalKind } from "../../types/memory.js";

/**
 * Bayesian Knowledge Tracing (BKT) parameters.
 *
 *   pL0  — prior probability the student knows the skill before observation
 *   pT   — probability the student transitions from "not learned" to "learned"
 *          per opportunity
 *   pG   — guess probability: gets it right while not knowing
 *   pS   — slip probability: gets it wrong while knowing
 */
export interface BktParams {
  pL0: number;
  pT: number;
  pG: number;
  pS: number;
}

/** Conservative defaults; per-concept overrides deferred to Phase 14. */
export const DEFAULT_BKT: BktParams = { pL0: 0.1, pT: 0.1, pG: 0.2, pS: 0.1 };

export interface BktState {
  /** P(L_n) = probability the student knows the skill at observation n. */
  pKnown: number;
  /** Standard deviation of pKnown across the assumed Bernoulli posterior. */
  uncertainty: number;
}

/**
 * Apply one BKT update for an observation.
 *
 * `correct` corresponds to (skill applied successfully); `incorrect` to (skill
 * failed). Slips are observed-incorrect-with-high-prior; guesses are
 * observed-correct-with-low-prior. The posterior is computed using the standard
 * Corbett & Anderson (1995) update; transition is then applied.
 *
 * Pure function — no clamping beyond [0..1] math; no DB; no side effects.
 */
export function bktUpdate(
  state: BktState,
  signal: MasterySignalKind,
  params: BktParams = DEFAULT_BKT,
): BktState;

/**
 * Initial state from priors. `evidenceCount` defaults to 0; uncertainty = 0.5
 * (max). After at least one observation, uncertainty contracts.
 */
export function bktInitial(params: BktParams = DEFAULT_BKT): BktState;

/**
 * Translate a `MasterySignalKind` into the (correct?, weight) pair the BKT
 * update consumes. Slips are "incorrect with reduced weight"; hint requests
 * are "incorrect with reduced weight"; timeouts are "incorrect with reduced
 * weight"; exam_pass / exam_fail are correct/incorrect with weight 2 (twice
 * the impact of a single quiz response).
 */
export function signalToObservation(
  signal: MasterySignalKind,
): { correct: boolean; weight: number };
```

**Implementation notes**:
- The classic BKT update math (single observation):
  ```
  if observed correct:
      pKnownGivenObs = pKnown * (1 - pS) / (pKnown * (1 - pS) + (1 - pKnown) * pG)
  else:
      pKnownGivenObs = pKnown * pS / (pKnown * pS + (1 - pKnown) * (1 - pG))
  pKnownNext = pKnownGivenObs + (1 - pKnownGivenObs) * pT
  ```
  Apply the math `weight` times (or once with `weight * effective` step — simplest: apply once then scale toward `pKnownGivenObs` by `weight` for non-integer weights).
- `uncertainty` starts at 0.5 (= sqrt(0.25), max for a Bernoulli) and shrinks by `pKnown * (1 - pKnown)` after each observation.
- All numeric inputs/outputs are in `[0..1]`. Encode/decode happens at the schema boundary: schema stores `*_milli` (`Math.round(v * 1000)` write, `v / 1000` read).
- One pure function file; no imports beyond types.

**Acceptance criteria**:
- [ ] `bktUpdate(initial, "correct")` returns higher `pKnown` than `initial.pKnown`.
- [ ] `bktUpdate(initial, "incorrect")` returns lower `pKnown` than `initial.pKnown`.
- [ ] `bktUpdate(state, "slip")` returns `pKnown` strictly between `bktUpdate(state, "correct")` and `bktUpdate(state, "incorrect")`.
- [ ] `bktUpdate({pKnown: 1, uncertainty: 0}, "incorrect")` does not produce `pKnown < 0`.
- [ ] `bktUpdate({pKnown: 0, uncertainty: 0.5}, "correct")` does not produce `pKnown > 1`.
- [ ] After 5 consecutive `correct` signals, `pKnown >= 0.7` with default params (sanity).

---

### Unit 3: Decay helper

**File**: `packages/core/src/services/memory/decay.ts` (new)

```typescript
/**
 * Compute decay-aware effective mastery from a stored pKnown and the time
 * since last practice. Exponential decay: pKnown drops to ~37% after `decayDays`,
 * to ~14% after `2 * decayDays`, etc.
 *
 *   effectivePKnown = pKnown * exp(-elapsedDays / decayDays)
 *
 * `decayDays` typically comes from the active course's ThresholdConfig (default 14).
 */
export interface DecayInput {
  pKnown: number;
  lastPracticedAt?: number; // epoch ms; undefined => no decay applied (pristine state)
  now: number; // epoch ms
  decayDays: number;
}

export function applyDecay(input: DecayInput): number;

/** Same as applyDecay but takes a plain Date for now (test convenience). */
export function applyDecayAt(args: Omit<DecayInput, "now"> & { now: Date }): number;
```

**Implementation notes**:
- One pure function. No DB. No side effects.
- Returns `pKnown` unchanged when `lastPracticedAt` is undefined.
- Clamps `decayDays` to `>= 1` to avoid division-by-zero / negative-inf.
- Test edge cases: `elapsedDays = 0` → returns `pKnown` unchanged (within float tolerance); large elapsed days approaches 0 monotonically.

**Acceptance criteria**:
- [ ] `applyDecay({pKnown: 1, lastPracticedAt: now, now, decayDays: 14}) === 1`.
- [ ] `applyDecay({pKnown: 1, lastPracticedAt: now - 14*86400_000, now, decayDays: 14})` is approximately `1/e` (≈ 0.368).
- [ ] `applyDecay({pKnown: 0.5, lastPracticedAt: undefined, now, decayDays: 14}) === 0.5` (no decay without practice).
- [ ] Result is monotonically decreasing in `(now - lastPracticedAt)`.

---

### Unit 4: `MemoryServiceImpl` — reads + episodic stream + export + delete

**File**: `packages/core/src/services/memory/memory-service.ts` (new)

```typescript
import {
  affectiveSamples,
  episodicEvents,
  misconceptions,
  proceduralStrategies,
  studentMastery,
} from "@praxis/memory/schema";
import { and, asc, desc, eq, gte, isNull, lte } from "drizzle-orm";
import type { PraxisDb } from "../../db/index.js";
import type {
  AffectiveModel,
  ConceptId,
  ConceptMastery,
  EpisodicEvent,
  EventId,
  Logger,
  MemoryExport,
  MemoryService,
  Misconception,
  ProceduralModel,
  SessionId,
  StudentModel,
  TimeRange,
  Timestamp,
} from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { applyDecay } from "./decay.js";

export interface MemoryServiceDeps {
  db: PraxisDb;
  log: Logger;
  /** Resolves the decay constant for a concept at read time. Phase 7: returns the active course's `decayDays` if available; falls back to 14. */
  decayDaysFor: (conceptId: ConceptId) => number;
}

export class MemoryServiceImpl implements MemoryService {
  constructor(private readonly deps: MemoryServiceDeps) {}

  async studentModel(studentId: StudentId): Promise<StudentModel>;

  async misconceptions(studentId: StudentId): Promise<Misconception[]>;

  async procedural(studentId: StudentId): Promise<ProceduralModel>; // empty defaults in Phase 7

  async affective(studentId: StudentId): Promise<AffectiveModel>;   // empty defaults in Phase 7

  /** Stream episodic events; respects `redactedAt` (skip redacted). */
  async *episodic(opts: {
    studentId: StudentId;
    sessionId?: SessionId;
    range?: TimeRange;
  }): AsyncIterable<EpisodicEvent>;

  /** Full snapshot in MemoryExport format; serializes everything to JSON-safe shapes. */
  async export(studentId: StudentId): Promise<MemoryExport>;

  /**
   * Wipe projection tables for the student; mark all episodic events as
   * `redactedAt = now`. Does NOT delete the episodic rows themselves.
   * Re-running indexers on redacted events produces empty projections —
   * the SPEC commitment to "students own their memory" is respected.
   */
  async delete(opts: { studentId: StudentId; confirm: true }): Promise<void>;
}
```

**Implementation notes**:
- `decayDaysFor` is a closure injected by `buildServices` — typically `(conceptId) => readActiveCourseDecayDays(db, conceptId) ?? 14`. The service stays pure (no `ArtifactsService` dependency); the integration knows how to find the course.
- `studentModel(studentId)` reads `student_mastery`, applies `applyDecay` to each row, returns `{conceptMastery: Map<ConceptId, ConceptMastery>, lastUpdated}`.
- `episodic(...)` is async-iterable; uses Drizzle's `.iterator()` if available, else loads in batches of 1000. **Skips rows where `redactedAt IS NOT NULL`** unless an explicit `includeRedacted` option is added (don't add it in Phase 7).
- `export()` returns a single `MemoryExport` — drains the episodic iterator into an array. For very large transcripts, future iteration may stream via `praxis.memory.export.start` IPC; v1 ships single-payload.
- `delete()` runs in a single transaction: `delete from student_mastery` + `delete from misconceptions` + `delete from procedural_strategies` + `delete from affective_samples` + `update episodic_events set redactedAt = now`. The redaction is a single SQL UPDATE.
- `procedural()` and `affective()` return `{studentId, strategies: new Map(), ...}` and `{studentId, recent: [], baseline: {engagement: 0.5, frustration: 0.5, confidence: 0.5}}` respectively. No DB read; safe defaults.

**Acceptance criteria**:
- [ ] `studentModel(student)` returns a Map keyed by `ConceptId` with `effectivePKnown` reflecting decay against current time.
- [ ] After mastery rows are inserted, `studentModel` reflects them; rows with `lastPracticedAt = null` keep `effectivePKnown === pKnown`.
- [ ] `misconceptions(student)` returns rows with `status: "active"` first, then by `lastObservedAt desc`.
- [ ] `episodic({sessionId})` yields events in `(turnIndex asc, ts asc)` order.
- [ ] After `delete({confirm: true})`, all five projection tables are empty for that student; `episodic_events.redactedAt` is non-null for that student's rows; the rows themselves still exist.
- [ ] `export()` round-trips via `JSON.parse(JSON.stringify(...))` without losing typed shape (BigInts, Maps converted to plain JSON).

---

### Unit 5: `IndexerOrchestratorImpl` — debounce + run-at-end

**File**: `packages/core/src/services/indexers/orchestrator.ts` (new)

```typescript
import { episodicEvents } from "@praxis/memory/schema";
import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import type { PraxisDb } from "../../db/index.js";
import type {
  EngineEvent,
  EventId,
  Indexer,
  IndexerContext,
  IndexerOrchestrator,
  Logger,
  SessionId,
  StudentId,
  Timestamp,
} from "../../types/index.js";
import { brandId } from "../../types/index.js";

export interface IndexerOrchestratorDeps {
  db: PraxisDb;
  log: Logger;
  indexers: ReadonlyArray<Indexer>;
  /** Debounce for post-turn indexers in ms. Default 3000. */
  debounceMs?: number;
  /**
   * Maximum events to consider per indexer run. Default 100. Filters from the
   * end of the session backwards so the indexer always sees the most recent
   * activity. Limit prevents unbounded reads on long sessions.
   */
  maxEventsPerRun?: number;
}

export class IndexerOrchestratorImpl implements IndexerOrchestrator {
  private readonly timers = new Map<string, NodeJS.Timeout>();
  // sessionId → last-seen-turnIndex floor. Indexers see only events with turnIndex >= this floor on subsequent runs.
  // Reset to 0 on construction; updated after each successful run.
  private readonly turnFloors = new Map<string, number>();

  constructor(private readonly deps: IndexerOrchestratorDeps) {}

  scheduleAfterTurn(input: { studentId: StudentId; sessionId: SessionId }): void {
    this.cancel(input.sessionId);
    const debounce = this.deps.debounceMs ?? 3000;
    const timer = setTimeout(() => {
      this.timers.delete(input.sessionId);
      this.runScope("post-turn", input).catch((err) => {
        this.deps.log.warn("indexer.post_turn_failed", { error: String(err) });
      });
    }, debounce);
    timer.unref?.();
    this.timers.set(input.sessionId, timer);
  }

  async runAtSessionEnd(input: { studentId: StudentId; sessionId: SessionId }): Promise<void> {
    this.cancel(input.sessionId);
    // session-end indexers always see the full session range (no turnFloor).
    await this.runScope("session-end", input, /* fromFloor: */ false);
    // Also run any post-turn indexers one last time so we don't drop a final-turn signal.
    await this.runScope("post-turn", input, /* fromFloor: */ true);
  }

  cancel(sessionId: SessionId): void {
    const t = this.timers.get(sessionId);
    if (t) { clearTimeout(t); this.timers.delete(sessionId); }
  }

  pendingCount(): number {
    return this.timers.size;
  }

  /** Tear down all timers (called on host shutdown). */
  shutdown(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
  }

  private async runScope(
    schedule: "post-turn" | "session-end",
    input: { studentId: StudentId; sessionId: SessionId },
    fromFloor = true,
  ): Promise<void> {
    const indexers = this.deps.indexers.filter((i) => i.schedule === schedule);
    if (indexers.length === 0) return;

    const events = this.readEvents(input.sessionId, fromFloor ? this.turnFloors.get(input.sessionId) ?? 0 : 0);
    if (events.length === 0) return;

    const ctx: IndexerContext = { studentId: input.studentId, sessionId: input.sessionId, events, log: this.deps.log };

    // Run indexers in parallel; per-indexer failures isolated.
    await Promise.all(
      indexers.map(async (idx) => {
        try {
          await idx.run(ctx);
        } catch (err) {
          this.deps.log.warn(`indexer.${idx.id}.failed`, { error: String(err) });
        }
      }),
    );

    // Update turn floor — next post-turn run starts after the last seen turnIndex.
    if (schedule === "post-turn") {
      const lastTurn = events.at(-1)?.turnIndex ?? 0;
      this.turnFloors.set(input.sessionId, lastTurn + 1);
    }
  }

  private readEvents(sessionId: SessionId, fromTurn: number): IndexerContext["events"] {
    const max = this.deps.maxEventsPerRun ?? 100;
    const rows = this.deps.db
      .select()
      .from(episodicEvents)
      .where(
        and(
          eq(episodicEvents.sessionId, sessionId),
          gte(episodicEvents.turnIndex, fromTurn),
          isNull(episodicEvents.redactedAt),
        ),
      )
      .orderBy(asc(episodicEvents.turnIndex), asc(episodicEvents.ts))
      .limit(max)
      .all();
    return rows.map((r) => ({
      id: brandId<"EventId">(r.id),
      turnIndex: r.turnIndex,
      ts: r.ts.getTime() as Timestamp,
      event: r.eventJson as EngineEvent,
    }));
  }
}
```

**Implementation notes**:
- Per-session debounce: the timer for sessionId `S` is keyed on `S`. Scheduling a new run while a timer is pending **cancels and replaces**, so rapid-fire turns produce one indexer run after activity settles.
- `unref()` is called so timers don't keep the process alive (per the Node `setTimeout` `unref` pattern). On Electron main, this is critical — otherwise the app won't quit.
- `turnFloor` tracking ensures incremental indexing: after a post-turn run, the next run starts at `lastTurn + 1`, so indexers don't re-process events they've already seen. Session-end indexers always see the full session.
- `runAtSessionEnd` runs session-end indexers first, then post-turn indexers once more — this catches any signal from the final turn that the debounce missed.
- Failures in one indexer don't propagate to others. Logged at `warn`. Episodic is unchanged so re-running is safe.

**Acceptance criteria**:
- [ ] Two `scheduleAfterTurn` calls within `debounceMs` produce **one** indexer run.
- [ ] Two `scheduleAfterTurn` calls separated by `2 * debounceMs` produce **two** indexer runs.
- [ ] `cancel(sessionId)` clears the pending timer; `pendingCount()` reflects 0.
- [ ] An indexer that throws inside `run` does not prevent other indexers from running.
- [ ] After `runAtSessionEnd`, both `"session-end"` and `"post-turn"` indexers have run.
- [ ] `turnFloor` increments correctly: post-turn runs see only events from `lastSeenTurn + 1` onwards.

---

### Unit 6: `MasteryIndexer` (deterministic)

**File**: `packages/core/src/services/indexers/mastery-indexer.ts` (new)

```typescript
import { studentMastery } from "@praxis/memory/schema";
import { and, eq } from "drizzle-orm";
import type { PraxisDb } from "../../db/index.js";
import type {
  ArtifactsService,
  ConceptId,
  CourseStateReader,
  EngineEvent,
  EventId,
  Indexer,
  IndexerContext,
  Logger,
  MasterySignal,
  MasterySignalKind,
  StudentId,
  Timestamp,
  ToolResult,
} from "../../types/index.js";
import { bktInitial, bktUpdate, type BktState } from "../memory/bkt.js";

export interface MasteryIndexerDeps {
  db: PraxisDb;
  log: Logger;
  /** Reads the active course's current concept(s) for attribution. */
  courseStateReader: CourseStateReader;
  /** Reads sessions to find the courseId; injected so the indexer doesn't import the schema directly across packages. */
  sessionCourseId: (sessionId: string) => string | null;
}

export class MasteryIndexer implements Indexer {
  readonly id = "mastery";
  readonly schedule = "post-turn" as const;
  constructor(private readonly deps: MasteryIndexerDeps) {}

  async run(ctx: IndexerContext): Promise<void> {
    const signals = this.extractSignals(ctx);
    if (signals.length === 0) return;

    // Group signals by concept; apply BKT updates serially per concept.
    const grouped = new Map<ConceptId, MasterySignal[]>();
    for (const s of signals) {
      const arr = grouped.get(s.conceptId) ?? [];
      arr.push(s);
      grouped.set(s.conceptId, arr);
    }

    for (const [conceptId, conceptSignals] of grouped) {
      this.applySignalsToConcept(ctx.studentId, conceptId, conceptSignals);
    }
  }

  /**
   * Walk the events, identifying mastery signals.
   *
   * Recognized patterns (in order of precedence; an event matches at most one):
   *
   *   1. tool_result for `update_mastery` (active path, explicit attribution)
   *      → one signal with the `kind` and `conceptId` from the tool args.
   *
   *   2. tool_result for `course.mark_studied` with lessonComplete=true OR false
   *      → one `correct` signal attributed to the conceptId.
   *
   *   3. tool_result for `grade_math` { ok: true, value.correct: false }
   *      → one `incorrect` signal attributed to the session's current concept(s).
   *      tool_result for `grade_math` { ok: true, value.correct: true }
   *      → one `correct` signal attributed to the session's current concept(s).
   *
   *   4. tool_result for `code_sandbox` with stderr non-empty + exitCode != 0
   *      → one `incorrect` signal (treated as a coding miss); stderr empty + exitCode 0
   *      → one `correct` signal. (Phase 7 conservative; refine in Phase 14.)
   *
   *   5. Anything else → no signal.
   *
   * `evidenceEventIds` is set to the original event id.
   */
  private extractSignals(ctx: IndexerContext): MasterySignal[] {
    // Implementation: walk ctx.events; pattern-match tool_call → tool_result pairs by callId;
    // when a recognized tool returns, emit signals; attribute by reading current concept via courseStateReader.
    // ...full implementation specified in tests Unit 11.
    return []; // placeholder for design doc
  }

  private applySignalsToConcept(
    studentId: StudentId,
    conceptId: ConceptId,
    signals: MasterySignal[],
  ): void {
    // 1. Read existing row (or initialize).
    // 2. Fold signals via bktUpdate, each contributing one observation.
    // 3. Upsert mastery row with new state, lastPracticedAt = now, evidence appended (capped at 50 most recent IDs).
    // 4. millify pKnown and uncertainty before write.
  }
}
```

**Implementation notes**:
- The indexer is **stateless across runs**; persistent state lives in `student_mastery`. Two runs over the same events produce the same final state because BKT updates are commutative within a turn (we apply in event order; ties broken by event ts).
- Concept attribution rules (in `extractSignals`):
  1. Active-path tool result has a `conceptId` argument — use it directly.
  2. If `course.mark_studied(conceptId)` was the call, attribute to that conceptId.
  3. Otherwise, look up the active session's current concept via `courseStateReader.read({studentId, courseId})`. If `currentConcept` exists, attribute to it. If not, **conservative skip** — log at debug, no signal.
- **Evidence cap**: the `evidenceJson` column is `EventId[]`; we keep the last 50 contributing event IDs to bound row size.
- **Idempotency**: re-running over the same events is safe because the indexer always reads the current `student_mastery` row and applies the new signals on top. Old signals already folded in are not re-applied (the `turnFloor` mechanism in the orchestrator prevents this).
- **Upsert pattern**: `onConflictDoUpdate` keyed on `(studentId, conceptId)`. See `.claude/skills/patterns/config-kv-store.md`.
- The full pattern-matching logic for `extractSignals` is intentionally a single switch / chain in the implementation file (not split into helper classes) — easier to read end-to-end, easier to extend in Phase 14.

**Acceptance criteria**:
- [ ] An event sequence with one `grade_math` correct produces one `correct` signal attributed to the session's current concept; `student_mastery.pKnown` increases.
- [ ] An event sequence with one `grade_math` incorrect produces one `incorrect` signal; `pKnown` decreases.
- [ ] An `update_mastery({conceptId: "C", kind: "slip"})` tool result produces one `slip` signal attributed to `C`, regardless of session current concept.
- [ ] `course.mark_studied({conceptId})` produces one `correct` signal attributed to the marked concept.
- [ ] Event with no recognizable signal produces no DB write (mastery row unchanged).
- [ ] When the session has no current concept and no active-path attribution, no signal is emitted (logged at debug).
- [ ] The same indexer run twice over the same events produces the same final mastery state.
- [ ] `evidenceJson` keeps at most 50 event IDs (FIFO truncation).

---

### Unit 7: `MisconceptionIndexer` (agent-driven)

**File**: `packages/core/src/services/indexers/misconception-indexer.ts` (new)

```typescript
import { runOneShot } from "@praxis/engines";
import { misconceptions } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { z } from "zod";
import type { PraxisDb } from "../../db/index.js";
import type {
  CourseStateReader,
  Engine,
  EngineEvent,
  Indexer,
  IndexerContext,
  Logger,
  Misconception,
  StudentId,
} from "../../types/index.js";
import { brandId } from "../../types/index.js";
import { MISCONCEPTION_SYSTEM_PROMPT } from "./misconception-prompt.js";

export interface MisconceptionIndexerDeps {
  db: PraxisDb;
  log: Logger;
  /** Resolves the active engine for the one-shot session. */
  engineResolver: () => Engine;
  /** Reads the session's courseId so the indexer can scope concept candidates. */
  sessionCourseId: (sessionId: string) => string | null;
  courseStateReader: CourseStateReader;
}

export class MisconceptionIndexer implements Indexer {
  readonly id = "misconception";
  readonly schedule = "session-end" as const;
  constructor(private readonly deps: MisconceptionIndexerDeps) {}

  async run(ctx: IndexerContext): Promise<void> {
    if (ctx.events.length < 2) return; // skip empty / 1-event sessions

    const courseId = this.deps.sessionCourseId(ctx.sessionId);
    if (!courseId) return; // misconceptions need a concept graph for attribution

    const snapshot = await this.deps.courseStateReader.read({
      studentId: ctx.studentId,
      courseId: brandId<"CourseId">(courseId),
    });
    if (!snapshot) return;

    const conceptCatalog = [...snapshot.conceptsById.values()].map((c) => ({
      id: c.conceptId,
      name: c.name,
    }));
    if (conceptCatalog.length === 0) return;

    const userMessage = buildPrompt(ctx, conceptCatalog);

    const events = runOneShot(
      this.deps.engineResolver(),
      {
        systemPrompt: MISCONCEPTION_SYSTEM_PROMPT,
        tools: { list: () => [], dispatch: noopDispatch },
        maxSteps: 1,
      },
      userMessage,
    );

    let assistantText = "";
    for await (const ev of events) {
      if (ev.type === "model_message") assistantText += ev.content;
      if (ev.type === "error") {
        this.deps.log.warn("misconception.engine_error", { error: ev.error.message });
        return;
      }
    }

    const parsed = parseMisconceptionOutput(assistantText, conceptCatalog);
    if (!parsed) return;
    if (parsed.length === 0) return;

    // Merge: dedupe by (studentId, conceptId, errorForm).
    for (const m of parsed) {
      this.upsertMisconception(ctx.studentId, m);
    }
  }

  private upsertMisconception(studentId: StudentId, m: ParsedMisconception): void {
    // Look for existing row by (studentId, conceptId, errorForm).
    // If found: union evidence event IDs; update lastObservedAt.
    // Else: insert new row with status="active", firstObservedAt=lastObservedAt=now.
  }
}

interface ParsedMisconception {
  conceptId: string;
  description: string;
  errorForm: string;
  remediation: { strategyId: string; rationale: string };
  evidenceEventIds: string[];
}

const MisconceptionListSchema = z.array(
  z.object({
    conceptId: z.string(),
    description: z.string().min(1),
    errorForm: z.string().min(1),
    remediation: z.object({
      strategyId: z.string(),
      rationale: z.string(),
    }),
    evidenceEventIds: z.array(z.string()),
  }),
);

function parseMisconceptionOutput(
  text: string,
  conceptCatalog: ReadonlyArray<{ id: string; name: string }>,
): ParsedMisconception[] | null;

function buildPrompt(
  ctx: IndexerContext,
  conceptCatalog: ReadonlyArray<{ id: string; name: string }>,
): string;

async function noopDispatch(): Promise<{ ok: false; error: { code: string; message: string; recoverable: boolean } }> {
  return {
    ok: false,
    error: { code: "no_tools", message: "indexer has no tools", recoverable: false },
  };
}
```

```typescript
// packages/core/src/services/indexers/misconception-prompt.ts

export const MISCONCEPTION_SYSTEM_PROMPT = `You are a learning-science analyst. Read a tutoring-session transcript and identify any *misconceptions* the student demonstrated — wrong mental models, not just wrong answers.

A misconception is a stable pattern, not a one-off slip. Look for:
- Conflated concepts (e.g., treating an inequality as an equality after dividing by a negative)
- Procedural errors that betray a structural misunderstanding (e.g., adding instead of multiplying when distributing)
- Misuse of vocabulary (e.g., "function" used for any equation)

Output a single JSON array (in a \`\`\`json fence). Each entry:

{
  "conceptId": "<from the provided catalog — exact match required>",
  "description": "<one sentence describing the misconception>",
  "errorForm": "<short structured tag, e.g. 'inequality-as-equality-after-negative-divide'>",
  "remediation": {
    "strategyId": "<one of: worked-examples, socratic, elaborative-interrogation, analogy-bridging, productive-failure-gauntlet>",
    "rationale": "<why this strategy fits this misconception>"
  },
  "evidenceEventIds": ["<event id from the transcript that demonstrated the misconception>", "..."]
}

Rules:
- Only return misconceptions backed by at least one transcript event. Cite the event id(s).
- Be conservative: a single wrong answer is rarely a misconception. Look for pattern across multiple events.
- If no misconceptions are evident, return an empty JSON array: []
- Use exactly the conceptIds from the provided concept catalog.
- Do not include any prose outside the JSON fence.`;
```

**Implementation notes**:
- The full session transcript (filtered to `model_message`, `user_message`, `tool_call`, `tool_result`) becomes the user message. Evidence event IDs are the episodic event IDs the indexer received. Truncate transcript at ~25k tokens worth (long sessions are rare; truncate from the start to keep the most recent events).
- Concept catalog is the active course's concept names + IDs. The agent must use exact ID strings from the catalog (validated post-parse — entries with unknown conceptId are dropped with a `warn` log).
- Dedup by `(studentId, conceptId, errorForm)`. New evidence event IDs are unioned (capped at 50 IDs per misconception).
- A `ParsedMisconception` with no `evidenceEventIds` is dropped — every misconception must be grounded.
- Remediation `strategyId` is a single source of truth (same registry as `bootstrapMode`'s extractor prompt). Future Phase 14 may refine; entries with unknown strategy fall back to `worked-examples` with a `warn`.

**Acceptance criteria**:
- [ ] Run with empty events returns immediately; no DB write.
- [ ] Run with 5 events containing a clear conceptual error inserts a misconception row attributed to the right conceptId.
- [ ] Re-running on the same session produces no duplicate row (dedup by errorForm).
- [ ] Re-running on a session with a new event matching the same errorForm appends the new event id to evidence; `lastObservedAt` updates.
- [ ] Misconception with unknown conceptId (not in catalog) is dropped silently; `warn` log emitted.
- [ ] Engine error during the call aborts the run gracefully (no row writes).

---

### Unit 8: Active-path tools

**Files**:
- `packages/tools/src/memory/update-mastery.ts` (new)
- `packages/tools/src/memory/record-misconception.ts` (new)
- `packages/tools/src/memory/index.ts` (new — `MEMORY_TOOLS`)

```typescript
// packages/tools/src/memory/update-mastery.ts

import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  conceptId: z.string(),
  signal: z.enum(["correct", "incorrect", "slip", "hint_requested", "timeout", "exam_pass", "exam_fail"]),
  evidenceEventId: z.string().optional(),
  /** Optional 0..1; defaults to 1. Used by Phase 7.x LLM refinement. Phase 7 deterministic agent should leave undefined. */
  confidence: z.number().min(0).max(1).optional(),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  conceptId: z.string(),
  newPKnown: z.number().min(0).max(1),
  /** Effective decay-aware mastery at the moment of this update (lastPracticedAt = now ⇒ no decay). */
  newEffectivePKnown: z.number().min(0).max(1),
});

export const updateMasteryTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "update_mastery",
  description:
    "Record an explicit mastery signal for a concept. Use this when you've judged a moment that the deterministic indexer might miss or misclassify — for example, a wrong arithmetic result that was clearly a slip rather than a missing concept ('signal: slip'), or a long pause before the student attempted ('signal: timeout'). Pass the episodic eventId you're attributing the signal to so the evidence is traceable.",
  input: InputSchema,
  output: OutputSchema,
  tier: "deterministic",
  effects: ["memory.write"],
  async handler(args, ctx: ToolContext) {
    // Apply BKT update for the (studentId, conceptId) row directly.
    // Reuse the same code path as MasteryIndexer.applySignalsToConcept (factored into a shared helper).
    // Returns the new pKnown / effectivePKnown.
  },
};
```

```typescript
// packages/tools/src/memory/record-misconception.ts

const InputSchema = z.object({
  conceptId: z.string(),
  description: z.string().min(1),
  errorForm: z.string().min(1),
  remediation: z.object({
    strategyId: z.string(),
    rationale: z.string(),
  }),
  evidenceEventIds: z.array(z.string()).min(1),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  misconceptionId: z.string(),
  /** True when an existing entry was merged (dedupe by errorForm); false when a new row was inserted. */
  merged: z.boolean(),
});

export const recordMisconceptionTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "record_misconception",
  description:
    "Record a misconception you've observed in the student's responses. Pass the conceptId from the active course, a short description, a structured errorForm tag (e.g. 'inequality-as-equality-after-negative-divide'), a remediation strategy, and at least one evidence event id from the conversation. Use this when you see a stable pattern, not for one-off slips.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["memory.write"],
  async handler(args, ctx: ToolContext) {
    // Upsert misconception row using same dedup logic as MisconceptionIndexer.
    // Reuse shared helper.
  },
};
```

```typescript
// packages/tools/src/memory/index.ts

export { updateMasteryTool } from "./update-mastery.js";
export { recordMisconceptionTool } from "./record-misconception.js";

import { recordMisconceptionTool } from "./record-misconception.js";
import { updateMasteryTool } from "./update-mastery.js";

export const MEMORY_TOOLS = [updateMasteryTool, recordMisconceptionTool] as const;
```

**Implementation notes**:
- The `applySignalsToConcept` helper in `mastery-indexer.ts` is exported (lives in a shared `memory-helpers.ts` if it gets large) so `update_mastery` reuses the same BKT-application path. Single source of truth for BKT writes — both passive (indexer) and active (tool) call the same function.
- Same for `upsertMisconception` — exported from `misconception-indexer.ts` (or moved to a shared helper) and called by `record_misconception`.
- Tools are registered in `teach` mode's `toolNames` (Unit 9). `bootstrap` mode does not include them.
- The `conceptId` argument is a string (not branded) on the input schema; the handler brands inside.

**Acceptance criteria**:
- [ ] `update_mastery({conceptId, signal: "correct"})` increases `student_mastery.pKnown`.
- [ ] `update_mastery` returns the new `pKnown` and `effectivePKnown` correctly.
- [ ] `update_mastery` followed by the deterministic indexer over the same range does **not** double-apply the signal (the indexer skips events whose tool name is `update_mastery` because it already wrote the BKT update — the indexer recognizes the tool's `tool_result` event and treats the row as already updated).
- [ ] `record_misconception` upserts a row; calling twice with the same `errorForm` merges evidence; calling with new `errorForm` creates a new row.
- [ ] Both tools fail loudly with descriptive errors when invoked outside a course-aware session (no `courseId` resolvable).

---

### Unit 9: `teach` mode update

**Files**:
- `packages/curriculum/src/modes/teach.ts` (modified)
- `packages/curriculum/src/modes/fragments/tools.ts` (modified — extend template)

```typescript
// packages/curriculum/src/modes/teach.ts (modified)

export const teachMode: Mode = {
  id: "teach",
  label: "Teach",
  description:
    "Interactive lecture mode: introduce concepts, scaffold worked examples, fade to independent practice.",
  requiredRole: "student",
  promptFragments: [
    preambleFragment,
    roleFragment,
    principlesFragment,
    toolsFragment,                  // updated below
    courseContextFragmentDefault,
    constraintsFragment,
    postambleFragment,
  ],
  toolNames: [
    "grade_math",
    "code_sandbox",
    "retrieve_from_textbook",
    "course.what_can_i_teach",
    "course.start_lesson",
    "course.current_concept",
    "course.mark_studied",
    "update_mastery",            // ← Phase 7
    "record_misconception",      // ← Phase 7
  ],
  uiSurface: "chat",
};
```

```typescript
// packages/curriculum/src/modes/fragments/tools.ts (modified — append memory tool docs)

export const toolsFragment: PromptFragment = {
  id: "tools.available",
  position: "tools",
  customizable: false,
  template: `Tools available:
- grade_math — symbolic math via sympy. Use for ANY arithmetic or algebra; never grade with your own arithmetic.
- code_sandbox — run JavaScript or Python in a sandbox.
- retrieve_from_textbook — hybrid (semantic + lexical) search of the student's uploaded textbooks. Filters: documentIds, sectionPattern, pageRange.
- course.what_can_i_teach — orient yourself: returns the active course's current lesson and the next concept to study.
- course.start_lesson — mark a lesson as in-progress when the student begins it.
- course.current_concept — fetch the next un-studied concept of the current lesson.
- course.mark_studied — record that the student has covered a concept; pass evidenceEventId when you can.
- update_mastery — record an explicit mastery signal for a concept. Use this when the automatic indexer might misclassify a moment, e.g. when a wrong answer was clearly a slip ('signal: slip') or the student stalled past the productive-failure window ('signal: timeout'). The deterministic indexer covers the obvious cases; you cover the judgment cases.
- record_misconception — record a misconception you've observed in the student's responses. Pass at least one evidence event id. Use for stable patterns, not one-off slips. Misconceptions also surface from a session-end indexer; you don't have to call this on every wrong answer.

When you cite from retrieve_from_textbook results, refer to them as [1], [2], [3]. When you make a claim a tool can verify, call the tool. The student sees the tool call — visibility is part of the lesson.`,
};
```

**Acceptance criteria**:
- [ ] `teachMode.toolNames` contains `update_mastery` and `record_misconception`.
- [ ] System prompt for a teach session includes the new tool descriptions.
- [ ] `bootstrap` mode does NOT include the memory tools (verified via `bootstrapMode.toolNames`).

---

### Unit 10: Course-context fragment update — graduated mastery

**File**: `packages/curriculum/src/brief/course-context.ts` (modified)

```typescript
import type { CourseStateSnapshot, PromptFragment } from "@praxis/core/types";

export interface ComposeCourseContextInput {
  snapshot: CourseStateSnapshot;
  /**
   * Map of conceptId → effective decay-aware pKnown. Optional; when absent
   * (e.g., bootstrap mode session), studied/not-studied tags from the snapshot
   * are used instead.
   */
  masteryByConceptId?: ReadonlyMap<string, number>;
}

export function composeCourseContextFragment(input: ComposeCourseContextInput): PromptFragment {
  const { snapshot, masteryByConceptId } = input;
  const lines: string[] = [];
  lines.push(`Active course: ${snapshot.course.title} (${snapshot.course.subject}, ${snapshot.course.gradeLevel})`);

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
        const loc = r.locator?.page ? ` (p.${r.locator.page})` : r.locator?.section ? ` [${r.locator.section}]` : "";
        lines.push(`  • ${r.kind}: ${r.source}${loc}`);
      }
    }
    lines.push(`Suggested strategy: ${snapshot.currentLesson.suggestedStrategy}`);
  } else {
    lines.push(`This course has no in-progress lesson; all lessons are completed or none have been started.`);
  }
  return {
    id: "context.course-state",
    position: "context",
    customizable: true,
    template: lines.join("\n"),
  };
}

/**
 * Render a per-concept tag.
 *  - mastery >= 0.8 → "mastered (0.85)"
 *  - mastery >= 0.5 → "in progress (0.62)"
 *  - mastery >  0   → "starting (0.25)"
 *  - mastery == 0 / undefined / studied false → "not yet started"
 *  - mastery undefined but studied true → "studied" (Phase 6 fallback)
 */
function formatMasteryTag(mastery: number | undefined, studied: boolean): string {
  if (mastery === undefined) return studied ? "studied" : "not yet started";
  if (mastery >= 0.8) return `mastered (${mastery.toFixed(2)})`;
  if (mastery >= 0.5) return `in progress (${mastery.toFixed(2)})`;
  if (mastery > 0) return `starting (${mastery.toFixed(2)})`;
  return studied ? "studied" : "not yet started";
}
```

`SessionServiceImpl.openActive` is updated to read mastery via `MemoryService.studentModel(studentId)` filtered to the snapshot's concept IDs, build the `masteryByConceptId` map, and pass it to `composeCourseContextFragment`.

**Implementation notes**:
- Mastery is loaded once at session-open. If mastery changes mid-session via active-path tools, the *next* session's brief reflects it. Mid-session re-composition is deliberately not done — the system prompt is fixed for the engine session's lifetime per the engine-session-lifecycle pattern. Future iteration: per-turn dynamic context injected as a user-message preface (Phase 9 territory).
- The fragment id stays `context.course-state` so the existing `customizable: true` override mechanism (Phase 6) keeps working.

**Acceptance criteria**:
- [ ] When mastery is 0.85 for a concept, the system prompt contains `"• <name> — mastered (0.85)"`.
- [ ] When mastery is undefined but `studied` is true, the system prompt contains `"• <name> — studied"`.
- [ ] When a teach session opens with no mastery rows, behavior matches Phase 6 (studied/not yet studied tags).

---

### Unit 11: SessionService integration — schedule indexers

**File**: `packages/core/src/services/session-service.ts` (modified)

```typescript
// In SessionServiceImpl.send, after the for-await event loop, add:

// Schedule post-turn indexer pass (debounced).
this.deps.indexerOrchestrator?.scheduleAfterTurn({
  studentId: brandId<"StudentId">(sessionRow.studentId),
  sessionId: brandId<"SessionId">(sessionId),
});

// In SessionServiceImpl.end, before setting endedAt:

await this.deps.indexerOrchestrator?.runAtSessionEnd({
  studentId: brandId<"StudentId">(/* read from sessions row */),
  sessionId,
});
this.deps.indexerOrchestrator?.cancel(sessionId);
```

`ServiceDeps` adds `indexerOrchestrator?: IndexerOrchestrator` (optional so existing tests with no orchestrator still work).

`shutdown()` on `SessionServiceImpl` also calls `indexerOrchestrator?.shutdown()` to clear timers.

**Implementation notes**:
- Optional dep means: Phase-3 tests that don't wire indexers continue to work; only the desktop wiring in Phase 7 plumbs the orchestrator through.
- Scheduling is fire-and-forget. The streaming response to the UI completes before the indexer runs. This is the right ordering — the user sees their response immediately; mastery updates land 3 seconds later.
- `runAtSessionEnd` is awaited so misconceptions are visible by the time the UI navigates away.

**Acceptance criteria**:
- [ ] After a `send` completes, `indexerOrchestrator.pendingCount()` is 1 (timer scheduled) for the session.
- [ ] After `end()`, `indexerOrchestrator.pendingCount()` returns to 0 and session-end indexers have run.
- [ ] Tests without an orchestrator still pass (the optional dep is safely skipped).

---

### Unit 12: `ServiceDeps` + `buildServices` wiring

**Files**:
- `packages/core/src/services/types.ts` (modified)
- `packages/desktop/electron/main/services.ts` (modified)

```typescript
// packages/core/src/services/types.ts — modification

export interface ServiceDeps {
  db: PraxisDb;
  log: Logger;
  modes: ReadonlyMap<string, Mode>;
  toolDefinitions: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
  toolServices: { /* existing fields */ memory: MemoryService; /* … */ };
  /** ← Phase 7 NEW. Optional so older tests keep working. */
  indexerOrchestrator?: IndexerOrchestrator;
  engineFactory?: (config: EngineConfig, deps: { log: Logger }) => Engine;
}
```

```typescript
// packages/desktop/electron/main/services.ts — additions inside buildServices

import { MasteryIndexer, MemoryServiceImpl, MisconceptionIndexer, IndexerOrchestratorImpl } from "@praxis/core/services";
import { MEMORY_TOOLS } from "@praxis/tools/memory";

// (after artifactsService and bootstrapService:)

const memoryService = new MemoryServiceImpl({
  db,
  log,
  decayDaysFor: (conceptId) => readActiveCourseDecayDaysForConcept(db, conceptId),
});

const sessionCourseId = (sessionId: string) => readSessionCourseId(db, sessionId);

const masteryIndexer = new MasteryIndexer({
  db,
  log,
  courseStateReader: artifactsService,
  sessionCourseId,
});

const misconceptionIndexer = new MisconceptionIndexer({
  db,
  log,
  engineResolver,
  courseStateReader: artifactsService,
  sessionCourseId,
});

const indexerOrchestrator = new IndexerOrchestratorImpl({
  db,
  log,
  indexers: [masteryIndexer, misconceptionIndexer],
});

// modes / tools:
const toolDefinitions = [
  gradeMathTool,
  codeSandboxTool,
  retrieveFromTextbookTool,
  ...COURSE_TOOLS,
  ...MEMORY_TOOLS, // ← Phase 7
];

const deps: ServiceDeps = {
  db,
  log,
  modes,
  toolDefinitions,
  indexerOrchestrator,
  toolServices: {
    sympy,
    sandbox,
    vectorStore,
    ftsStore,
    embeddings,
    documents: documentsReader,
    artifacts: artifactsService,
    bootstrap: bootstrapService,
    courseState: artifactsService,
    memory: memoryService, // ← Phase 7
    indexerOrchestrator,    // ← optional pass-through to active-path tools
  },
};

// SessionServiceImpl now receives the orchestrator (already shown above).
```

`readActiveCourseDecayDaysForConcept` and `readSessionCourseId` are small new helpers in `packages/core/src/services/memory/helpers.ts` — single SQL queries each.

**Acceptance criteria**:
- [ ] `buildServices(dbPath)` returns the same `Services` shape with the new fields.
- [ ] Memory IPC handlers (Unit 13) can call `services.memory.studentModel(studentId)` and get a real result.
- [ ] First-run boot still works against an empty DB (no mastery rows → empty `StudentModel.conceptMastery`).

---

### Unit 13: `praxis.memory.*` IPC + `MemoryClient` real impl

**Files**:
- `packages/desktop/electron/main/ipc-server.ts` (modified — add memory handlers)
- `packages/client/src/services/memory-client.ts` (modified — replace stub)

IPC channels (read-only + delete; episodic uses streaming convention):

```
praxis.memory.studentModel              -> StudentModel
praxis.memory.misconceptions            -> Misconception[]
praxis.memory.procedural                -> ProceduralModel
praxis.memory.affective                 -> AffectiveModel
praxis.memory.export                    -> MemoryExport
praxis.memory.delete                    -> { confirm: true }

praxis.memory.episodic.start            -> streamId
praxis.memory.episodic.events.<streamId>
praxis.memory.episodic.cancel
```

The episodic stream follows the existing streaming convention from `ipc-channel-convention.md` — same shape as `praxis.session.send.*` and `praxis.ingest.*`.

```typescript
// packages/client/src/services/memory-client.ts — real impl

import type { /* … */ } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = {
  studentModel: "praxis.memory.studentModel",
  misconceptions: "praxis.memory.misconceptions",
  procedural: "praxis.memory.procedural",
  affective: "praxis.memory.affective",
  export: "praxis.memory.export",
  delete: "praxis.memory.delete",
  episodicStart: "praxis.memory.episodic",
} as const;

export class MemoryClient implements MemoryService {
  constructor(private readonly transport: ClientTransport) {}

  studentModel(): Promise<StudentModel> {
    return this.transport.invoke<StudentModel>(C.studentModel);
  }

  misconceptions(): Promise<Misconception[]> {
    return this.transport.invoke<Misconception[]>(C.misconceptions);
  }

  procedural(): Promise<ProceduralModel> {
    return this.transport.invoke<ProceduralModel>(C.procedural);
  }

  affective(): Promise<AffectiveModel> {
    return this.transport.invoke<AffectiveModel>(C.affective);
  }

  episodic(opts: { sessionId?: SessionId; range?: TimeRange }): AsyncIterable<EpisodicEvent> {
    return this.transport.stream<EpisodicEvent>(C.episodicStart, opts);
  }

  export(): Promise<MemoryExport> {
    return this.transport.invoke<MemoryExport>(C.export);
  }

  delete(opts: { confirm: true }): Promise<void> {
    return this.transport.invoke<void>(C.delete, opts);
  }
}
```

`packages/client/src/client.ts` is updated to pass `transport` to `new MemoryClient(transport)`.

**Implementation notes**:
- `studentModel` returns a `Map<ConceptId, ConceptMastery>` over IPC. Maps don't survive `JSON.stringify` — the IPC layer serializes as `[ConceptId, ConceptMastery][]` (entries array) and the client reconstructs the Map. Implement on both sides; pattern lives at the boundary, not in the service.
- `procedural` and `affective` return defaults (Phase 14 fills in writes). The IPC handler is wired now so the client surface stays stable.
- `delete()` requires `confirm: true` per the contract; UI invocation will pass it explicitly.

**Acceptance criteria**:
- [ ] `client.memory.studentModel()` returns a populated `StudentModel` with `Map<ConceptId, ConceptMastery>` after a few teach sessions.
- [ ] `client.memory.episodic({sessionId})` yields events in turn order via the stream channel.
- [ ] `client.memory.export()` returns a `MemoryExport` whose JSON-serialized form round-trips losslessly (Maps → entries → Maps).
- [ ] `client.memory.delete({confirm: true})` empties the projection tables and marks `redactedAt`; subsequent `studentModel()` returns an empty Map.

---

### Unit 14: `pnpm db:mastery` script

**File**: `scripts/db-mastery.ts` (new)

```typescript
import { openDb } from "@praxis/core/db";
import { studentMastery } from "@praxis/memory/schema";
import { concepts } from "@praxis/curriculum/schema";
import { applyDecay } from "@praxis/core/services/memory";
import { eq } from "drizzle-orm";

const { db } = openDb({ readonly: true });
const rows = db.select().from(studentMastery).all();
const conceptNames = new Map(
  db.select({ id: concepts.id, name: concepts.name }).from(concepts).all().map((c) => [c.id, c.name]),
);

const now = Date.now();
const formatted = rows.map((r) => {
  const pKnown = r.pKnown / 1000;
  const uncertainty = r.uncertainty / 1000;
  const decayDays = 14; // global default; per-course lookup omitted in script
  const eff = applyDecay({
    pKnown,
    lastPracticedAt: r.lastPracticedAt?.getTime(),
    now,
    decayDays,
  });
  return {
    student: r.studentId,
    concept: conceptNames.get(r.conceptId) ?? r.conceptId,
    pKnown: pKnown.toFixed(3),
    eff: eff.toFixed(3),
    uncertainty: uncertainty.toFixed(3),
    last: r.lastPracticedAt?.toISOString() ?? "—",
    evidenceCount: Array.isArray(r.evidenceJson) ? r.evidenceJson.length : 0,
  };
});

console.table(formatted);
```

Add `scripts.db:mastery` entry in root `package.json`: `"db:mastery": "tsx scripts/db-mastery.ts"`.

**Acceptance criteria**:
- [ ] `pnpm db:mastery` runs without error on a fresh DB and prints an empty table.
- [ ] After a multi-turn session with deliberate wrong + right answers, `pnpm db:mastery` shows updated rows with effective decay applied.
- [ ] The output includes concept *names* (not just IDs) for human readability.

---

### Unit 15: Documentation updates

**Files**:
- `docs/ROADMAP.md` (Phase 7 description tightened)
- `docs/CURRICULUM.md` (BKT defaults note + active-path tools section)
- `docs/CONTRACT.md` (note on `MemoryService` becoming concrete in v1)

**ROADMAP.md** Phase 7 (replace existing block):

```markdown
## Phase 7: Adaptive memory (semantic + misconception)

**Goal:** System tracks concept mastery over time and surfaces misconceptions; agent reads graduated mastery in the brief.

**Build:**
- `Indexer` port + `IndexerOrchestrator` (debounced post-turn + run-at-session-end), with isolated per-indexer failure handling
- Two indexers: `MasteryIndexer` (deterministic — scans `grade_math`, `code_sandbox`, `course.mark_studied`, and active-path tool results; applies BKT updates) and `MisconceptionIndexer` (agent-driven, runs at session end via `runOneShot` against the active engine)
- BKT helper (4-parameter Corbett & Anderson) + decay helper (exponential, applied at read time)
- Active-path tools: `update_mastery({conceptId, signal, evidenceEventId?})` and `record_misconception({conceptId, description, errorForm, remediation, evidenceEventIds[]})`. Same code path as the indexers.
- `MemoryServiceImpl` — `studentModel`, `misconceptions`, `episodic` (streamed), `export`, `delete({confirm: true})`
- Course-context prompt fragment now renders graduated mastery tags (`mastered (0.85)` / `in progress (0.42)` / `not yet started`)
- `pnpm db:mastery` CLI script
- IPC: `praxis.memory.*`; `MemoryClient` real implementation replacing the Phase 3 stub

**Deferred to a later phase**: LLM mastery refinement (Phase 7.x or after Phase 14 evals); procedural / affective indexers (Phase 14); memory inspector UI (Phase 11 configure mode); per-concept BKT parameter overrides (Phase 14 after eval data justifies it).

**Test checkpoint:** Multi-turn teach session with deliberate wrong answers. `pnpm db:mastery` shows updated scores with effective decay applied. Misconception entries appear after `session.end` with evidence event IDs traceable to the originating turns. The next teach session opens with a system prompt that contains graduated mastery tags rather than binary studied/not-studied.
```

**CURRICULUM.md** — add to "Knowledge graph design" section:

```markdown
**BKT defaults.** The mastery model uses single-observation Bayesian Knowledge Tracing with default parameters `P(L0) = 0.1`, `P(T) = 0.1`, `P(G) = 0.2`, `P(S) = 0.1`. Decay is exponential against `ThresholdConfig.decayDays` (default 14). Per-concept parameter overrides are deferred to Phase 14 once evaluation data justifies tuning.

**Active-path tools.** The tutor agent has two memory-write tools — `update_mastery` (explicit BKT signal for moments the deterministic indexer can't classify, e.g. slips and timeouts) and `record_misconception` (agent-issued misconception with required evidence event ids). The deterministic mastery indexer runs after every turn (3-second debounce); the agent-driven misconception indexer runs at session end. Both feed the same projection tables; active-path and passive-path converge.
```

**CONTRACT.md** — add to "Memory schemas" section:

```markdown
> **v1 status (April 2026)**: `MemoryService` is fully implemented in v1 (Phase 7). `studentModel()` and `misconceptions()` are populated by the post-turn deterministic mastery indexer and the session-end agent-driven misconception indexer respectively. `procedural()` and `affective()` return safe empty defaults until Phase 14 fills them. `episodic()`, `export()`, and `delete({confirm: true})` ship in Phase 7 — students own their memory per SPEC.md.
```

**Acceptance criteria**:
- [ ] `docs/ROADMAP.md` Phase 7 description reflects the indexer split + deferred LLM refinement.
- [ ] `docs/CURRICULUM.md` documents BKT defaults and active-path tools.
- [ ] `docs/CONTRACT.md` notes `MemoryService` as concrete in v1.

---

### Unit 16: Tests

| Test file | Type | What it tests |
|---|---|---|
| `packages/core/src/services/memory/__tests__/bkt.test.ts` | unit, fast | BKT correctness: monotonicity (correct ↑, incorrect ↓), slip strictly between, clamp [0..1], 5-correct sanity. |
| `packages/core/src/services/memory/__tests__/decay.test.ts` | unit, fast | Decay correctness: half-life, no decay without practice, monotonic, clamp ≥ 0. |
| `packages/core/src/services/memory/__tests__/memory-service.test.ts` | unit, fast (real DB via useTempDb) | `studentModel` applies decay; `misconceptions` ordering; `episodic` skips redacted; `export` round-trips JSON; `delete` wipes projections + redacts episodic. |
| `packages/core/src/services/indexers/__tests__/orchestrator.test.ts` | unit, fast | Debounce collapses bursts; cancel clears timer; `runAtSessionEnd` runs both schedules; per-indexer failure isolation; turnFloor incremental indexing. |
| `packages/core/src/services/indexers/__tests__/mastery-indexer.test.ts` | unit, fast (real DB) | All five extraction patterns (active-path, course.mark_studied, grade_math correct/incorrect, code_sandbox, no-signal); concept attribution via courseStateReader; idempotent re-runs; evidence cap. |
| `packages/core/src/services/indexers/__tests__/misconception-indexer.test.ts` | unit, fast (FakeEngine) | Empty session skipped; clear misconception case writes a row; dedup by errorForm appends evidence; unknown conceptId dropped; engine error aborts gracefully. |
| `packages/tools/src/memory/__tests__/update-mastery.test.ts` | unit, fast | Tool handler upserts mastery; output includes new pKnown/effectivePKnown. |
| `packages/tools/src/memory/__tests__/record-misconception.test.ts` | unit, fast | Tool handler upserts misconception; merge on errorForm collision; new row otherwise. |
| `packages/curriculum/src/brief/__tests__/course-context.test.ts` (extended) | unit, fast | Mastery tag rendering at thresholds 0.85, 0.62, 0.25, undefined+studied, undefined+not-studied. |
| `packages/curriculum/src/__tests__/teach-mode.test.ts` (extended) | unit, fast | `update_mastery` and `record_misconception` in `teachMode.toolNames`. |
| `packages/desktop/src/__tests__/ipc-server-memory.test.ts` | unit | All 7 memory IPC channels route to the right MemoryServiceImpl methods; episodic stream cancels cleanly. |
| `packages/client/src/__tests__/memory-client.test.ts` | unit | Each client method invokes the right channel; Map round-trip via entries-array. |
| `tests/mastery-end-to-end.test.ts` | integration, fast (FakeEngine emits canned events) | Multi-turn session with grade_math wrong/right + course.mark_studied; assert post-turn mastery updates; subsequent session's system prompt contains graduated mastery tags. |
| `tests/misconception-end-to-end.test.ts` | integration, fast (FakeEngine for indexer) | Multi-turn session ends; misconception indexer runs synchronously inside `session.end`; assert misconception row inserted with evidence event ids that resolve to real episodic rows. |

Slow tests (real engine for misconception indexer with fixture sessions) gated behind `PRAXIS_RUN_SLOW_TESTS=1`.

---

## Implementation Order

1. **Unit 1** — Type contract additions.
2. **Unit 2** — BKT helper.
3. **Unit 3** — Decay helper.
4. **Unit 4** — `MemoryServiceImpl`.
5. **Unit 5** — `IndexerOrchestratorImpl`.
6. **Unit 6** — `MasteryIndexer` (deterministic).
7. **Unit 7** — `MisconceptionIndexer` (agent-driven).
8. **Unit 8** — Active-path tools.
9. **Unit 10** — Course-context fragment update (depends on Unit 4).
10. **Unit 9** — `teach` mode update.
11. **Unit 11** — `SessionService` integration.
12. **Unit 12** — `ServiceDeps` + `buildServices` wiring.
13. **Unit 13** — IPC + `MemoryClient`.
14. **Unit 14** — `pnpm db:mastery` script.
15. **Unit 15** — Doc updates.
16. **Unit 16** — Tests interspersed throughout.

Units 2 and 3 are independent. Units 8 (tools) depends on Units 6 (mastery indexer's helpers) and 7 (misconception indexer's helpers) — extract `applySignalsToConcept` and `upsertMisconception` as exported helpers when writing 6 and 7 so 8 reuses them.

---

## Verification

```bash
pnpm install                               # if native modules need refreshing
pnpm typecheck                             # MUST pass
pnpm lint                                  # MUST pass
pnpm test                                  # MUST pass — fast suite
PRAXIS_RUN_SLOW_TESTS=1 pnpm test          # slow lane (real engine misconception runs)

# Manual checkpoint (Phase 7)
pnpm desktop:build && pnpm dev
# 1. Start a teach session against an existing course (Phase 6 flow).
# 2. Get the tutor to ask 3 math questions; deliberately get one wrong, one right, one slip-style wrong.
# 3. Watch chat — tool_call events for grade_math (and possibly update_mastery / record_misconception).
# 4. End the session. The misconception indexer runs synchronously; UI returns when complete.
# 5. `pnpm db:mastery` — confirm mastery rows updated; effective decay applied (very small for "now").
# 6. Re-open chat → start a new teach session against the same course → first system prompt contains graduated mastery tags ("mastered (0.83)", "in progress (0.41)").
# 7. Optional: `pnpm db:episodic` to inspect raw transcripts; cross-reference event IDs against `misconceptions.evidenceJson`.
# 8. `client.memory.delete({confirm: true})` (via dev tools) → `pnpm db:mastery` returns empty; episodic rows persist with `redactedAt` set.
```
