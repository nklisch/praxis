---
id: gate-tests-drafts-client-stream-channel-name
kind: story
stage: review
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: tests
created: 2026-05-18
updated: 2026-05-18
---

# `DraftsClient` streamBase channel name (`praxis.courseCreate.drafts.events`) has no client-side test

## Priority
Medium

## Spec reference
Item: `refactor-rename-step-4-service-and-ipc`

Acceptance criterion: "DraftsClient `events()` opens a stream against the
renamed channel and receives `snapshot` event without error (smoke test
against `pnpm dev`)." That smoke test ran manually; no automated test
exists. The wire-format atomic invariant — client and main agree on the
renamed channel — is unprotected against accidental drift (e.g., a partial
revert that changes one side). Main-side IPC tests hit
`praxis.courseCreate.drafts.events.start` but no client-side test inspects
`streamBase`.

## Gap type
missing test for wire-protocol contract

## Suggested test
```ts
// packages/client/src/__tests__/drafts-client.test.ts (new)
import { DraftsClient } from "../services/drafts-client.js";
it("opens streams against praxis.courseCreate.drafts.events (not legacy praxis.bootstrap.*)", () => {
  const transport = { stream: vi.fn().mockReturnValue((async function*() {})()) };
  const client = new DraftsClient(transport);
  client.events();
  expect(transport.stream).toHaveBeenCalledWith("praxis.courseCreate.drafts.events", undefined);
});
```

## Test location (suggested)
`packages/client/src/__tests__/drafts-client.test.ts` (new)

## Implementation notes (2026-05-18)

Created `packages/client/src/__tests__/drafts-client.test.ts` with two focused tests:

1. **Channel name pin** — asserts `transport.stream` is called with `"praxis.courseCreate.drafts.events"` (not the legacy `praxis.bootstrap.*` prefix). Confirmed the constant `C.streamBase` in `drafts-client.ts` already holds the correct post-rename value.

2. **Argument shape** — asserts the second positional arg to `transport.stream` is `undefined`, matching the `DraftsClient.events()` call signature `this.transport.stream(C.streamBase, undefined)`.

No issues discovered — the rename was already complete on both sides. The `@praxis/client` package has no `vitest.config.ts` of its own; tests run via the root `vitest.config.ts` projects array (`packages/*` glob picks it up). Tests verified to run cleanly via `pnpm vitest run --project @praxis/client`. Typecheck (`tsgo --noEmit`) and biome check both clean.
