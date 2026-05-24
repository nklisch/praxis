---
id: feature-refactor-use-streamed-send-hook-decomposition
kind: feature
stage: implementing
tags: [refactor, ui]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-24
---

# Decompose `useStreamedSend` hook into focused sub-hooks

## Brief
`packages/ui/src/hooks/use-streamed-send.ts` is 725 lines built around one 534-line
hook function. Inside, it owns multiple distinct state machines:
- Pending message queue (lines ~202–241)
- Bubble lifecycle / splitting
- Tool call tracking + interstitial settle timers (with `MIN_INTERSTITIAL_VISIBLE_MS`)
- Reasoning block accumulation
- Citation / draft / note / card draining
- 80+ line `finally` block doing abort + timeout flush + pending replay (4–5 levels of nesting)

This concentration of responsibilities makes the hook hard to reason about, hard to test
in isolation, and a likely host of latent state-machine bugs in the finally block.

## Refactor target
Extract focused sub-hooks composed by a thinned `useStreamedSend`:
- `usePendingQueue(...)` — queue state + flush primitives
- `useStreamedBubbles(...)` — bubble open/close/split lifecycle
- `useInterstitialLifecycle(...)` — tool call → interstitial settle timers, MIN_INTERSTITIAL_VISIBLE_MS
- `useReasoningBlocks(...)` — reasoning accumulation + close behavior
- (Optionally) a `useStreamedSendCleanup(...)` that owns the finally-block concerns

The remaining `useStreamedSend` becomes the orchestrator that composes these and exposes
the public hook return shape unchanged.

## Constraints
- The hook's external API must stay identical — every consumer keeps working without edits.
- The streaming behavior — bubble splitting, tool interstitial settling, abort semantics —
  must be preserved bit-for-bit; this is a perception-sensitive surface.
- Per the `tab-body-isolation` pattern, inactive `<ChatTabBody>` instances are hidden via
  `display:none` (not unmounted), so any in-flight streams in dormant tabs must keep
  working under the new structure.

## Discovery evidence
- File length: 725 lines (verified)
- `useStreamedSend()` body: ~534 lines
- Finally block: nesting depth 4–5 (lines ~297–370)
- Multiple distinct state machines bundled

## Refactor Overview

`useStreamedSend` bundles five distinct state machines in one 534-line function body:

| Machine | Current location | Lines |
|---|---|---|
| Pending queue | `pendingQueue` state + refs + `cancel` / `cancelPending` | 210–241, 665–692 |
| Bubble lifecycle | `activeBubbleContent` + `openAssistantBubble` / `closeAssistantBubble` | 283–357 |
| Interstitial pacing + renderables | `pendingByCallId`, `interstitialFirstSeenAt`, `pendingSettleTimers`, renderable arrays | 291–312, 444–583, 619–656 |
| Reasoning blocks | `currentReasoningId` + `closeReasoningBlock` | 305, 359–369 |
| Orchestration / event loop | `send()` body + `finally` | entire |

**Extraction strategy**: Each sub-hook exposes an imperative API (callbacks /
closures, not React state). The per-turn mutable locals (`currentAssistantId`,
`pendingByCallId`, etc.) move into `useRef`-held objects inside each sub-hook,
reset at the start of each turn. `setItems` is passed at call time (not captured
at construction) so there are no stale-closure issues. `useStreamedSend` stays
the only hook with `useState` — sub-hooks are pure orchestration facilitators.

## Refactor Steps

### Step 1 — `usePendingQueue` (Priority: High, Risk: Low)

Extract the pending-queue state machine: `pendingQueue` React state,
`pendingQueueRef`, `userCancelledRef`, `iteratorRef`, `cancel()`, `cancelPending()`,
and the auto-flush logic from the `finally` block.

**New file**: `packages/ui/src/hooks/use-pending-queue.ts`

Key API:
- `enqueue(msg, setItems)` — queues a message, appends pending-message item
- `cancelPending(id, setItems)` — removes from queue and item list
- `cancel()` — sets `userCancelledRef.current = true`, calls `iter.return()`
- `dequeueNext(setItems)` — reads queue ref, dequeues first entry, returns it
- `iteratorRef` — write-through for `send()` to set the active iterator
- `pendingCount` — derived from `pendingQueue.length`

### Step 2 — `useStreamedBubbles` (Priority: High, Risk: Low-Medium)

Extract bubble open/close/split lifecycle: `activeBubbleContent`,
`currentAssistantId`, `lastAssistantId`, `openAssistantBubble()`,
`closeAssistantBubble()`.

**New file**: `packages/ui/src/hooks/use-streamed-bubbles.ts`

Key design: renderable-drain is CALLER'S responsibility — `openAssistantBubble`
accepts an optional `renderables` argument rather than closing over mutable
arrays. Per-turn locals become a single `useRef` object, reset via `reset()`.

Key API:
- `openAssistantBubble(renderables?)` — opens bubble, drains renderables into it
- `closeAssistantBubble()` — marks open bubble `streaming: false`
- `appendContent(delta)` / `setContent(content)` — update active bubble
- `activeBubbleContentLength` — for the thinking-guard check
- `currentAssistantId` / `lastAssistantId` — read-only
- `reset()` — called at turn start

### Step 3 — `useInterstitialLifecycle` (Priority: High, Risk: Medium)

Extract tool-call interstitial tracking, pacing timers, sub-agent settle, and
renderable harvesting/draining.

**New file**: `packages/ui/src/hooks/use-interstitial-lifecycle.ts`

Key design: `MIN_INTERSTITIAL_VISIBLE_MS` constant moves here. Per-turn Maps and
renderable arrays live in `useRef`, reset via `reset()`. The `settleNow` closure
(capturing `callId`, `isErrored`, `outputValue`, `errorMsg`, `setItems`) is
stored in `pendingSettleTimers` exactly as today.

Key API:
- `onToolCall(event, setItems)` — pushes tool-entry / sub-agent item, records timestamps
- `onToolResult(event, setItems)` — settles sub-agent, starts pacing or settles immediately, harvests renderables
- `onInterrupted()` — clears pacing timers (no settle — cancelled turns leave in_flight)
- `drainOnFinally(lastBubbleId, setItems)` — fires `settleNow()` for all remaining timers; merges leftover renderables into `lastBubbleId`
- `drainRenderables()` — consume + return pending renderables (called at bubble-open time)
- `reset()` — clears all maps and arrays, cancels any orphaned timers

### Step 4 — `useReasoningBlocks` (Priority: Medium, Risk: Low)

Extract reasoning-block accumulation: `currentReasoningId`,
`closeReasoningBlock()`, and the `thinking` event open/append logic.

**New file**: `packages/ui/src/hooks/use-reasoning-blocks.ts`

Key API:
- `onThinking(content, setItems)` — open new block or append to active one
- `closeReasoningBlock(setItems)` — marks active block `streaming: false`
- `reset()` — clears `currentReasoningId`

### Step 5 — Compose `useStreamedSend` (Priority: High, Risk: Low)

Depends on Steps 1–4 all complete. Slim `useStreamedSend` to a ~120–150 line
orchestrating shell that composes the four sub-hooks.

Target `finally` block depth: ≤ 2 (currently 4–5). Target file length: ≤ 350
lines total (from 725). Hook body length: ≤ 150 lines (from ~534).

## Implementation Order

Steps 1–4 are **parallel-eligible** — they each extract an orthogonal concern
and do not depend on each other. Step 5 (composition) depends on all four.

```
Wave 1 (parallel):
  step-1-pending-queue
  step-2-streamed-bubbles
  step-3-interstitial-lifecycle
  step-4-reasoning-blocks

Wave 2 (sequential, after Wave 1):
  step-5-compose
```

Each extraction step (1–4) updates `use-streamed-send.ts` to call the new hook.
Because they are parallel, each implementer works on a separate concern in the
file. To avoid merge conflicts: each step's changes to `use-streamed-send.ts`
should be minimal — just adding the hook call and removing the inlined code for
that specific machine. The composition step (5) does the final cleanup pass.

**Merge order recommendation** if working serially: 4 → 1 → 2 → 3 → 5
(smallest to largest, reasoning first to warm up, interstitial last before compose).

## Tricky decisions

1. **`setItems` at call time vs. capture at construction**: Passed at each call
   site to avoid stale closures in async timer callbacks. React guarantees
   `useState` setters are stable identity references, so this is zero-cost.

2. **Renderable drain protocol**: `drainRenderables()` is pull-based (caller
   calls it before opening a bubble). This is cleaner than push-based because it
   avoids the sub-hook needing a reference to the bubble hook.

3. **`reset()` on per-turn refs**: Each sub-hook exposes `reset()` called at
   turn start. This replaces the "declared inside `send()`" pattern and is
   necessary to prevent state bleed across turns when the same hook instance
   services multiple sequential sends.

4. **`nextId()` sharing**: The `nextId()` counter (module-level in
   `use-streamed-send.ts`) may need to be shared with sub-hooks (especially
   `useReasoningBlocks`). Evaluate at implementation: either lift to a shared
   module or accept that each module has its own counter (ids just need to be
   unique within a session's item list, not globally ordered).

5. **Tab-body isolation**: No change needed. Sub-hooks use `useRef` and
   `useState` from the same React instance as `useStreamedSend`. Each
   `ChatTabBody` mount gets its own isolated call stack. Dormant tabs (`display:none`)
   keep their hook state alive exactly as before.
