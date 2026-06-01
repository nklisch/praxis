# Pattern: Row-to-Domain Mapper

Each service that reads from Drizzle and exposes domain objects keeps a `rowToX(row: typeof tableName.$inferSelect): X` helper at file scope; consumers (CRUD methods, list queries) all pipe rows through this single function so JSON-column parsing, brand-id wrapping, and Date→Timestamp normalization happen in one place.

## Rationale

Drizzle rows expose untyped JSON columns (`fooJson: unknown`), epoch-time `Date` objects, and unbranded id strings. Without a shared mapper, every method that reads the table re-implements `brandId<"FooId">(row.id)`, `row.someJson as SomeType[]`, `row.createdAt.getTime() as Timestamp`. The single helper concentrates these adapters, so the domain-object construction is one diff to update when the schema changes.

## Examples

### Example 1: Mastery row

**File**: `packages/core/src/services/memory/mastery-row-mapper.ts:21`

```ts
export type StudentMasteryRow = typeof studentMastery.$inferSelect;

export function rowToConceptMastery(row: StudentMasteryRow): ConceptMastery {
  return {
    conceptId: brandId<"ConceptId">(row.conceptId),
    pKnown: row.pKnown / 1000,
    /* … decode milli-int, brand evidence ids, etc. */
  };
}
```

### Example 2: Lesson row

**File**: `packages/core/src/services/lessons-service.ts:265`

```ts
function rowToLesson(row: typeof lessons.$inferSelect): Lesson {
  return {
    id: brandId<"LessonId">(row.id),
    courseId: brandId<"CourseId">(row.courseId),
    title: row.title,
    conceptIds: (row.conceptIdsJson as string[]).map((id) => brandId<"ConceptId">(id)),
    references: row.referencesJson as any,
    suggestedStrategy: brandId<"StrategyId">(row.suggestedStrategy),
    estimatedMinutes: row.estimatedMinutes,
  };
}
```

### Example 3: Gate row

**File**: `packages/core/src/services/gates-service.ts:376`

### Example 4: Note / Flashcard / Sketch / Concept-Map / Draft / Course / Assignment rows

- `packages/core/src/services/notes-service.ts:336`
- `packages/core/src/services/flashcards-service.ts:216`
- `packages/core/src/services/sketch-service.ts:25`
- `packages/core/src/services/concept-map-service.ts:54`
- `packages/core/src/services/draft-store.ts:44`
- `packages/core/src/services/courses-service.ts:310`
- `packages/core/src/services/graders/submission-helpers.ts:22`

The library service goes a step further with two mappers in one file: `rowToNoteHit` and `rowToFlashcardHit` at `library-service.ts:220` and `:249`.

## When to Use

- A Drizzle table is read in 2+ methods, OR its row→domain conversion involves any of: JSON column parsing, branding, Date→Timestamp, milli-int decoding.
- The domain object is a stable shape consumed across the codebase.

## When NOT to Use

- The row IS the domain shape (no branding, no JSON columns) — pass `row` directly.
- A one-off projection (e.g. just `{ id, title }` for an autocomplete list) — keep inline.

## Common Violations

- Inlining the row→domain conversion in each query method — three copies that drift when the schema changes.
- Calling `rowToX` from outside the file — declare these `function` (not `export function`) unless reused; if a sibling helper file genuinely needs it (e.g. `graders/submission-helpers.ts:rowToAssignment` used by `assignment-service.ts`), export deliberately.
- Skipping `typeof tableName.$inferSelect` for the input type — re-typing the row shape duplicates the schema declaration.
