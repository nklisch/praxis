# Style Rule: prefer-discriminated-result-unions

> For per-item or recoverable failures in tool / mutation contracts,
> return a discriminated union — `{ ok: true, ...payload } | { ok:
> false, reason: string }` — instead of throwing. Reserve `throw` for
> programmer errors and load-after-write round-trip failures.

## Motivation

Praxis tools are dispatched by the model agent. When a tool throws, the
model sees a generic error and has no signal for *why* it failed —
"invalid arg" looks the same as "lesson already started." When a tool
returns a structured failure (`{ ok: false, reason: "lesson already
started" }`) the model can read the reason and correct course.

The dominant pattern in `packages/tools/` and the mutation paths in
`@praxis/core` is already discriminated-union results — see the
**batch-tool-per-item-results** pattern (file
`.claude/skills/patterns/batch-tool-per-item-results.md`). This rule
codifies it so new tools land in the same shape.

## What Counts

A site triggers this rule when:

1. The function is a tool handler (registered in `@praxis/tools`) OR a
   service method called via tool dispatch.
2. The failure mode is **recoverable / per-item** — caller can react,
   user can retry, or the model can adjust.
3. The current code uses `throw new Error(...)` instead of returning a
   `{ ok: false, reason }` shape.

Examples of **recoverable** failures:
- "lesson already started"
- "concept not in concept graph"
- "draft has no units yet"
- per-item validation in a batch tool

Examples of **non-recoverable** failures (keep throwing):
- DB unreachable
- post-write round-trip returns null (`loadOrThrow` territory)
- Zod schema parse failure (programmer error — handler should never
  receive bad input after dispatch validates)

## Before / After

### From this codebase: helper already in use (rule satisfied)

**Existing — `packages/core/src/services/course-create-service.ts:207`**
```ts
addConcept(input: AddConceptInput): { ok: boolean; reason?: string } {
  if (!course) return { ok: false, reason: "course not found" };
  if (concept.alreadyExists) return { ok: false, reason: "duplicate" };
  // ... mutation ...
  return { ok: true };
}
```

This is the shape every recoverable-failure tool path should land in.

### Synthetic example: tool that throws on user-recoverable failure

**Before**
```ts
async function markLessonStarted(lessonId: LessonId, ctx: ToolContext) {
  const lesson = await ctx.services.artifacts.getLesson(lessonId);
  if (lesson.startedAt != null) {
    throw new Error("Lesson already started");
  }
  // ...
  return { startedAt: now() };
}
```

**After**
```ts
async function markLessonStarted(
  lessonId: LessonId,
  ctx: ToolContext,
): Promise<
  | { ok: true; startedAt: number }
  | { ok: false; reason: "lesson_already_started" | "lesson_not_found" }
> {
  const lesson = await ctx.services.artifacts.getLesson(lessonId);
  if (lesson == null) return { ok: false, reason: "lesson_not_found" };
  if (lesson.startedAt != null) {
    return { ok: false, reason: "lesson_already_started" };
  }
  // ...
  return { ok: true, startedAt: now() };
}
```

Prefer literal-union `reason` codes so the model and downstream code
can pattern-match. Free-form strings are a fallback.

## Exceptions

- **Programmer errors** — `assert`-style invariants stay as throws.
- **Post-write round-trip failures** — use `loadOrThrow` (which throws
  a standard error). The "result union" rule is for *recoverable*
  failures the model can act on.
- **Read-only `get*` accessors** that return `null` for missing — no
  rule violation; `null` already encodes the failure.
- **Batch tools already using `{ ok, results: [...] }`** — that's the
  per-item pattern; don't refactor sideways.

## Scope

- **Applies to**: All tool handlers in `packages/tools/src/` and all
  service methods invoked through tool dispatch in
  `packages/core/src/services/`.
- **Does NOT apply to**:
  - Private helper methods inside services (free to throw).
  - IPC channel handlers (use the `ipc-envelope-handler` pattern
    instead, which wraps the `{ ok, value | error }` envelope).
  - Test code.

## Detection

```bash
rg -n --type ts -g 'packages/tools/src/**' -g 'packages/core/src/services/**' \
  -g '!**/__tests__/**' -e 'throw new Error\(' -B5
```

Filter results to the ones inside tool handlers (look for `handler:` or
`async handler(` 5 lines above). Cross-check each throw against the
**recoverable / non-recoverable** distinction in *What Counts*.

For High Value entries: cite `file:line`, quote the throw, propose the
discriminated-union return type with literal `reason` codes, and note
any callers that need updating (search for `await ctx.services.x.y(`).
