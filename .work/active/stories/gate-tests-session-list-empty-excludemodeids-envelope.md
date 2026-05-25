---
id: gate-tests-session-list-empty-excludemodeids-envelope
kind: story
stage: review
tags: [testing, ipc]
parent: feature-gate-tests-v0.1.4-coverage-sweep
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-23
updated: 2026-05-25
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

## Implementation notes (2026-05-25)

Added test `"forwards { excludeModeIds: [] } as a valid empty filter (no-op boundary partition)"` in the `"praxis.session.list — excludeModeIds filter"` describe block of `packages/desktop/electron/main/__tests__/session-channel-envelope.test.ts`.

The test verifies:
- `{ excludeModeIds: [] }` is accepted as valid input (envelope returns `ok: true`).
- The empty array is forwarded to the service as `{ excludeModeIds: [] }` (not dropped).

The session-channel handler uses `opts.excludeModeIds !== undefined` to decide whether to spread the value — `[]` is not `undefined`, so it is included in the forwarded opts. Behavior confirmed correct, no production code change needed.

All tests pass (`pnpm test`).
