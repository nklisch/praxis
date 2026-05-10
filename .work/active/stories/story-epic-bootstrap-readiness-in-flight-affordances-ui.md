---
id: story-epic-bootstrap-readiness-in-flight-affordances-ui
kind: story
stage: implementing
tags: [ui, chat, tutor-ux]
parent: epic-bootstrap-readiness-in-flight-affordances
depends_on: []
release_binding: null
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
