---
id: story-course-create-startup-e2e-render-test
kind: story
stage: implementing
tags: [testing, ui]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# Course-create startup: end-to-end render assertion

## Brief
The fix for `epic-course-create-readiness-startup-invisible` (commit 700a0b5)
landed strong unit-level tests for `openSessionInTab` and the
`consumeInitialMessage` store/consume semantics, plus mocked `useTabs` tests
for the route. But the story brief explicitly asked for "a focused test that
opens a course-create session and asserts the chat tab body renders the
first engine event" — the integration-level assertion that closes the loop
from `session.start` all the way to a rendered engine event in
`AuthoringChatPane`.

Add a test that:

1. Mounts `<CourseCreateRoute>` inside a real `<TabsProvider>` (no `useTabs`
   mock) wrapped in `<PraxisClientProvider>` with `makeFakeClient`.
2. Drives the "Start Praxis →" CTA with a non-empty context.
3. Asserts the chat tab body mounts in the chat route and the fake client's
   `session.send` stream emits one event that renders in the DOM.

This is the regression test that would have caught the original bug at the
integration layer (the unit-level tests would have passed even with the
broken `client.tabs.open` direct-call shape, because they mocked the
useTabs).

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` green
- New test exists that fails if `client.tabs.open` is bypassed (i.e. the
  original 700a0b5 regression class is caught at the integration layer)
- Test mounts `<CourseCreateRoute>` inside a real `<TabsProvider>` (no
  `useTabs` mock) wrapped in `<PraxisClientProvider>` with `makeFakeClient`
- Test drives "Start Praxis →" and asserts the chat tab body mounts and
  renders at least one engine event from the fake client's `session.send`
  stream
