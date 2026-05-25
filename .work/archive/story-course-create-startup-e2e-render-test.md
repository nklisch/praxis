---
id: story-course-create-startup-e2e-render-test
kind: story
stage: done
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

## Review

**Verdict: done** (reviewed 2026-05-23)

All acceptance criteria met:

- `pnpm test` green: 4769 passing / 23 skipped (gated) / 0 failing across 447 files.
- The integration test mounts `<CourseCreateRoute>` inside a real `<TabsProvider>` — `useTabs` is not mocked; the router hooks (`useNavigate`, `useSearch`, `useParams`) are the only mocked surface.
- `TabBodyShell` is a clean, correctly-motivated helper that mirrors how `<ChatRoute>` renders tab bodies from `openTabs` without pulling in ChatRoute's full dep surface (tldraw, DocumentList, useMatches, etc.).
- Regression coverage is sound: if `openSessionInTab` called `client.tabs.open` directly instead of `useTabs().openTab`, `TabsProvider` state would never update, `TabBodyShell` would render nothing, and assertions 4–6 (tab body text, engine event in DOM, `session.send` call) would all fail.
- Secondary test (empty context → `session.send` not called) complements the primary test cleanly.

**Follow-up nit**: `TabBodyShell` is a local test helper scoped to this file. If future integration tests for other modes (quiz, homework, exam) need the same pattern, it would be worth extracting to `__tests__/helpers/tab-body-shell.tsx` as a parameterized helper. Not blocking — file as a backlog nit if needed.

## Implementation notes

**Test file**: `packages/ui/src/__tests__/course-create-startup-integration.test.tsx` (246 lines, 2 tests)

**Provider tree** (no useTabs mock — real TabsProvider):
- `<PraxisClientProvider>` → `<AuthProvider>` → `<TabsProvider>` → `<CourseCreateRoute>` + `<TabBodyShell>`

**`TabBodyShell`**: a thin React component that reads `openTabs` from the real `useTabs()` context and renders `<CourseCreateTabBody>` for any open course-create tabs. This mirrors what `<ChatRoute>` does in production without bringing in ChatRoute's full dependency surface (ChatRightPanel, DocumentList, tldraw, useMatches, useDocuments, useIngestion, etc.).

**What the primary test asserts**:
1. `client.session.start` called with `{ modeId: "course-create" }`
2. `client.tabs.open` called with the session id — proves the real `useTabs().openTab` path was taken (not a direct bypass)
3. `mockNavigate` called with `{ to: "/chat/$tabId" }` — proves the full openSessionInTab flow completed
4. `"Course-design assistant"` appears in the DOM — proves `CourseCreateTabBody` mounted (TabsProvider state propagated)
5. The engine response text appears in the DOM — proves: prefill → `session.send` → `model_message` event → rendered in `<AuthoringChatPane>` via `useStreamedSend`
6. `session.send` called with the exact context text — proves `consumeInitialMessage` returned the prefill

**Regression class caught**: if `openSessionInTab` called `client.tabs.open` directly (bypassing `useTabs().openTab`), `TabsProvider` state would never update, `TabBodyShell` would render nothing, `consumeInitialMessage` would never fire, `session.send` would never be called, and assertion 4–6 would fail.

**Secondary test**: verifies that with empty context, `session.send` is not called on mount (the pane opens silently, waiting for the user to type).
