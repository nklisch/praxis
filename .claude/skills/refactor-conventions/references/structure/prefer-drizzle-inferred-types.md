# Structure Rule: prefer-drizzle-inferred-types

> Row-shaped types that mirror a Drizzle table use `typeof table.$inferSelect`
> (or `$inferInsert`) — not a parallel hand-written interface in
> `types/`. The schema is the single source of truth.

## Motivation

`CLAUDE.md` is explicit: "Generated types take precedence over
hand-written duplicates — prefer `typeof table.$inferSelect` (Drizzle)
over a parallel hand-rolled interface." The repo audit shows
**0 uses of `$inferSelect`** and **30+ hand-rolled row interfaces** in
`packages/core/src/types/` that mirror columns in
`packages/{core,artifacts,memory,curriculum}/src/schema.ts`.

The drift cost is concrete: every time someone adds a column to the
Drizzle schema, they have to remember to update the parallel interface,
and `tsc` can't catch the omission until a consumer breaks. Inferred
types make the schema the contract.

## What Counts

A type triggers this rule when:

1. It is declared in a `types/` file (e.g.,
   `packages/core/src/types/course-state.ts`).
2. Its shape is a structural mirror of a Drizzle table elsewhere in the
   codebase — same field names, same TS-mapped column types.
3. It is named with a `Row` suffix or otherwise clearly represents the
   "selected row" shape (`ConceptStateRow`, `AssignmentRow`,
   `ConfiguratorActionRow`).

It does NOT trigger when:

- The type is a *domain* type built from multiple rows or columns
  (joins, computed fields, projections).
- The type has a deliberately narrower shape than the row (omits
  internal columns from the public API).
- The type adds normalization the inferred shape doesn't have (e.g.,
  `Date` instead of `integer mode: "timestamp_ms"`).

## Before / After

### From this codebase: hand-rolled row interface

**Before** — `packages/core/src/types/configurator.ts:49-57` (approx.)
```ts
export interface ConfiguratorActionRow {
  id: string;
  studentId: string;
  courseId: string;
  payloadJson: string;
  createdAt: number;
  appliedAt: number | null;
}
```
…and `packages/core/src/schema.ts` declares the
`configuratorActions` table with these exact columns.

**After**
```ts
import { configuratorActions } from "../schema.js";

export type ConfiguratorActionRow = typeof configuratorActions.$inferSelect;
// Insert shape:
export type ConfiguratorActionInsert = typeof configuratorActions.$inferInsert;
```

Two lines replace nine, and the next column added to the table flows
into the type automatically.

### Synthetic example: when to keep hand-rolled

A type that **omits** internal columns from a public API surface:
```ts
// Public surface — hides internal cursor + retry count.
export interface PublicAssignment {
  id: AssignmentId;
  courseId: CourseId;
  title: string;
  items: AssignmentItem[];
}
```
This is a projection, not a row-mirror. Keep it hand-rolled.

## Exceptions

- **Public API types** that intentionally hide internal columns — keep
  hand-rolled with a one-line comment naming what's hidden.
- **Composite types** that merge multiple row shapes (joins,
  aggregates) — keep hand-rolled.
- **Branded ID types** (`CourseId`, `LessonId`). These wrap `string`
  with a brand; the inferred row will be `string` and lose the brand.
  Layer the brand back in:
  ```ts
  type Raw = typeof courses.$inferSelect;
  export type CourseRow = Omit<Raw, "id"> & { id: CourseId };
  ```

## Scope

- **Applies to**: All files in `packages/*/src/types/` and any
  `types.ts` at a package root.
- **Does NOT apply to**:
  - Domain types unrelated to a DB table.
  - Wire-format types defined in `@praxis/client` (RPC contracts —
    those have their own SSOT in `docs/CONTRACT.md`).
  - Type-only re-exports.

## Detection

```bash
rg -n --type ts -g 'packages/*/src/types/**' -e 'interface \w+Row\s*\{'
```

For each match, locate the corresponding Drizzle table (grep
`schema.ts` for the table name implied by the interface). If the column
list lines up 1:1, it's a candidate for inference.

For High Value entries: cite both files (the interface and the Drizzle
table), confirm the column mapping is structural (no projections),
provide the exact `$inferSelect` replacement, and list call sites that
need re-import. Mark **Worth Considering** if the type wraps branded
IDs (`CourseId` etc.) — the `Omit<Raw, "id"> &` pattern works but adds
indirection.
