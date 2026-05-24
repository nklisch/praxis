---
id: gate-tests-session-list-empty-excludemodeids-envelope
kind: story
stage: implementing
tags: [testing, ipc]
parent: feature-gate-tests-v0.1.4-coverage-sweep
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-23
updated: 2026-05-23
---

# `praxis.session.list` envelope doesn't cover empty `excludeModeIds: []`

## Priority
Low — from gate-tests on release v0.1.4.

## Spec reference
Item: `story-session-list-exclude-modes`
Acceptance criterion:
> `list({ excludeModeIds: [] })` — no-op; returns everything.

Also part of the IPC schema's accepted-input space.

## Gap type
missing test for boundary partition at the IPC layer

## Suggested test
```ts
it("forwards { excludeModeIds: [] } as a valid empty filter", async () => {
  const result = await handler?.({}, { excludeModeIds: [] });
  expect(result).toMatchObject({ ok: true });
  expect(capturedOpts).toEqual({ excludeModeIds: [] });
});
```

## Test location (suggested)
`packages/desktop/electron/main/__tests__/session-channel-envelope.test.ts`
