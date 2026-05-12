---
id: feature-agent-transparency-ux-stream-pacing
kind: story
stage: done
tags: [ui, chat]
parent: feature-agent-transparency-ux
depends_on: []
release_binding: v0.1.1
gate_origin: null
created: 2026-05-11
updated: 2026-05-12
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

## Implementation Notes

### What landed

**Tool interstitial pacing (`MIN_INTERSTITIAL_VISIBLE_MS = 800`)**

- Added `firstSeenAt: number` field to `ToolInterstitial` interface.
- Added a JS-side `interstitialFirstSeenAt: Map<string, number>` inside `send()` to avoid React state read-back (the peek pattern with `setItems(prev => { ...; return prev })` is an anti-pattern).
- `pendingSettleTimers` stores `{ timer, settleNow }` so the `finally` drain can call the original `settleNow` closure (which correctly carries the `errored` flag from the event).
- When `tool_result` arrives: if `elapsed >= 800ms`, settle immediately; else schedule `setTimeout(settleNow, remaining)`.
- `interrupted` branch: `clearTimeout(timer)` + clear map — interstitials stay `in_flight` on cancel (timer is gone, turn is done).
- `finally` drain: for any remaining pending timers (normal completion with fast tool), `clearTimeout(timer)` then call `settleNow()` immediately so no `in_flight` items survive stream end.
- `episodic-to-messages.ts` updated to set `firstSeenAt: 0` for historical interstitials (no pacing needed on replay).

**Scroll heuristic (80px near-bottom threshold)**

- Added `messagesContainerRef` alongside existing `messagesEndRef` in `TeachChatTabBody`.
- Replaced the unconditional `messagesEndRef.current?.scrollIntoView(...)` with a conditional: only fires when `scrollHeight - scrollTop - clientHeight <= 80`.
- Attached `ref={messagesContainerRef}` to the `.messages` div.

**Thinking event handler + `<ReasoningBlock>` component**

- `ChatStreamItem` extended with `kind: "thinking"` variant backed by `ReasoningItem { id, content, streaming }`.
- `send()` loop: new `thinking` event branch — opens a new reasoning block (if none open) or appends to the active one. `continue` skips to next event.
- `closeReasoningBlock()` helper called at the start of `model_message` and `tool_call` branches, and in the `interrupted` branch + `finally`.
- New `reasoning-block.tsx` component: `<ReasoningBlock content streaming />`. Default collapsed; click toggles expansion. Live dot (`·`) while streaming. Summary via `summarize()` helper (strips markdown, takes first clause, 60-char truncation).
- New `reasoning-block.module.css` with editorial restraint matching `tool-interstitial.module.css`.
- `chat-tab-body.tsx`: added `kind: "thinking"` render branch before `cancel-marker`; imported `<ReasoningBlock>`.
- `configure-chat-pane.tsx` and `sidekick-panel.tsx`: added `kind: "thinking"` fallthrough guards (return null) to preserve exhaustive type narrowing before the `MessageBubble` fallthrough.

### Deviations from design

- **`summarize()` splits on sentence boundaries BEFORE whitespace collapse.** The design snippet applies `replace(/\s+/g, " ")` first, then splits on `\n`. This loses newline as a sentence boundary. The implemented order (split on `/[.!?\n]/` first, then clean) correctly treats newlines as clause boundaries.
- **`pendingSettleTimers` stores `{ timer, settleNow }` instead of just timer ID.** The design snippet stores only the timeout handle. Storing the closure avoids duplicating the `errored` flag logic in the `finally` drain.
- **`interstitialFirstSeenAt` is a plain Map, not read from React state.** The design suggests peeking via `setItems(prev => { ...; return prev })`. This is an anti-pattern. The JS-side Map is cleaner and avoids StrictMode double-invocation issues.

### Verification

- `pnpm --filter @praxis/ui typecheck` — clean
- `pnpm --filter @praxis/ui test` — 739 tests pass (36 new tests added)
- `pnpm typecheck` (workspace) — clean
- Pre-existing `claude-cli-sdk` lint warnings are unchanged (not caused by this PR)

## Review (2026-05-12)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- Diff at commit `8fc1d2f`: solid implementation of all three concerns (pacing, reasoning block, scroll heuristic).
- The in-closure `interstitialFirstSeenAt` Map (parallel to `ToolInterstitial.firstSeenAt`) avoids React-state read-back; both Maps drain symmetrically in `interrupted` and `finally`. Stored `settleNow` closure preserves the `errored` flag through the timer.
- `closeReasoningBlock` is idempotent — `interrupted` → `finally` double-close is a safe no-op.
- The `finally` drain fires pending `settleNow`s immediately on normal stream completion, which is correct: holding `in_flight` post-stream would just leave visual cruft.
- 36 new tests cover fast/slow tool pacing, cancel cleanup, thinking-event accumulation, reasoning-block close on tool_call/model_message, multiple non-contiguous reasoning blocks, and scroll-when-near-bottom / don't-scroll-when-up.
- `ToolInterstitial.firstSeenAt` is mandatory; agent correctly updated `bubble-boundary-parity.test.ts` comparisons and added `kind: "thinking"` guards in `configure-chat-pane.tsx` / `sidekick-panel.tsx`.

Approved and advancing to done.
