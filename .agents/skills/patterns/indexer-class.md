# Indexer Class with Orchestrator

Background memory writers that mine the episodic event stream are implemented as classes implementing the `Indexer` interface (`id`, `schedule`, `constructor(deps)`, `async run(ctx)`). They are registered as a flat array passed to `IndexerOrchestratorImpl`, which debounces post-turn passes and runs all matching indexers in `Promise.all` with per-indexer error isolation.

## Rationale

Five concrete indexers (mastery, misconception, affective, procedural, concept-map-divergence) all do the same job: scan a session's recent episodic events and write derived rows to a memory table. Forcing them all through a shared interface lets the orchestrator handle scheduling, debouncing, error isolation, turn-floor advancement, and activity-rail integration once, rather than each indexer reinventing it. Schedule is split into `post-turn` (debounced; runs hot during a session) and `session-end` (runs once at session close) so cheap deterministic indexers can update mastery in near-real-time while expensive LLM-driven indexers only fire when they matter.

## Examples

### Example 1: Indexer interface — minimal contract
**File**: `packages/core/src/types/memory.ts` (search `export interface Indexer`)
```typescript
export interface Indexer {
  /** Stable id; used in logs and to scope debouncing per (sessionId, indexerId). */
  readonly id: string;
  /** When this indexer wants to run. */
  readonly schedule: "post-turn" | "session-end";
  /** Run the indexer over the given context. Throws are caught and logged by the orchestrator. */
  run(ctx: IndexerContext): Promise<void>;
}
```

### Example 2: AffectiveIndexer implementation — id + schedule + run
**File**: `packages/core/src/services/indexers/affective-indexer.ts:60`
```typescript
export class AffectiveIndexer implements Indexer {
  readonly id = "affective";
  readonly schedule = "session-end" as const;

  constructor(private readonly deps: AffectiveIndexerDeps) {}

  async run(ctx: IndexerContext): Promise<void> {
    if (ctx.events.length < 2) return;
    const explicit = extractExplicitCheckins(ctx.events);
    const inferred = await runModelInference(this.deps, ctx);
    if (explicit.length === 0 && !inferred) return;
    this.deps.db.transaction((tx) => {
      /* write rows */
    });
  }
}
```

### Example 3: Orchestrator — fan-out with per-indexer error isolation
**File**: `packages/core/src/services/indexers/orchestrator.ts:135`
```typescript
const indexers = this.deps.indexers.filter((i) => i.schedule === schedule);
const ctx: IndexerContext = { studentId, sessionId, events, log };
await Promise.all(
  indexers.map(async (idx) => {
    try {
      await idx.run(ctx);
    } catch (err) {
      this.deps.log.warn(`indexer.${idx.id}.failed`, { error: String(err) });
    }
  }),
);
```

The other three concrete implementations are `MasteryIndexer` (`mastery-indexer.ts:50`, `schedule = "post-turn"`, deterministic), `MisconceptionIndexer` (`misconception-indexer.ts:75`, `schedule = "session-end"`, LLM-driven), `ProceduralIndexer` (`procedural-indexer.ts:48`, `schedule = "session-end"`, deterministic), and `ConceptMapDivergenceIndexer` (`concept-map-divergence-indexer.ts:54`, `schedule = "session-end"`, LLM-driven).

## When to Use

- Adding a new derived-memory writer that mines episodic events: implement `Indexer` and register it in the orchestrator's `indexers` array
- Anything that runs at predictable session-lifecycle points and needs error isolation from peers

## When NOT to Use

- Active-path tools that write memory directly (`update_mastery`, `record_misconception`) — those are tool handlers, not indexers; they bypass the orchestrator on purpose. Indexers must skip events from active-path tools to avoid double-applying (see `MasteryIndexer.ACTIVE_PATH_TOOL_NAMES`)
- Streaming side effects that need to fire mid-turn — indexers see events in batches, not as they arrive

## Common Violations

- Throwing out of `run` and expecting the caller to handle it — the orchestrator catches and logs but doesn't propagate; if the indexer needs to surface a failure to a user, do it via the activity rail, not exceptions
- Reading events outside `ctx.events` — the orchestrator filters by `turnFloor` to prevent reprocessing; reading the DB directly bypasses that and re-applies signals on every pass
- Forgetting `as const` on the schedule literal — `readonly schedule = "session-end" as const` is required for the union to narrow
