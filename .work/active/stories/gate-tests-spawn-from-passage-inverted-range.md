---
id: gate-tests-spawn-from-passage-inverted-range
kind: story
stage: done
tags: [testing, security]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: tests
created: 2026-05-18
updated: 2026-05-18
---

# `SpawnFromPassageSchema` accepts `endOffset < startOffset` at the IPC trust boundary

## Priority
High

## Spec reference
Item: `epic-backend-fills-for-redesign-document-viewer-citations-and-spawn`

Acceptance criterion: implicit-but-spec'd via Unit 3 — "Accept optional
`passageRange: { startOffset, endOffset }` on attach/upsert" — and the
citations-channel-envelope test that DOES validate "returns
`VALIDATION_FAILED` for negative startOffset"
(`citations-channel-envelope.test.ts:161`). The equivalent record-citation
schema enforces it, but `SpawnFromPassageSchema` at
`packages/desktop/electron/main/session-channel.ts:118-124` only checks
`int().nonnegative()`. The service then silently clamps to an empty passage
at `session-service.ts:639-640` — violating "opens a session with the
passage in the agent's opening context."

## Gap type
boundary case / adversarial-spec-silent (validation inconsistency across two
range-bearing channels)

## Suggested test
```ts
// packages/desktop/electron/main/__tests__/spawn-from-note-channel-envelope.test.ts
it("returns VALIDATION_FAILED when endOffset < startOffset", async () => {
  registerIpcHandlers(services, () => null, log);
  const handler = handlers.get("praxis.session.spawnFromPassage");
  const result = await handler?.({},
    { documentId: "doc-001", range: { startOffset: 50, endOffset: 10 } });
  expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_FAILED" } });
});
```

Plus the schema tightening: add `.refine(r => r.endOffset >= r.startOffset, ...)`
on the inner range object in `SpawnFromPassageSchema`.

## Test location (suggested)
`packages/desktop/electron/main/__tests__/spawn-from-note-channel-envelope.test.ts`
and `packages/desktop/electron/main/session-channel.ts` schema

## Implementation notes (2026-05-18)

### Changes made

1. **`packages/desktop/electron/main/session-channel.ts`** — Added `.refine((r) => r.endOffset >= r.startOffset, { message: "endOffset must be >= startOffset" })` on the inner range object in `SpawnFromPassageSchema` (around line 125). Used `>=` (not `>`) because `startOffset == endOffset` is a zero-length point-in-text cursor position and is not inherently nonsensical at the schema boundary; the service already handles that gracefully.

2. **`packages/desktop/electron/main/__tests__/spawn-from-note-channel-envelope.test.ts`** — Added test "returns VALIDATION_FAILED when endOffset < startOffset" in the existing `praxis.session.spawnFromPassage — envelope wiring` describe block. The test hits the registered handler via the real IPC harness with `{ startOffset: 50, endOffset: 10 }` and asserts `{ ok: false, error: { code: "VALIDATION_FAILED" } }`. Total test count: 13 tests, all pass.

### Implementation discovery

**Citation schema asymmetry (do not fix here — scope creep).** The `recordCitation` schema in `packages/desktop/electron/main/citations-channel.ts` (lines 17–24) only validates `int().nonnegative()` on `startOffset` and `endOffset` — it does **not** have a `.refine` for inverted ranges (`endOffset < startOffset`). The citations channel test at line 161 only tests for "negative startOffset" (i.e., the `nonnegative()` constraint) and never tests the inverted-range case. This is an analogous validation gap. A follow-up story should add the same `endOffset >= startOffset` refine to `recordSchema` in `citations-channel.ts` and a corresponding test to `citations-channel-envelope.test.ts`.

### Verification

- `pnpm vitest run packages/desktop/electron/main/__tests__/spawn-from-note-channel-envelope.test.ts` → 13/13 pass
- `pnpm --filter @praxis/desktop typecheck` → pre-existing error in `session-service.ts:42` (`IndexerOrchestrator | undefined` not assignable) exists on main before this change; no new errors introduced

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Schema refine added (endOffset >= startOffset) to SpawnFromPassageSchema. IPC test confirms VALIDATION_FAILED with startOffset:50/endOffset:10. The citation schema asymmetry follow-up is noted and appropriately deferred (out of scope for this story). 13/13 tests pass.
