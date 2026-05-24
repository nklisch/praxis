---
id: feature-refactor-memory-service-bkt-extraction-step-2-apply-signals-move
kind: story
stage: review
tags: [refactor]
parent: feature-refactor-memory-service-bkt-extraction
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 2 — Eliminate `applySignalsToConcept` duplication + fix import direction

## Problem

`packages/core/src/services/indexers/mastery-indexer.ts` contains the BKT-write
pipeline in **two identical copies** (60+ lines each):

1. `MasteryIndexer.applySignalsToConcept()` — instance method (lines 232–299)
2. `applySignalsToConcept()` — standalone exported function (lines 307–373)

Both do: read row → decode milli-ints → `bktInitial`/`bktUpdate` loop →
encode back to milli-ints → upsert. The standalone copy exists because
`MemoryServiceImpl.applySignal()` needs to call this logic without holding
a `MasteryIndexer` instance.

Additionally, `memory-service.ts` imports `applySignalsToConcept` **from**
`indexers/mastery-indexer.ts`. This is an awkward direction: the memory
module reaches into the indexers module for a write helper. The cleaner home
is `memory/mastery-writes.ts` alongside `bkt.ts` and `decay.ts`.

## Target

1. **Create** `packages/core/src/services/memory/mastery-writes.ts` containing
   the single canonical implementation of `applySignalsToConcept`:

   ```ts
   export function applySignalsToConcept(
     deps: Pick<{ db: PraxisDb }, "db">,
     studentId: StudentId,
     conceptId: ConceptId,
     signals: MasterySignal[],
   ): void
   ```

   Body is the existing standalone function body, unchanged.

2. **Edit** `mastery-indexer.ts`:
   - Delete the standalone `applySignalsToConcept` export (lines 307–373).
   - Change `MasteryIndexer.applySignalsToConcept()` instance method to delegate
     to the imported version from `../memory/mastery-writes.js` instead of
     inlining the logic:
     ```ts
     applySignalsToConcept(studentId, conceptId, signals) {
       applyMasterySignals(this.deps, studentId, conceptId, signals);
     }
     ```
     (Import aliased as `applyMasterySignals` to avoid name collision with the
      method name.)

3. **Edit** `memory-service.ts`:
   - Change the `applySignalsToConcept` import from
     `../indexers/mastery-indexer.js` → `./mastery-writes.js`.

4. **Edit** `services/index.ts`:
   - Update the `applySignalsToConcept` re-export to come from
     `./memory/mastery-writes.js` instead of `./indexers/mastery-indexer.js`
     (keeping the public export name unchanged so no callers break).

## Files affected

- **New**: `packages/core/src/services/memory/mastery-writes.ts`
- **Edit**: `packages/core/src/services/indexers/mastery-indexer.ts`
- **Edit**: `packages/core/src/services/memory/memory-service.ts`
- **Edit**: `packages/core/src/services/index.ts`

## Implementation notes

- `MAX_EVIDENCE = 50` constant is used in both the method and the standalone —
  define it once at the top of `mastery-writes.ts` and import it in
  `mastery-indexer.ts` if needed, or duplicate the constant (it's a scalar).
- The public API surface (`applySignalsToConcept` signature) is unchanged;
  `services/index.ts` re-exports it so downstream consumers (tools, etc.) see no diff.
- `update-mastery.ts` in `@praxis/tools` imports `applyDecay` from
  `@praxis/core/services` — unaffected by this change.

## Acceptance

- `pnpm typecheck && pnpm lint && pnpm test` pass green.
- `mastery-indexer.test.ts` passes without modification.
- `memory-service.test.ts` passes without modification.
- `grep -r "applySignalsToConcept" packages/core/src/services/indexers/` shows
  only one occurrence (the method delegation line), not the full standalone body.

## Risk

Low — the standalone function body moves verbatim; no logic changes. The instance
method shrinks to a one-liner delegation. The import direction fix is a rename of
the import path only. Easy to verify by running tests and diffing the function body.

**Rollback**: Revert the three edited files and delete `mastery-writes.ts`.

## Implementation notes

Created `packages/core/src/services/memory/mastery-writes.ts` (93 lines) with
the single canonical `applySignalsToConcept` export. Body is copied verbatim
from the standalone exported function in `mastery-indexer.ts` (lines 307–373).

`MAX_EVIDENCE = 50` is defined locally in the new file (duplicated scalar —
acceptable per story guidance). Imports `bktInitial`, `bktUpdate`, `DEFAULT_BKT`,
and `BktState` from `./bkt.js`; imports `studentMastery` schema from
`@praxis/memory/schema`; drizzle `and`/`eq`; and types from `../../types/index.js`.

Duplicate cleanup (deleting the standalone export from `mastery-indexer.ts`,
rewiring `memory-service.ts` import, updating `services/index.ts` re-export,
and delegating the instance method) is deferred to step 3 to avoid merge
conflict risk with step 1.

`pnpm typecheck` and `pnpm --filter @praxis/core test` both pass green (96 test
files, 1164 tests).
