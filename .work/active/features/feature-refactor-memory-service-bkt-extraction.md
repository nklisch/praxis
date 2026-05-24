---
id: feature-refactor-memory-service-bkt-extraction
kind: feature
stage: drafting
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

## Next
Per-feature design via `/agile-workflow:refactor-design feature-refactor-memory-service-bkt-extraction`.
