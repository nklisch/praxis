---
id: feature-agent-transparency-ux-stream-pacing
kind: story
stage: implementing
tags: [ui, chat]
parent: feature-agent-transparency-ux
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
---

# Stream pacing — min-visible tool interstitials + thinking reasoning block + near-bottom scroll

## Scope

Implements Units 1 + 2 of `feature-agent-transparency-ux`. Both are bounded
changes to `use-streamed-send` and a small new component (`ReasoningBlock`).
Combined here because they share test surface (`use-streamed-send.test.tsx`)
and the same `ChatStreamItem` discriminated union.

## Files to touch

- `packages/ui/src/hooks/use-streamed-send.ts`
- `packages/ui/src/components/reasoning-block.tsx` (new)
- `packages/ui/src/components/reasoning-block.module.css` (new)
- `packages/ui/src/components/chat-tab-body.tsx`
- `packages/ui/src/hooks/__tests__/use-streamed-send.test.tsx`
- `packages/ui/src/components/__tests__/reasoning-block.test.tsx` (new)

## Acceptance Criteria

### Tool interstitial pacing
- [ ] `ToolInterstitial` interface has a `firstSeenAt: number` field, populated on `tool_call`.
- [ ] When `tool_result` arrives before `MIN_INTERSTITIAL_VISIBLE_MS` (800) elapses, the interstitial's transition to `settled` is scheduled via `setTimeout`.
- [ ] When `tool_result` arrives after the threshold, settle is immediate.
- [ ] Cancelling a turn (`cancel()` or `interrupted` event) clears all pending settle timers.
- [ ] `finally` clause also drains pending timers.

### Scroll heuristic
- [ ] Auto-scroll-to-bottom in `chat-tab-body.tsx` only fires when the messages container is within 80px of the bottom (`scrollHeight - scrollTop - clientHeight ≤ 80`).
- [ ] When the user has scrolled up >80px, new items do not yank the view to the bottom.

### Thinking event handler + reasoning block
- [ ] `ChatStreamItem` includes a `kind: "thinking"` variant with `{ id, content, streaming }`.
- [ ] When `event.type === "thinking"` arrives:
  - If no reasoning block is open, open one with the event's content.
  - If one is open, append the event's content to it.
- [ ] When `tool_call`, `model_message`, or stream end occurs, the active reasoning block closes (`streaming: false`); it remains in the items list.
- [ ] New `<ReasoningBlock content streaming />` component renders a faint italic summary line ("thinking about <summary>…" while streaming; "thought about <summary>" once closed).
- [ ] Summary heuristic: first sentence/clause, stripped of markdown chars, truncated to ~60 chars.
- [ ] Click on summary toggles expansion; expanded shows the full reasoning content.
- [ ] No line count is shown in the summary line (anti-numeric per VISION).
- [ ] When the engine emits NO thinking events (Claude Code today), no reasoning block appears.
- [ ] Existing `<ThinkingIndicator>` dots behavior is preserved (still shown when `thinking === true` and no content has arrived).

### Tests
- [ ] `use-streamed-send.test.tsx` covers: fast-tool pacing, slow-tool immediate settle, cancel drains timers, thinking event accumulation, thinking close on tool_call / model_message, multiple non-contiguous reasoning blocks in one turn.
- [ ] `reasoning-block.test.tsx` covers: empty content, summary truncation, expand/collapse interaction.
- [ ] `chat-tab-body.test.tsx` (new or extended) covers: scroll-when-near-bottom and don't-scroll-when-scrolled-up.

## References

- Design: `.work/active/features/feature-agent-transparency-ux.md` (Units 1 + 2)
- Existing patterns: `async-generator-event-stream`, `discriminated-union-dispatch`
- Existing tests reference: `packages/ui/src/components/__tests__/thinking-indicator.test.tsx`

<!-- Implementation Notes accumulate here as work progresses. -->
