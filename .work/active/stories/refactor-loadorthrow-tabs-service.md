---
id: refactor-loadorthrow-tabs-service
kind: story
stage: implementing
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Story: adopt loadOrThrow in tabs-service.ts

## Brief

`packages/core/src/services/tabs-service.ts` has 4+ inline
`throw new Error("... not found after insert/update: ...")` patterns
after `.insert/update/delete().run()` calls. The `load-or-throw` pattern
(documented at `.claude/skills/patterns/load-or-throw.md`,
implementation at `packages/core/src/services/_utils/load-or-throw.ts`)
provides a uniform helper for this exact shape. Adopt it consistently.

This is **pure refactor** — error message format changes from bespoke
strings to the helper's uniform shape (`"<entity> not found after <op>:
<id>"`), but error class and throw timing stay the same.

## Files

- `packages/core/src/services/tabs-service.ts` only

## Sites to convert

Verify exact line numbers during implementation; the discovery scan
found:

- `tabs-service.ts:290` — `TabsService.open: tab not found after insert: ${id}`
- `tabs-service.ts:329` — `TabsService.openDocument: tab not found after insert: ${id}`
- `tabs-service.ts:362` — `TabsService.reopen: tab not found after update: ${tabId}`
- `tabs-service.ts:380` — `TabsService.rename: tab not found after update: ${tabId}`
- Plus any other post-mutation re-fetch in the file (sweep with grep
  before edit)

The lookup-precondition throws (`session not found`, `tab not found` for
ID-not-in-DB lookups, e.g., lines 253, 342) are **different** — those are
input-validation throws, not load-after-write. Leave them as-is.

## Current State

```ts
const created = this.get(id);
if (!created || created.kind !== "session") {
  throw new Error(`TabsService.open: tab not found after insert: ${id}`);
}
return created;
```

## Target State

```ts
return loadOrThrow(
  () => this.get(id),
  { entity: "tab", op: "insert", id, log: this.deps.log },
);
```

(Confirm `loadOrThrow`'s exact signature in `_utils/load-or-throw.ts`
during implementation; adjust the predicate filter for the `kind` check.)

## Implementation Notes

- The existing `loadOrThrow` may not natively support a predicate filter
  (`kind === "session"`). If it does, use it. If not, pass through a
  loader that returns null on kind mismatch.
- Error messages will change from `"TabsService.open: tab not found
  after insert: ${id}"` to the helper's standard format. Verify no test
  asserts on the exact prior error string before changing.
- A grep for `"TabsService\." packages/` and `"tab not found"` in tests
  should surface any string-match assertions.

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (tabs-service tests)
- [ ] `grep -n 'throw new Error.*not found after' packages/core/src/services/tabs-service.ts` returns 0 results
- [ ] All four sites use `loadOrThrow`

## Risk

**Low** — pattern is well-defined, in-file refactor, narrow blast radius.

## Rollback

`git revert <commit>` — trivially clean.
