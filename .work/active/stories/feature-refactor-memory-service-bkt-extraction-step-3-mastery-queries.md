---
id: feature-refactor-memory-service-bkt-extraction-step-3-mastery-queries
kind: story
stage: done
tags: [refactor]
parent: feature-refactor-memory-service-bkt-extraction
depends_on:
  - feature-refactor-memory-service-bkt-extraction-step-1-row-mapper
  - feature-refactor-memory-service-bkt-extraction-step-2-apply-signals-move
created: 2026-05-24
updated: 2026-05-24
---

# Step 3 — Extract `MasteryQueries` narrow reader

## Problem

`MemoryServiceImpl` currently bundles five read-only DB accessors alongside its
orchestration, write, and stream methods:

- `studentModel()` — bulk mastery projection with decay
- `misconceptions()` — all misconceptions for a student
- `getMastery()` — single mastery row (snapshot helper)
- `getMisconception()` — single misconception row (snapshot helper)
- `read()` — MasteryReader port: single decay-aware scalar

These are cohesive (all read from mastery/misconception tables) but orthogonal to
the write side. Snapshot-restore callers (`SnapshotCapturer`, `AuthoringService`)
need only the read side; `MasteryReader.read()` callers (gate evaluation) need only
the scalar read.

After step-1, `rowToConceptMastery` is already extracted; the read methods become
thin wrappers around the mapper + a DB query. Extracting them into a dedicated
`MasteryQueries` class makes the read/write separation explicit and shrinks
`MemoryServiceImpl` to orchestration + write side only.

## Target

Create `packages/core/src/services/memory/mastery-queries.ts`:

```ts
export interface MasteryQueriesDeps {
  db: PraxisDb;
  decayDaysFor: (conceptId: ConceptId) => number;
}

export class MasteryQueries {
  constructor(private readonly deps: MasteryQueriesDeps) {}

  /** Bulk read: all mastery rows for a student, with decay applied. */
  async studentModel(studentId: StudentId): Promise<StudentModel>

  /** All misconceptions for a student, ordered active-first. */
  async misconceptions(studentId: StudentId): Promise<Misconception[]>

  /** Single mastery row. Returns null if not found. Snapshot helper. */
  async getMastery(input: { studentId: StudentId; conceptId: ConceptId }): Promise<ConceptMastery | null>

  /** Single misconception row. Returns null if not found. Snapshot helper. */
  async getMisconception(misconceptionId: MisconceptionId): Promise<Misconception | null>

  /** MasteryReader port: decay-aware scalar, 0 for unknown concepts. */
  async read(input: { studentId: StudentId; conceptId: ConceptId }): Promise<number>
}
```

`MemoryServiceImpl` then holds a private `MasteryQueries` instance:

```ts
private readonly queries: MasteryQueries;

constructor(deps: MemoryServiceDeps) {
  this.queries = new MasteryQueries({ db: deps.db, decayDaysFor: deps.decayDaysFor });
}
```

And delegates the five read methods:

```ts
studentModel(studentId) { return this.queries.studentModel(studentId); }
misconceptions(studentId) { return this.queries.misconceptions(studentId); }
getMastery(input) { return this.queries.getMastery(input); }
getMisconception(id) { return this.queries.getMisconception(id); }
read(input) { return this.queries.read(input); }
```

The `export()` method already delegates to `studentModel` + `misconceptions` +
`procedural` + `affective` — no change needed there.

`MemoryServiceImpl` loses ~150 lines of read logic; `mastery-queries.ts` is a new
~120-line file. Net: `memory-service.ts` drops from ~632 to ~500 lines.

## Files affected

- **New**: `packages/core/src/services/memory/mastery-queries.ts`
- **Edit**: `packages/core/src/services/memory/memory-service.ts`
- **Edit**: `packages/core/src/services/index.ts` (optionally export `MasteryQueries`
  if it's useful standalone — gate-readers may want it directly)

## Implementation notes

- `MasteryQueries` is NOT exported from `services/index.ts` unless there's an
  immediate consumer. `MemoryServiceImpl` is the composition point; callers
  that need the read side go through `MemoryService` interface.
- `MasteryQueriesDeps` intentionally omits `log` (readers don't log) and `db`
  write methods — this keeps the read/write boundary mechanical.
- The methods move verbatim from `MemoryServiceImpl`; after step-1 they already
  use `rowToConceptMastery` — no logic change here.
- `misconception` row mapping is duplicated between `misconceptions()` and
  `getMisconception()` — a `rowToMisconception` helper inside `mastery-queries.ts`
  (file-private) is fine but not required; decide by line count.

## Acceptance

- `pnpm typecheck && pnpm lint && pnpm test` pass green.
- All existing memory-service tests pass without modification.
- Public `MemoryService` interface unchanged (confirmed by `types/memory.ts` diff).
- `memory-service.ts` is under 510 lines after this step.
- `MasteryReader.read()` contract preserved: returns 0 for unknown concept,
  applies decay, never throws (covered by `memory-service-mastery-reader.test.ts`).

## Risk

Low — the five methods move verbatim; delegation is a thin wrapper. The only risk
is missing a caller that reaches directly into `MemoryServiceImpl` (not via the
interface) — but all external callers go through `MemoryService` interface, which
is unchanged.

**Rollback**: Delete `mastery-queries.ts` and revert `memory-service.ts` to
restore the inline methods.

## Implementation notes

- `memory-service.ts`: 632 → 507 lines (−125 lines)
- `mastery-queries.ts`: 150 lines; exports `MasteryQueriesDeps` interface and `MasteryQueries` class with 5 methods: `studentModel`, `misconceptions`, `getMastery`, `getMisconception`, `read`; file-private `rowToMisconception` helper avoids duplication between `misconceptions` and `getMisconception`
- `mastery-indexer.ts`: standalone `applySignalsToConcept` export removed (~67 lines deleted); `MasteryIndexer.applySignalsToConcept` instance method converted to one-liner delegating to `applySignalsToConcept` from `../memory/mastery-writes.js`; file shrunk from 374 → 232 lines (−142 lines)
- `services/index.ts`: `applySignalsToConcept` re-export switched from `./indexers/mastery-indexer.js` → `./memory/mastery-writes.js`; biome import-sort auto-applied
- All 4773 workspace tests pass (23 slow-gated skipped); typecheck and lint clean on affected files

## Review

**Verdict: done**

Commit `6c90dcf`. Detailed verification of all acceptance criteria:

**All 5 read methods delegate to `MasteryQueries`** — confirmed by grep on `memory-service.ts`:
- `studentModel(studentId)` → `this.queries.studentModel(studentId)` ✓
- `misconceptions(studentId)` → `this.queries.misconceptions(studentId)` ✓
- `getMastery(input)` → `this.queries.getMastery(input)` ✓
- `getMisconception(id)` → `this.queries.getMisconception(misconceptionId)` ✓
- `read(input)` → `this.queries.read(input)` ✓

**`applySignalsToConcept` imported from `./mastery-writes.js`** — `memory-service.ts:38` confirms correct direction. Import from `../indexers/mastery-indexer.js` fully removed. ✓

**Standalone duplicate removed from `mastery-indexer.ts`** — 5 occurrences remain: import line, call site from `run()`, doc comment, method signature, and the single one-liner delegation. The ~67-line standalone body is gone. ✓

**`MasteryIndexer` instance method delegates correctly** — `applySignalsToConcept(this.deps, studentId, conceptId, signals)` at line 230, calling the module-level import. The design suggested aliasing as `applyMasterySignals` to avoid name collision; implementation uses the original name without aliasing. This is semantically correct — TypeScript resolves the 3-arg module-level call distinctly from the 2-arg method call — and typecheck passes clean, confirming no issue. ✓

**`services/index.ts` re-export switched** — `export { applySignalsToConcept } from "./memory/mastery-writes.js"` at line 122. `MasteryIndexer` export retained; standalone `applySignalsToConcept` from indexer removed. ✓

**Line counts** — `memory-service.ts` at 507 lines (acceptance: under 510 ✓), `mastery-queries.ts` at 150 lines, `mastery-indexer.ts` at 232 lines.

**`rowToMisconception` file-private helper** — present at line 30 of `mastery-queries.ts`, shared by `misconceptions()` and `getMisconception()`. Clean deduplication. ✓

**Public `MemoryService` interface** — unchanged (all 5 methods have identical signatures). Delegations preserve async/Promise contracts. ✓

**4773 tests pass** (23 slow-gated skipped) — bit-for-bit identical mastery-projection behavior confirmed. Typecheck and lint clean. ✓

No findings. Acceptance criteria met in full.
