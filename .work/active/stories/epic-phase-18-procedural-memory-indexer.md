---
id: epic-phase-18-procedural-memory-indexer
kind: story
stage: implementing
tags: [content]
parent: epic-phase-18-procedural-memory
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Procedural memory: indexer + read path

## Scope

Replace the `MemoryService.procedural()` Phase 14 stub with a real query
that reads `procedural_strategies` rows; build a session-end
`ProceduralIndexer` that updates strategy preferences based on the
session's outcome on the current lesson; wire into the
`IndexerOrchestrator`.

The design lives in the parent feature body
(`epic-phase-18-procedural-memory`); read it for architecture and design
decisions before starting. This story is the single implementation unit
for the feature.

## Units

### Unit 1: `MemoryService.procedural()` — real implementation

**File**: `packages/core/src/services/memory/memory-service.ts`
(replace the Phase 14 stub at ~line 133)

```typescript
async procedural(studentId: StudentId): Promise<ProceduralModel> {
  const rows = this.deps.db
    .select()
    .from(proceduralStrategies)
    .where(eq(proceduralStrategies.studentId, studentId))
    .all();

  const strategies = new Map<StrategyId, StrategyPreference>();
  for (const r of rows) {
    const id = brandId<"StrategyId">(r.strategyId);
    strategies.set(id, {
      strategyId: id,
      preference: r.preferenceMilli / 1000, // -1..1
      evidenceCount: r.evidenceCount,
    });
  }

  return { studentId, strategies };
}
```

**Acceptance**:
- [ ] Empty state returns `{ studentId, strategies: new Map() }`.
- [ ] Populated state reads each row, converts `preferenceMilli` to
      `preference: number ∈ [-1, 1]`, preserves `evidenceCount`.
- [ ] Round-trip test: insert N rows with a mix of positive and negative
      preferences, query, assert all are present with correct values.

### Unit 2: `ProceduralIndexer` (session-end)

**File**: `packages/core/src/services/indexers/procedural-indexer.ts`

```typescript
export interface ProceduralIndexerDeps {
  db: PraxisDb;
  log: Logger;
  /** Resolves the courseId for a given sessionId. */
  sessionCourseId: (sessionId: string) => string | null;
  /** Reads the active course's current lesson + its suggestedStrategy. */
  courseStateReader: CourseStateReader;
  /** Validates that the lesson's suggestedStrategy is a known strategy id. */
  pedagogyPack: PedagogyPackService;
}

export class ProceduralIndexer implements Indexer {
  readonly id = "procedural";
  readonly schedule = "session-end" as const;

  constructor(private readonly deps: ProceduralIndexerDeps) {}

  async run(ctx: IndexerContext): Promise<void> {
    // Skip empty / tiny sessions.
    if (ctx.events.length < 2) return;

    // 1. Resolve the session's current lesson and its suggestedStrategy.
    const rawCourseId = this.deps.sessionCourseId(ctx.sessionId);
    if (!rawCourseId) return; // no course bound — nothing to attribute

    const courseId = brandId<"CourseId">(rawCourseId);
    const snapshot = await this.deps.courseStateReader.read({
      studentId: ctx.studentId,
      courseId,
    });
    if (!snapshot?.currentLesson) return;

    const strategyId = snapshot.currentLesson.suggestedStrategy;

    // 2. Validate against the loaded pedagogy pack. If the strategy isn't
    //    known to the pack, skip — better to drop the signal than write
    //    a stray entry that no consumer recognizes.
    if (this.deps.pedagogyPack.getStrategy(strategyId) === null) {
      this.deps.log.debug("procedural.unknown_strategy", { strategyId });
      return;
    }

    // 3. Score the session's outcome from episodic events.
    const score = scoreSessionOutcome(ctx.events);

    // No-signal case: skip without writing.
    if (score.delta === 0) {
      this.deps.log.debug("procedural.no_signal", {
        strategyId,
        evidenceCount: score.evidenceCount,
      });
      return;
    }

    // 4. Apply the preference delta and upsert.
    this.applyDelta(ctx.studentId, strategyId, score);
  }

  private applyDelta(
    studentId: StudentId,
    strategyId: StrategyId,
    score: SessionOutcome,
  ): void {
    const existing = this.deps.db
      .select()
      .from(proceduralStrategies)
      .where(
        and(
          eq(proceduralStrategies.studentId, studentId),
          eq(proceduralStrategies.strategyId, strategyId),
        ),
      )
      .get();

    const oldPref = existing?.preferenceMilli ?? 0;
    const oldCount = existing?.evidenceCount ?? 0;

    // Clamp to [-1000, 1000].
    const newPref = Math.max(-1000, Math.min(1000, oldPref + score.delta));
    const newCount = oldCount + score.evidenceCount;

    const now = new Date();

    this.deps.db
      .insert(proceduralStrategies)
      .values({
        studentId,
        strategyId,
        preferenceMilli: newPref,
        evidenceCount: newCount,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [proceduralStrategies.studentId, proceduralStrategies.strategyId],
        set: {
          preferenceMilli: newPref,
          evidenceCount: newCount,
          updatedAt: now,
        },
      })
      .run();
  }
}
```

### Unit 3: `scoreSessionOutcome` helper

**File**: same file as the indexer; pure function.

```typescript
interface SessionOutcome {
  /** Preference delta in milli-units. -1000..+1000. */
  delta: number;
  /** Count of episodic events that contributed to the score. */
  evidenceCount: number;
}

/**
 * Compute a strategy-preference delta from a session's episodic events.
 *
 * Heuristic v1:
 * - count_correct: +1 per `grade_math` tool_result with `correct: true`,
 *   per `course.mark_studied` success, per `code_sandbox` success
 *   (exitCode=0 + empty stderr).
 * - count_incorrect: +1 per `grade_math` tool_result with
 *   `correct: false`, per `code_sandbox` failure.
 * - net = count_correct - count_incorrect
 * - delta = net * 50 (asymmetric: see below)
 * - Asymmetry: if net < 0, multiply by 2 (loss aversion — negative
 *   experiences reshape preferences faster than positive ones).
 * - Bounded: returned delta is clamped to [-300, +300] per session so
 *   one outlier session can't dominate the running preference.
 */
function scoreSessionOutcome(events: IndexerContext["events"]): SessionOutcome {
  const toolNames = new Map<string, string>();
  for (const { event } of events) {
    if (event.type === "tool_call") toolNames.set(event.callId, event.toolName);
  }

  let correct = 0;
  let incorrect = 0;

  for (const { event } of events) {
    if (event.type !== "tool_result") continue;
    const tool = toolNames.get(event.callId);
    if (!tool) continue;
    if (!event.result.ok) continue;
    const value = event.result.value as Record<string, unknown> | undefined;

    if (tool === "grade_math") {
      const c = value?.correct;
      if (c === true) correct++;
      else if (c === false) incorrect++;
    } else if (tool === "course.mark_studied") {
      // mark_studied implies a correct/positive engagement signal.
      correct++;
    } else if (tool === "code_sandbox") {
      const exit = (value as { exitCode?: number | null })?.exitCode;
      const stderr = (value as { stderr?: string })?.stderr ?? "";
      if (exit === 0 && stderr.trim() === "") correct++;
      else if (exit !== 0 && exit !== null) incorrect++;
    }
  }

  const net = correct - incorrect;
  const evidenceCount = correct + incorrect;

  // Loss aversion: negative experiences nudge preference 2x faster.
  let delta = net * 50;
  if (net < 0) delta *= 2;

  // Bound per-session contribution to limit single-session influence.
  delta = Math.max(-300, Math.min(300, delta));

  return { delta, evidenceCount };
}
```

**Acceptance** (indexer + helper combined):
- [ ] No-event session: indexer returns without writing.
- [ ] Session with no course: indexer returns without writing.
- [ ] Session with no current lesson: indexer returns without writing.
- [ ] Session whose current lesson references an unknown strategy: indexer
      returns without writing (debug log emitted).
- [ ] Session with all-correct outcome: preference goes UP by `correct * 50`
      milli (capped at +300). evidenceCount increases by `correct`.
- [ ] Session with all-incorrect outcome: preference goes DOWN by
      `incorrect * 50 * 2` milli (loss aversion; capped at -300).
      evidenceCount increases by `incorrect`.
- [ ] Mixed outcome with net = 0: indexer skips (no write).
- [ ] Existing preference + delta correctly clamps at boundaries
      (preference can't exceed [-1000, +1000]).
- [ ] Active-path tool calls aren't double-counted (n/a here — none of
      the procedural-relevant tools are active-path; document for safety).

### Unit 4: services.ts wiring

**File**: `packages/desktop/electron/main/services.ts`

```typescript
const proceduralIndexer = new ProceduralIndexer({
  db,
  log,
  sessionCourseId: readSessionCourseId,
  courseStateReader: artifactsService,
  pedagogyPack: pedagogyPackService,
});

const indexerOrchestrator = new IndexerOrchestratorImpl({
  db,
  log,
  indexers: [
    masteryIndexer,
    misconceptionIndexer,
    affectiveIndexer,
    proceduralIndexer, // ← Phase 18
    conceptMapSnapshotter,
    conceptMapDivergenceIndexer,
  ],
  activity: activityRegistry,
});
```

`readSessionCourseId` already exists (used by mastery and misconception);
`artifactsService` is the `CourseStateReader` (already constructed earlier
in services.ts); `pedagogyPackService` was wired by the
`epic-phase-18-pedagogy-pack-service` story.

**Acceptance**:
- [ ] `pnpm typecheck` clean after wiring.
- [ ] All existing test stubs that construct an `IndexerOrchestrator` or
      `ServiceDeps` continue to typecheck (no breaking field additions to
      cross-cutting types).

### Unit 5: Tests

**Files**:
- `packages/core/src/services/memory/__tests__/memory-service.procedural.test.ts`
  — read-path tests:
  - empty state
  - populated state with mixed positive/negative preferences
  - rows persist across instances (DB round-trip)
- `packages/core/src/services/indexers/__tests__/procedural-indexer.test.ts`
  — indexer tests:
  - no events → no write
  - no course bound → no write
  - no current lesson → no write
  - lesson references unknown strategy (not in pack) → no write +
    debug log
  - all-correct session → preference up; evidenceCount up
  - all-incorrect session → preference down (with 2x amplification);
    evidenceCount up
  - mixed (net = 0) → no write
  - existing row + delta → upsert with correct combined values
  - clamp at +1000 (existing 950 + delta 200 → cap at 1000)
  - clamp at -1000 (existing -950 + delta -300 → cap at -1000)
- Test pattern mirrors `mastery-indexer.test.ts`'s shape: `useTempDb()`,
  fake `CourseStateReader` returning a synthetic snapshot, fake
  `pedagogyPack` (via the `makeEmptyPedagogyPackService` helper for
  unknown-strategy tests, or a small inline filled service for the
  others).

## Acceptance criteria (story)

- [ ] `MemoryService.procedural(studentId)` returns real data; the
      `Phase 14 stub` comment is removed.
- [ ] `ProceduralIndexer` lands in
      `packages/core/src/services/indexers/`.
- [ ] `IndexerOrchestratorImpl` runs the procedural indexer at session-end
      alongside mastery / misconception / affective / concept-map.
- [ ] `pnpm typecheck && pnpm test` green.
- [ ] `pnpm lint` shows no regression past the current 4-error baseline.
