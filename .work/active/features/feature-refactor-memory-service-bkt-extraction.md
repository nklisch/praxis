---
id: feature-refactor-memory-service-bkt-extraction
kind: feature
stage: implementing
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Extract BKT math + mastery readers from `MemoryService`

## Brief
`packages/core/src/services/memory/memory-service.ts` (632 lines) bundles:
- (a) Four projections (studentModel, affective, procedural, misconceptions)
  each with independent mastery decay logic
- (b) Three orthogonal read paths (episodic streaming, export-to-file,
  misconception tracking)
- (c) Multiple DB accessors (getMastery, getMisconception, read, resetConcept,
  clearMisconception)

The BKT math (decay, signal application, uncertainty) is buried across methods
rather than centralized in pure functions.

## Refactor target
Two-pronged extraction:

1. **`MasteryQueries` utility** — narrow read interface for the five
   mastery/misconception readers
2. **Pure BKT math functions** — extract `applyBktSignal` and `decayMastery`
   as pure functions in a `bkt/` subdirectory

`MemoryService` becomes the orchestration seam: projections + indexers + the
write side, calling the extracted readers and pure math.

Optional further split: `MasteryMemoryService` and `AffectiveMemoryService` if
the affective path is orthogonal enough — defer that decision to per-feature
design.

## Constraints
- Public `MemoryService` interface unchanged
- BKT math behavior bit-for-bit identical (compared by mastery-projection tests)
- Indexer orchestration (multiple indexers running on session-end) keeps working
- Episodic stream contract preserved

## Discovery evidence
- File length: 632 lines (verified)
- BKT math scattered across methods
- Domain cohesion is reasonable — lower urgency than assignment/session, but
  pure-math extraction is a clean win
- Discovered by autopilot refactor cadence

---

## Design (post-analysis)

### What the code scan found

`bkt.ts` and `decay.ts` are **already pure** — the BKT math is already
extracted. The original brief's "extract pure BKT functions" goal is already
done. The real problems are:

1. **Duplicated `applySignalsToConcept`** in `mastery-indexer.ts`:
   the logic appears twice — once as `MasteryIndexer.applySignalsToConcept()`
   instance method and once as a standalone exported function (identical 60-line
   body). The standalone exists so `MemoryServiceImpl.applySignal()` can call it
   without holding a `MasteryIndexer` instance.

2. **Wrong import direction**: `memory-service.ts` imports
   `applySignalsToConcept` from `indexers/mastery-indexer.ts`. The memory
   module should not reach into the indexers module; the write helper belongs
   in `memory/`.

3. **Row-mapper duplication**: The milli-int → float conversion + `brandId`
   wrangling for `studentMastery` rows is copy-pasted in `studentModel()`,
   `getMastery()`, and `read()`.

4. **Read/write entanglement**: Five read-only DB accessors (`studentModel`,
   `misconceptions`, `getMastery`, `getMisconception`, `read`) sit alongside
   write methods in `MemoryServiceImpl` with no structural separation.

### Three-story plan

#### Step 1 — `rowToConceptMastery` row mapper (no depends_on)
Extract the milli-int → `ConceptMastery` conversion into
`memory/mastery-row-mapper.ts`. Three sites in `MemoryServiceImpl` call it.
Pure mechanical, lowest risk.

#### Step 2 — Move `applySignalsToConcept` + fix import direction (no depends_on)
Create `memory/mastery-writes.ts` with the single canonical write helper.
Delete the duplicated standalone from `mastery-indexer.ts`; the class method
becomes a one-liner delegation. Fix `memory-service.ts` import direction.
Update `services/index.ts` re-export. Zero logic change.

#### Step 3 — Extract `MasteryQueries` (depends on step-1, step-2)
Create `memory/mastery-queries.ts` with `MasteryQueries` class holding the
five read methods. `MemoryServiceImpl` delegates to it via a private instance.
`memory-service.ts` drops from ~632 to ~500 lines. Public interface unchanged.

### Child stories
- `feature-refactor-memory-service-bkt-extraction-step-1-row-mapper`
- `feature-refactor-memory-service-bkt-extraction-step-2-apply-signals-move`
- `feature-refactor-memory-service-bkt-extraction-step-3-mastery-queries`

### Implementation order
Steps 1 and 2 are independent and can run in parallel.
Step 3 depends on both step 1 and step 2.

### New files after refactor
```
packages/core/src/services/memory/
  bkt.ts                    (unchanged — already pure)
  decay.ts                  (unchanged — already pure)
  mastery-row-mapper.ts     (NEW — step 1)
  mastery-writes.ts         (NEW — step 2)
  mastery-queries.ts        (NEW — step 3)
  memory-service.ts         (edited all three steps)
```
