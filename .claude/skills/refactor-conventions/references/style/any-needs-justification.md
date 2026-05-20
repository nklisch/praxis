# Style Rule: any-needs-justification

> Every `: any` and `as any` in the codebase carries an immediately
> adjacent `// biome-ignore lint/suspicious/noExplicitAny: <reason>`
> comment naming the reason. No silent `any`.

## Motivation

`CLAUDE.md` declares the policy: "Do **not** use `any` without an
explanation comment." Audit data shows ~88 real `any` uses in
`packages/*/src/` and roughly **two-thirds lack the required
biome-ignore**. The drift is concentrated in three blind spots: JSON
deserialization casts in services, FTS5 dynamic query parameter arrays,
and tldraw / TanStack Router boundary types in the UI.

Each silent `any` is a place the type system can't help future readers.
The cost of the justification comment is trivial; the value is naming
*why* the escape hatch is safe so the next refactor doesn't widen it.

## What Counts

1. **`: any` annotations on function params, return types, locals, or
   field types** without an immediately preceding `// biome-ignore`.
2. **`as any` casts** without an immediately preceding justification
   comment.
3. **`as unknown as T` chained through `any`**, or `any as any`-style
   double-casts.
4. **`@ts-expect-error` / `@ts-ignore`** without a reason — same
   principle, separate enforcement (biome's `useTsExpectError`).

## Before / After

### From this codebase: JSON-cast drift (no biome-ignore)

**Before** — `packages/core/src/services/artifacts-service.ts:561`-ish
```ts
return {
  ...row,
  source: row.sourceJson as any,
  thresholds: row.thresholdsJson as any,
};
```

**After** — name the reason or replace the cast with a Zod parse:
```ts
return {
  ...row,
  // biome-ignore lint/suspicious/noExplicitAny: JSON column is
  // typed `CourseSource` upstream; Drizzle returns `unknown`.
  source: row.sourceJson as any,
  // biome-ignore lint/suspicious/noExplicitAny: same as above.
  thresholds: row.thresholdsJson as any,
};
```

Better: use Zod (`CourseSourceSchema.parse(row.sourceJson)`) so the
boundary is type-checked at runtime. The justification rule is the
minimum; replacing the cast is the High Value version.

### From this codebase: justified cast (rule already satisfied)

**Existing — `packages/core/src/services/library-service.ts:63-64`**
```ts
// biome-ignore lint/suspicious/noExplicitAny: FTS5 query builder
// composes WHERE clauses dynamically; param array is heterogeneous.
const conditions: any[] = [];
```

This is the shape every `any` should land in.

### From this codebase: route-param chain casts (UI)

**Before** — `packages/ui/src/routes/workspace/note-editor-page.tsx:31`
```ts
const { noteId } = useParams({ strict: false }) as any as { noteId: string };
```

**After** — either justify or replace with TanStack Router's typed
search/params (preferred):
```ts
const { noteId } = useParams({ from: "/workspace/note/$noteId" });
```

## Exceptions

- **Generated code** (e.g., from `drizzle-kit`, codegen). Mark the
  file with a header comment listing the generator.
- **`@ts-expect-error` for known TS bugs** — those use the
  `@ts-expect-error` directive, not `any`, and carry their own
  comment requirement.
- **Test files** — `any` in tests is still discouraged but not
  enforced by this rule (lighter bar; tests use `vi.fn<any>()` shapes
  often).

## Scope

- **Applies to**: All TS/TSX in `packages/*/src/` and `apps/*/src/`.
- **Does NOT apply to**:
  - `*.test.ts`, `*.test-d.ts`, `*.spec.ts`.
  - `packages/*/dist/`, `node_modules/`, generated `drizzle/meta/`.
  - `.d.ts` ambient declaration files (these often need `any` for
    third-party boundaries).

## Detection

```bash
rg -n --type ts -g 'packages/*/src/**' -g 'apps/*/src/**' \
  -g '!**/__tests__/**' -g '!**/*.test.ts' -g '!**/dist/**' \
  -B1 -e ':\s*any\b' -e '\bas any\b' \
  | rg -v 'biome-ignore'
```

The `-B1` plus the `rg -v 'biome-ignore'` filter drops the already-
justified cases. Remaining matches are the High Value list.

For each entry: cite `file:line`, quote the `any` line, propose either
(a) the justification comment text or (b) the structural fix that
removes the cast (Zod parse, typed router hook, generic parameter).
Prefer (b) when feasible.
