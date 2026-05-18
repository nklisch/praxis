---
id: refactor-loadorthrow-tabs-service
kind: story
stage: done
tags: [refactor]
parent: null
depends_on: []
release_binding: v0.1.3
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

## Implementation notes

### Sites converted (4 total)

1. **`open()` — post-insert session tab** (was line 288-292): replaced with `loadOrThrow` using an async predicate closure that filters `t.kind === "session"` before returning, so kind-narrowing stays inside the contract and the return type is `SessionTabSummary` without a cast.

2. **`openDocument()` — post-insert document tab** (was line 327-331): same shape as above but `t.kind === "document"`, returning `DocumentTabSummary`.

3. **`reopen()` — post-update tab** (was line 360-364): direct `loadOrThrow(() => this.get(tabId), { entity: "tab", op: "update", id: tabId, log })`. No kind filtering needed — returns `TabSummary`.

4. **`rename()` — post-update tab** (was line 378-382): same shape as `reopen`.

### Import added

```ts
import { loadOrThrow } from "./db-helpers.js";
```

### op values used

- Post-insert sites: `op: "create"` (the enum has no `"insert"`).
- Post-update sites: `op: "update"`.

### Test updates

None required. Grep of `packages/core/src/services/__tests__/` and `tests/` found zero assertions on the prior bespoke error strings.

### Verification

- `pnpm --filter @praxis/core typecheck` — clean (desktop errors are pre-existing, verified by stash test).
- `pnpm biome check packages/core/src/services/tabs-service.ts` — clean after auto-format.
- `pnpm vitest run packages/core/src/services/__tests__/tabs-service.test.ts` — 25/25 passed.
- `grep -n 'throw new Error.*not found after' packages/core/src/services/tabs-service.ts` — 0 results.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Clean adoption of the canonical `load-or-throw` pattern across 4 post-mutation sites. The kind-narrowing closure for `open()` / `openDocument()` (`return t && t.kind === "session" ? t : null`) preserves type safety inside the `loadOrThrow` contract — neat. Error message format shifted to uniform helper format (intentional per story spec; verified no test depends on prior bespoke strings). Tests 25/25 pass unmodified.
