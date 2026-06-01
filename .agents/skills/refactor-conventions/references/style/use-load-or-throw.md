# Style Rule: use-load-or-throw

> After `.insert()`, `.update()`, or `.delete()` followed by `.run()`,
> use the `loadOrThrow(() => this.get(...), { entity, op, id, log })`
> helper to round-trip the row. Never inline
> `if (!row) throw new Error(...)`.

## Motivation

`loadOrThrow` is the project's canonical post-mutation round-trip
helper (lives in `packages/core/src/services/db-helpers.ts`; documented
under the **load-or-throw** pattern). It enforces uniform error format:
`"<entity> not found after <op>: <id>"`. Inline if-null-throw blocks
drift in two ways — error messages diverge, and some sites silently
skip the round-trip and return the partial input instead of the
freshly-loaded row.

The helper is used in ~25 services already; the holdouts are the High
Value targets.

## What Counts

A site triggers this rule when:

1. The function performs an `insert`, `update`, or `delete` followed by
   a `.run()` or `.returning()`-style call against a Drizzle table.
2. The function then needs to return the resulting row (post-write
   read).
3. The current code uses an inline `if (!row) throw new Error(...)`
   pattern instead of `loadOrThrow(...)`.

It does **NOT** apply when:

- The function returns `void` after the write (no read-back).
- The function returns `Drizzle.returning()[0]` directly (no separate
  load step).
- The function legitimately should throw a *different* error type
  (e.g., `EntityConflictError` rather than the helper's standard
  message).

## Before / After

### From this codebase: inline if-null-throw

**Before** (representative holdout pattern — sample site
`packages/core/src/services/library-service.ts:232-234`)
```ts
this.db.update(notes).set({ ... }).where(eq(notes.id, id)).run();
const row = this.get(id);
if (!row) throw new Error(`Note not found: ${id}`);
return row;
```

**After**
```ts
this.db.update(notes).set({ ... }).where(eq(notes.id, id)).run();
return loadOrThrow(
  () => this.get(id),
  { entity: "Note", op: "update", id, log: this.log },
);
```

### From this codebase: helper already in use (rule satisfied)

**Existing — `packages/core/src/services/course-create-service.ts:417`**
(after the `persistDraft` transaction)
```ts
return loadOrThrow(
  () => this.get(courseId),
  { entity: "Course", op: "persistDraft", id: courseId, log: this.log },
);
```

This is the shape every post-mutation read should land in.

## Exceptions

- **Returning the Drizzle `.returning()` row directly.** If the write
  uses `.returning()` and you return the first row, no separate load
  is needed — no rule violation.
- **`void`-returning mutations.** Delete operations that don't need to
  confirm the row's prior existence (e.g., idempotent cleanup) can
  skip the round-trip.
- **Custom error types.** If the caller needs to distinguish "not
  found after write" from "concurrent delete", a custom error class is
  acceptable — document it with a comment explaining why
  `loadOrThrow`'s standard error isn't enough.

## Scope

- **Applies to**: All service-layer files in
  `packages/core/src/services/`, `packages/curriculum/src/`, and any
  other package that holds DB write logic.
- **Does NOT apply to**:
  - Test fixtures and seed scripts.
  - Migration code in `drizzle/`.
  - One-shot CLI scripts in `scripts/`.

## Detection

```bash
rg -n --type ts -g 'packages/*/src/services/**' -g '!**/__tests__/**' \
  -B3 -e 'if\s*\(\s*!\s*\w+\s*\)\s*throw new Error'
```

The `-B3` captures the 3 lines above each `if (!x) throw new Error(...)`
to confirm it's preceded by a `.run()` or `.update()` / `.insert()` /
`.delete()` call. Filter by hand — some inline throws are legitimately
guarding non-write reads.

For High Value entries: cite `file:line`, quote the inline-throw block,
and provide the exact `loadOrThrow` replacement with the correct
`{ entity, op, id, log }` payload.
