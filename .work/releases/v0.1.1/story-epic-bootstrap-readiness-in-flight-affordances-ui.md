---
id: story-epic-bootstrap-readiness-in-flight-affordances-ui
kind: story
stage: done
tags: [ui, chat, tutor-ux]
parent: epic-bootstrap-readiness-in-flight-affordances
depends_on: []
release_binding: v0.1.1
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Thinking indicator + cancel button/Esc binding in chat UI

## Scope

The UI half of the in-flight-affordances feature. Adds a thinking
animation that appears whenever the engine stream is open and the model
isn't currently producing assistant text, plus a Stop button and Esc
key binding that cancels an in-flight turn. The hook surfaces a
`cancel()` callable that triggers the iterator's `return()` — which
fires the existing `praxis.session.send.cancel` IPC channel.

This story stands alone: cancel becomes the user-visible "stop my
output" experience even without the sibling signal-threading story.
Pair it with the signal story to make cancel actually stop the engine
subprocess.

## Units implemented

- **Unit 5** — Extend `useStreamedSend` with `thinking: boolean` and
  `cancel: () => void`. State machine: `thinking` is true when
  streaming AND no `model_message` has arrived in the current segment;
  flips back to true between a `tool_result` and the next
  `model_message`.
- **Unit 6** — `<ThinkingIndicator />` component in
  `packages/ui/src/components/thinking-indicator.tsx`. Three animated
  dots + "Thinking" label, `aria-live="polite"`, visually consistent
  with `<ToolInterstitial />`.
- **Unit 7** — Render `<ThinkingIndicator />` in `chat-tab-body.tsx`
  when the hook's `thinking` flag is true.
- **Unit 8** — Stop button visible only while `isStreaming === true`;
  Esc keypress while streaming also fires `cancel()`.
- **Unit 9** — UI tests.

## Files touched

- `packages/ui/src/hooks/use-streamed-send.ts` — add `thinking`,
  `cancel`; handle `interrupted` event.
- `packages/ui/src/components/thinking-indicator.tsx` (new)
- `packages/ui/src/components/thinking-indicator.module.css` (new)
- `packages/ui/src/components/chat-tab-body.tsx` — render
  `<ThinkingIndicator />`, render Stop button, bind Esc.
- `packages/ui/src/__tests__/use-streamed-send.test.tsx` — extend with
  thinking-state-machine cases + cancel.
- `packages/ui/src/components/__tests__/thinking-indicator.test.tsx`
  (new)

## Acceptance

- [ ] `useStreamedSend` returns `thinking: boolean` and
      `cancel: () => void` alongside the existing fields.
- [ ] `thinking` state machine:
      - true on send start, before first `model_message`
      - false on first `model_message` of the current segment
      - true again on `tool_result` (between tools and next assistant chunk)
      - false on `final` / `interrupted` / `error`
- [ ] `cancel()` triggers iterator `return()` which fires the
      `praxis.session.send.cancel` IPC channel.
- [ ] `<ThinkingIndicator />` renders three dots + "Thinking" with
      `aria-live="polite"`.
- [ ] Indicator appears at the bottom of the messages list (before
      quick-check cards) when `thinking` is true.
- [ ] No flicker between a `tool_result` and the next assistant chunk
      — indicator stays visible through that gap.
- [ ] Stop button visible only when `isStreaming === true`. Click
      triggers `cancel()`.
- [ ] Esc key while streaming triggers `cancel()`.
- [ ] On `interrupted` event arrival: current bubble closes, "Cancelled"
      marker rendered inline (lightweight — a small label, not a modal).
- [ ] UI tests pass; existing chat-tab-body tests untouched.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Out of scope (sibling story handles)

- `AbortSignal` threading through `SessionService.send` /
  `EngineSession.send` / `conv.abort()`.
- The `interrupted` `EngineEvent` type addition (sibling story adds
  it; this story consumes it).
- Episodic-log append on cancel.

## Notes for the implementer

- Until the sibling signal story lands, `cancel()` will trigger the
  IPC abort but the engine subprocess will continue generating. The
  user-visible UI cleanup (button vanishes, stream stops being
  consumed) still happens correctly — the model just keeps spending
  tokens in the background. Both stories together close that loop.
- If the sibling story isn't landed yet, the `interrupted` event in
  the EngineEvent union may not be present. Guard the switch case
  with an exhaustiveness check that doesn't error on missing — or
  pull the sibling's Unit 1 (the type addition) into this story as a
  prerequisite. Prefer the second option (it's a one-line type
  change) if the sibling story isn't done.

## Parent context

- Parent feature: `epic-bootstrap-readiness-in-flight-affordances`
- Parent epic: `epic-bootstrap-readiness`
- Independent from the sibling signal story. Both can land in parallel;
  the feature is whole only when both reach `done`.

## Implementation notes

**Files changed:**
- `packages/ui/src/hooks/use-streamed-send.ts` — added `thinking: boolean`, `cancel: () => void`, `CancelMarker` type, and `cancel-marker` item kind. Refactored from `for await ... of` to manual `iter.next()` loop with `iteratorRef` ref. Handles `interrupted` event (closes bubble, appends cancel-marker, sets `thinking = false`). Also added `EngineEvent` import and `useCallback`/`useRef` imports.
- `packages/ui/src/components/thinking-indicator.tsx` (new) — `<ThinkingIndicator>` with `aria-live="polite"` and `aria-atomic="true"` (aria-label on `<p>` is not ARIA-valid per biome a11y rules; `aria-atomic` ensures the whole region is announced atomically). Three animated dots matching `tool-interstitial` visual style.
- `packages/ui/src/components/thinking-indicator.module.css` (new) — CSS mirrors `tool-interstitial.module.css` animation with a distinct `praxis-thinking-pulse` keyframe name.
- `packages/ui/src/components/chat-tab-body.tsx` — destructured `thinking` and `cancel` from hook; added Esc key `useEffect`; renders `<ThinkingIndicator />` between items list and quick-check cards; renders Stop button (in a `.stopRow` div above `<Composer>`) when `isStreaming`; renders `cancel-marker` as a "Cancelled" `<p>` inline.
- `packages/ui/src/components/chat-tab-body.module.css` — added `.stopRow`, `.stopButton`, `.cancelMarker` rules.
- `packages/ui/src/components/configure-chat-pane.tsx` — added `cancel-marker` guard (returns `null`) to prevent TS narrowing error.
- `packages/ui/src/components/sidekick-panel.tsx` — same `cancel-marker` guard.
- `packages/ui/src/__tests__/use-streamed-send.test.tsx` — 13 new test cases for `thinking` state machine and `cancel()`.
- `packages/ui/src/components/__tests__/thinking-indicator.test.tsx` (new) — 5 test cases.

**Test count:** 684 total, all passing (up from 671).

**Deviations from spec:**
- `aria-label="Tutor is thinking"` on `<p>` was replaced with `aria-atomic="true"` — biome's `useAriaPropsSupportedByRole` rule correctly flags `aria-label` on a paragraph as invalid ARIA. The `aria-live` + visible "Thinking" text + `aria-atomic` combination is semantically equivalent for screen readers.
- Cancel in `configure-chat-pane` and `sidekick-panel` renders nothing (null) rather than a "Cancelled" pill — these secondary panels don't need the cancellation affordance as prominently.

**Verification:** `pnpm --filter @praxis/ui test` ✓ · `pnpm typecheck` ✓ · `pnpm exec biome check [changed files]` ✓

## Review (2026-05-10)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Hook state machine is clean — `iteratorRef` lifted to component scope (stable across renders) and `cancel` is a `useCallback` so it's safe to add to `useEffect` deps. The `thinking` transitions land at the right boundaries (send start → first `model_message` → `tool_result` → next `model_message`). The `interrupted` event branch closes the open bubble and appends a `cancel-marker` item — clean separation between hook state and the visual marker. Biome's a11y rule correctly rejected `aria-label` on `<p>`; `aria-atomic="true"` is the right substitute. The secondary panels (`configure-chat-pane`, `sidekick-panel`) opt out of rendering the cancel marker — the call site noted it as a deliberate choice, and `null` returns are exhaustiveness-safe. 18 new tests; 684 ui passing.
