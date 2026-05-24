---
id: feature-refactor-memory-service-bkt-extraction-step-1-row-mapper
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-memory-service-bkt-extraction
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 1 — Extract `rowToConceptMastery` row mapper

## Problem

The milli-int → float conversion + `brandId` wrangling for `studentMastery` rows is
copy-pasted in three places inside `MemoryServiceImpl`:

- `studentModel()` lines 69–93: full `ConceptMastery` shape with decay
- `getMastery()` lines 467–484: full `ConceptMastery` shape (no decay at this call site)
- `read()` lines 606–609: inline decay-aware scalar read

The field math (`row.pKnown / 1000`, `row.uncertainty / 1000`, `row.lastPracticedAt?.getTime()`,
`brandId<"ConceptId">`, `(row.evidenceJson as string[]).map(...)`) must match exactly across
all three — any future schema change or precision adjustment must be updated in all three places.

## Target

Add a pure helper function in
`packages/core/src/services/memory/mastery-row-mapper.ts`:

```ts
// Returns the stored ConceptMastery WITHOUT decay applied.
// Decay is a read-time concern; callers apply it after if needed.
export function rowToConceptMastery(row: StudentMasteryRow): ConceptMastery
```

Where `StudentMasteryRow` is `typeof studentMastery.$inferSelect`.

`MemoryServiceImpl`:
- `studentModel()`: call `rowToConceptMastery(row)` then apply `applyDecay` on the
  returned `pKnown` to get `effectivePKnown` (same behavior, just factored).
- `getMastery()`: call `rowToConceptMastery(row)` directly — already stores
  `effectivePKnown` as the read-time milli value (no decay call needed here).
- `read()`: call `rowToConceptMastery(row).pKnown` then `applyDecay` (same as before).

## Files affected

- **New**: `packages/core/src/services/memory/mastery-row-mapper.ts`
- **Edit**: `packages/core/src/services/memory/memory-service.ts`

## Implementation notes

- `StudentMasteryRow` can be inferred via `typeof studentMastery.$inferSelect` imported
  from `@praxis/memory/schema` — do not hand-write the type.
- The mapper returns `ConceptMastery` without `effectivePKnown` override (uses stored
  `row.effectivePKnown / 1000`). The `studentModel()` caller then overwrites
  `effectivePKnown` with the decay-computed value — same observable output as before.
- No change to DB schema, indexes, or write paths.

## Acceptance

- `pnpm typecheck && pnpm lint && pnpm test` pass green.
- `memory-service.test.ts`, `memory-service-mastery-reader.test.ts`, and
  `memory-service-configurator-writes.test.ts` all pass without modification.
- Mastery values returned by `studentModel()`, `getMastery()`, and `read()` are
  bit-for-bit identical (confirmed by existing tests).

## Risk

Low — pure mechanical extraction. No logic change, only factoring repeated field
access into a single function. Easy to verify by diff inspection.
