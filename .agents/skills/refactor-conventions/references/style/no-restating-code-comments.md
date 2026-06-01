# Style Rule: no-restating-code-comments

> A comment must explain WHY, not WHAT. If a comment paraphrases the
> next line — or the next block — delete it and let well-named
> identifiers carry the meaning.

## Motivation

Restating-the-code comments are the most common form of comment rot in
Praxis. They look like documentation but add zero information: the line
underneath already says the same thing. Worse, they decay independently
of the code — the comment lies first, then the next reader trusts the
comment over the code. The repo's own house rule is "Default to writing
no comments. Only add one when the WHY is non-obvious." Restating
comments violate the default.

## What Counts

A comment is **restating** when removing it changes nothing about a
careful reader's understanding. The usual shapes:

1. **Paraphrasing the next statement.**
   `// loop over items` above `for (const item of items)`.
   `// set up the registry` above `const registry = new Registry()`.
2. **Method banners that repeat the signature.**
   `// Get the course by id` above `getCourse(id: CourseId): Course`.
3. **Section dividers that label the obvious.**
   `// --- imports ---` above the import block.
4. **JSDoc that just names the parameter.**
   `@param id The id` is noise; `@param id Stable UUID — used as the
   episodic-log foreign key` is signal.

A comment is **explanatory** (keep it) when it captures something the
code can't: a hidden invariant, a non-obvious constraint, a workaround
pinned to an external behavior, or the *reason* a counter-intuitive
branch exists.

## Before / After

### Synthetic example: paraphrased loop

**Before**
```ts
// Iterate concept ids and dispatch a registration for each
for (const conceptId of conceptIds) {
  await registerConcept(conceptId);
}
```

**After** — delete the comment.

### Synthetic example: signature-paraphrasing JSDoc

**Before**
```ts
/**
 * Get a course by its id.
 * @param id The course id.
 * @returns The course.
 */
async function getCourse(id: CourseId): Promise<Course> { ... }
```

**After**
```ts
async function getCourse(id: CourseId): Promise<Course> { ... }
```

Keep the JSDoc only if it adds something the signature doesn't — error
contract, caller-visible side effect, ordering guarantee.

### From this codebase: structural section comments that aren't load-bearing

`packages/core/src/services/course-create-service.ts:50` —
`// Resolves to the user's currently selected engine.` above a typed
field whose name already says "selectedEngine" carries little signal.
Compare to genuine explanatory comments around the `load-or-throw`
sites: those name the failure mode (`"<entity> not found after <op>"`)
which is real signal.

## Exceptions

Keep when the comment carries information the code cannot:

- **Hidden invariants.** `// caller must hold the indexer lock before
  reading turnFloor`.
- **Workarounds tied to external behavior.** `// QuickJS WASM
  truncates stack traces > 64 frames — log original here`.
- **Counter-intuitive branch rationale.** `// keep the empty-array
  branch first; toolNames === [] means "all available"`.
- **Public-API JSDoc that adds beyond the signature** (error contracts,
  side effects, performance characteristics).
- **TypeScript `// @ts-expect-error <reason>`** and the `any` policy's
  `// biome-ignore` justifications — covered by their own rules.

## Scope

- **Applies to**: All TS/TSX in `packages/*/src/` and `apps/*/src/`,
  including JSDoc on internal (non-exported) functions.
- **Does NOT apply to**:
  - JSDoc on exported public API surfaces — keep even if minimal,
    because LSP shows it on hover.
  - `// biome-ignore`, `// @ts-expect-error`, `// eslint-disable-*`,
    `// @ts-ignore` comments — these are directives, not prose.
  - Test files (`*.test.ts`) — `it("legacy flow")` and similar are
    behavior descriptions, not restating-the-code.

## Detection

This rule is hard to grep cleanly — most matches need human judgment.
The cheap heuristics:

```bash
rg -n --type ts -g 'packages/*/src/**' -g '!**/__tests__/**' \
  -B0 -A1 -e '^\s*//\s+[A-Z][a-z]' \
  | rg -B1 'function|const|let|for|if|=>'
```

This finds short prose comments followed by a code line. Most matches
are noise; scan the list manually and surface the obvious paraphrases.
For High Value entries: cite `file:line`, quote both the comment and the
line it precedes, and propose `delete` unless the comment can be
rewritten to add WHY.
