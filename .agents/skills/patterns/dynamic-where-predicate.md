# Dynamic Drizzle Where-Predicate Accumulator

For Drizzle queries with optional filter parameters, build a mutable `eq[]`
array seeded with required predicates, conditionally `.push()` the optional
ones, and finalize with `.where(and(...predicates))` — never inline
conditional `where` calls or repeat the query.

## Rationale

Drizzle's fluent builder doesn't compose conditional `.where()` calls well
— calling `.where(...)` a second time replaces, not ANDs. The repository's
services need uniform handling of optional list/active filters
(`courseId?`, `lessonId?`, `due?`, `modeId?`, `excludeModeIds?`) without
exploding into N query variants. The accumulator-then-`and(...predicates)`
shape keeps the query body single-pass and the filter logic linear and
reviewable.

## Examples

### Example 1: session.list with `excludeModeIds`

**File**: `packages/core/src/services/session-service.ts:484`

```typescript
const predicates: ReturnType<typeof eq>[] = [eq(sessions.studentId, studentId)];
if (!includeEnded) {
  predicates.push(isNull(sessions.endedAt));
}
if (excludeModeIds.length > 0) {
  predicates.push(notInArray(sessions.modeId, excludeModeIds));
}

const rows = this.deps.db
  .select()
  .from(sessions)
  .where(and(...predicates))
  .orderBy(desc(sessions.startedAt))
  .limit(limit)
  .all();
```

### Example 2: flashcards.list with optional `conceptId` + `due` flag

**File**: `packages/core/src/services/flashcards-service.ts:113`

```typescript
const conditions = [eq(flashcards.studentId, input.studentId)];
if (input.conceptId !== undefined) conditions.push(eq(flashcards.conceptId, input.conceptId));
if (input.due === true) conditions.push(lte(flashcards.nextReviewAt, now));

const rows = this.deps.db
  .select()
  .from(flashcards)
  .where(and(...conditions))
  .orderBy(asc(flashcards.nextReviewAt))
  .limit(limit)
  .all();
```

### Example 3: episodic.query with optional session + time-range

**File**: `packages/core/src/services/memory/memory-service.ts:219`

```typescript
const conditions = [
  eq(episodicEvents.studentId, studentId),
];
if (sessionId !== undefined) {
  conditions.push(eq(episodicEvents.sessionId, sessionId));
}
if (range !== undefined) {
  conditions.push(gte(episodicEvents.ts, new Date(range.fromMs)));
  conditions.push(lte(episodicEvents.ts, new Date(range.toMs)));
}
```

Also: `packages/core/src/services/notes-service.ts:174`,
`packages/core/src/services/library-service.ts:60,150`,
`packages/core/src/services/session-service.ts:448` (`active`).

## When to Use

- The service method has one required filter (typically `studentId`) and
  1+ optional filters that all `AND` together.
- The shape of the resulting SQL differs only by which `AND` clauses are
  present.
- Optional filters need to apply *before* `LIMIT` (so `limit` counts only
  matching rows).

## When NOT to Use

- The query has no optional filters — go straight to
  `.where(and(eq(...), eq(...)))`.
- Filters change query *shape* (e.g. require joining a different table)
  — split into separate methods instead.
- Filters need to OR together — `and(...predicates)` is wrong; use
  `or(...)` or restructure.

## Common Violations

- Inlining a chain of `.where().where()` calls — Drizzle replaces, not
  ANDs.
- Branching into multiple `db.select().from().where(...)` query
  expressions per filter combination — explodes O(2^n) and breaks
  `limit` semantics.
- Building a JS array of rows and filtering in app code after `.all()` —
  defeats `limit` and pushes work to memory.
