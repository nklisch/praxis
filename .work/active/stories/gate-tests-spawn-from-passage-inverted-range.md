---
id: gate-tests-spawn-from-passage-inverted-range
kind: story
stage: implementing
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
