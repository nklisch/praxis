---
id: gate-tests-drafts-client-stream-channel-name
kind: story
stage: drafting
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
