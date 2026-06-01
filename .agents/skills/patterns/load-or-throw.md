# Pattern: Load-or-Throw After Service Writes

`loadOrThrow(fetch, ctx)` round-trips a freshly-written row by calling the service's reader and throwing a uniform error if it comes back null. Call once after every `db.insert(...).run()` / `db.update(...).run()` / `db.delete(...).run()` that needs to return the persisted shape — never inline the if-null-throw.

**Scope (strict)**: this pattern is for **post-write round-trips only**. It is NOT for read-side pre-condition checks. A simple `if (!row) throw new Error("X not found: ...")` after a `get(id)` lookup that isn't paired with a write is a different concern (asserting a caller's invariant, not verifying a write landed). Don't reach for `loadOrThrow` there — its error wording, observability hook, and `op` parameter all assume the row was just written.

## Rationale

Three services (`notes`, `flashcards`, `artifacts`) each performed write → re-fetch → null-check in 10 inconsistent ways: "X disappeared after insert", "X not found after update: id", "Failed to retrieve X after create: id". The helper unifies the error wording (`"<entity> not found after <op>: <id>"`) and adds a single observability hook (an optional `log?.warn("ghost-write detected", ...)`) so unexpected null-back-reads are detectable from logs in one place.

## Examples

### Example 1: NotesServiceImpl create — `packages/core/src/services/notes-service.ts`

```typescript
import { loadOrThrow } from "./db-helpers.js";

async create(input: { studentId: StudentId; format: NoteFormat; body: NoteBody; ... }): Promise<Note> {
  const id = uuidv7();
  this.deps.db.insert(notes).values({ id, ... }).run();

  return loadOrThrow(
    () => this.get({ studentId: input.studentId, noteId: brandId<"NoteId">(id) }),
    { entity: "note", op: "create", id, log: this.deps.log },
  );
}
```

### Example 2: ArtifactsServiceImpl updateLesson — closure maps row to domain type

When the existing reader is an inline `db.select()...get()` + `rowToX(row)`, push the mapping inside the closure passed to `loadOrThrow`:

```typescript
return loadOrThrow(
  async () => {
    const row = this.deps.db.select().from(lessons).where(eq(lessons.id, input.lessonId)).get();
    return row ? rowToLesson(row) : null;
  },
  { entity: "lesson", op: "update", id: input.lessonId, log: this.deps.log },
);
```

Don't add a separate "row mapper" parameter to the helper — keep its surface narrow.

### Example 3: `loadOrThrow` interface — `packages/core/src/services/db-helpers.ts`

```typescript
export async function loadOrThrow<T>(
  fetch: () => Promise<T | null>,
  ctx: {
    entity: string;
    op: "create" | "update" | "delete" | "review" | "override";
    id: string;
    log?: Logger;
  },
): Promise<T>;
// throws Error(`${entity} not found after ${op}: ${id}`) on null
// log?.warn("ghost-write detected", { entity, op, id }) before throw
```

## When to Use

- After any `db.insert/update/delete().run()` whose method returns the persisted row to the caller
- When you'd otherwise write `if (!result) throw new Error("X disappeared after Y")`

## When NOT to Use

- Reads that legitimately return `null` (e.g., a `get(id)` lookup where missing is a normal result — the caller decides what to do)
- Bulk inserts that don't round-trip individual rows
- DB writes inside services that only return `void` (e.g., `delete()` methods that don't return the deleted row)

## Common Violations

- **Inline `if (!result) throw new Error(...)`** — every such inline pattern is a candidate for `loadOrThrow`. The helper exists specifically to eliminate them; new code must not re-introduce the inline form.
- **Wrong `op` value** — pass one of the 5 enum members (`create`, `update`, `delete`, `review`, `override`), not a free-form string. The enum is small on purpose; if a sixth verb is genuinely needed, extend the enum in `db-helpers.ts`.
- **Inconsistent `entity` casing** — use lowercase singular (`"note"`, `"flashcard"`, `"course"`, `"lesson"`, `"gate"`). Matches the documented error format.
- **Forgetting `log: this.deps.log`** — the logger is optional but should always be wired in production code. Tests can omit it.
