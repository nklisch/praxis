---
id: epic-test-coverage-adversarial-pass-state-and-config-edges-cancel-adversarial
kind: story
stage: review
tags: [testing]
parent: epic-test-coverage-adversarial-pass-state-and-config-edges
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# cancel() adversarial states — use-streamed-send.test.tsx

## Scope

Pin three previously-untested `cancel()` states in
`packages/ui/src/__tests__/use-streamed-send.test.tsx`:

1. `cancel()` after the stream finalized (idempotent no-op).
2. Double-cancel during streaming (no duplicate cancel-marker).
3. `cancel()` called during `loadHistory()` (structural no-op).

The existing test at line 985 only covers `cancel()` mid-stream and the
`cancel-before-send` no-op. The three above states are reachable in
practice (Esc + Stop button collisions, user clicks Stop after the
turn has just ended, user cancels during a history load on session
open) but unverified.

## Anchors

- Existing cancel tests: `packages/ui/src/__tests__/use-streamed-send.test.tsx:951-994`
- Hook implementation: `packages/ui/src/hooks/use-streamed-send.ts`
  (cancel at line 201, iteratorRef at 199/345/575, loadHistory at 661)

## Pattern anchors

- `ui-test-helper` — use `makeFakeClient(overrides)` for the
  client stub and wrap renders if a Provider is needed (this file
  uses bare `renderHook` since the hook takes the client explicitly).
- `tab-body-isolation` — N/A (no tab body here).

## Implementation

Add three `it(...)` blocks adjacent to the existing
`cancel-before-send` test (around line 990 of
`use-streamed-send.test.tsx`). Names and behaviors are fully
specified in the parent feature's Unit 1 section.

Each test:
- Uses `makeFakeClient({ session: { send: vi.fn(...) } })` or the
  existing `makeClient` helper in the file.
- Has a one-line `// Spec:` comment naming the structural
  invariant it pins.
- Asserts no-throw, exact `cancel-marker` count (0 for
  after-final and during-loadHistory; 1 for double-cancel).

## Acceptance criteria

- [ ] Three new `it(...)` blocks exist with these exact names:
  - `"cancel() after the stream finalized is a no-op (idempotent)"`
  - `"double-cancel during streaming produces a single cancel-marker"`
  - `"cancel() during loadHistory does not throw and does not corrupt items"`
- [ ] Each has a one-line `// Spec:` source comment.
- [ ] All three pass under
  `pnpm --filter @praxis/ui vitest run src/__tests__/use-streamed-send.test.tsx`.
- [ ] `pnpm typecheck && pnpm lint` are green from the repo root.
- [ ] No changes to `use-streamed-send.ts` (no runtime assertions).
