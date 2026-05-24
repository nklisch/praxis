---
id: feature-refactor-use-streamed-send-hook-decomposition-step-3-interstitial-lifecycle
kind: story
stage: implementing
tags: [refactor, ui]
parent: feature-refactor-use-streamed-send-hook-decomposition
depends_on: []
created: 2026-05-24
updated: 2026-05-24
---

# Step 3: Extract `useInterstitialLifecycle`

## Goal

Consolidate the tool-call interstitial tracking, pacing timers
(`MIN_INTERSTITIAL_VISIBLE_MS`), renderable-result harvesting, and settle drain
into `useInterstitialLifecycle`. This is the richest extraction: it spans four
distinct responsibilities bundled in the `tool_call` and `tool_result` handlers
(lines 444–583) and the `finally` block (lines 619–656).

## Current state (in `use-streamed-send.ts`)

Per-turn local variables declared inside `send()`:

```ts
const pendingByCallId = new Map<string, string>();            // callId → toolName
const interstitialFirstSeenAt = new Map<string, number>();   // callId → Date.now()
const pendingSettleTimers = new Map<string, {                 // callId → {timer, settleNow}
  timer: ReturnType<typeof setTimeout>;
  settleNow: () => void;
}>();

// Renderable accumulation arrays:
const pendingCitations: RetrievalCitation[] = [];
const pendingDrafts: ProposedCourse[] = [];
const pendingNotes: Note[] = [];
const pendingDueCards: ReviewCard[] = [];
```

These are referenced across:
- `tool_call` handler (lines 444–476): push interstitial item, record `firstSeenAt`
- `tool_result` handler (lines 477–583): settle sub-agent, start pacing timer
  or `settleNow()`, harvest renderables
- `interrupted` handler (lines 593–601): `clearTimeout` + `pendingSettleTimers.clear()`
- `finally` block (lines 619–656): drain timers with `settleNow()`, drain renderables
  into `lastAssistantId` bubble

## Target state

New file: `packages/ui/src/hooks/use-interstitial-lifecycle.ts`

```ts
export interface InterstitialApi {
  /**
   * Register a tool_call. Pushes a visible tool-entry or sub-agent item.
   * Hidden tools (label.hidden) get no item but are still tracked in pendingByCallId.
   */
  onToolCall: (event: ToolCallEvent, setItems: SetItems) => void;
  /**
   * Register a tool_result. Settles the matching tool-entry (with pacing),
   * settles sub-agent items immediately, and harvests renderables.
   * Returns any newly harvested renderables so the caller can pass them to
   * openAssistantBubble if it opens one in this same event batch.
   */
  onToolResult: (event: ToolResultEvent, setItems: SetItems) => BubbleRenderables;
  /**
   * Called on `interrupted`. Clears all pending pacing timers (no settleNow —
   * cancelled turns leave in_flight interstitials as-is per the spec).
   */
  onInterrupted: () => void;
  /**
   * Called in finally. Drains all remaining pacing timers by firing settleNow()
   * immediately, then merges any unattached renderables into lastBubbleId.
   * lastBubbleId is null if no assistant bubble opened during this turn.
   */
  drainOnFinally: (lastBubbleId: string | null, setItems: SetItems) => void;
  /**
   * Snapshot of accumulated renderables not yet attached to a bubble.
   * Used by bubble-open sites to drain at open time.
   */
  readonly pendingRenderables: BubbleRenderables;
  /**
   * Consume (drain) all pending renderables, returning them and clearing
   * the internal accumulator. Called by the bubble hook's openAssistantBubble
   * to attach to the new bubble.
   */
  drainRenderables: () => BubbleRenderables;
}

export function useInterstitialLifecycle(): InterstitialApi
```

The per-turn Maps (`pendingByCallId`, `interstitialFirstSeenAt`, `pendingSettleTimers`)
and renderable arrays become fields in a single `useRef`-held object, reset at
the start of each turn via a `reset()` call.

## Turn reset protocol

`useStreamedSend.send()` calls `interstitial.reset()` at the top of each turn
(before `client.session.send`) so that state from a previous turn doesn't
bleed into the next. This replaces the current "declared inside `send()`" pattern.

```ts
// In send(), before try:
interstitial.reset();
```

`reset()` clears all maps and arrays, cancels any leftover timers.

## Renderable-drain interaction with bubble hook

The intended call sequence at a `model_message` open site:

```ts
const renderables = interstitial.drainRenderables();
bubbles.openAssistantBubble(renderables);
```

And in `drainOnFinally`:

```ts
interstitial.drainOnFinally(bubbles.lastAssistantId, setItems);
```

`drainOnFinally` merges the accumulated renderables into the last bubble (patching
`citations`, `drafts`, `notes`, `dueCards` onto the existing item) exactly as the
current finally-block code does.

## Files affected

- `packages/ui/src/hooks/use-interstitial-lifecycle.ts` — new file
- `packages/ui/src/hooks/use-streamed-send.ts` — replace tool_call/tool_result
  inline logic, interrupted timer clear, and finally drain with hook calls

## Implementation notes

- `MIN_INTERSTITIAL_VISIBLE_MS = 800` constant moves to `use-interstitial-lifecycle.ts`.
- `pendingByCallId` and `interstitialFirstSeenAt` are purely internal — not part
  of the API.
- The `settleNow` closure is created inside `onToolResult` and stored alongside
  its timer in the internal map, just as today.
- `setItems` is passed at call time (not captured at hook construction) for the
  same reason as in the bubble hook — avoids stale closures.
- Sub-agent items are settled in `onToolResult` immediately (no pacing). The
  sub-agent settle `setItems` call stays in `onToolResult`.
- The `getToolLabel` import stays in this hook — it's only needed here.

## Acceptance

- All existing tests in `use-streamed-send.test.tsx` pass unchanged, including:
  - Tool interstitial pacing tests (MIN_INTERSTITIAL_VISIBLE_MS section)
  - Citation/draft/note/dueCard placement tests (Unit 3 section)
  - Concurrent tool_calls with different callIds settle correctly
  - cancel (interrupted) leaves interstitials in_flight
  - Finally drain fires settleNow for fast tools
- `pnpm typecheck && pnpm lint && pnpm test` green.

## Risk + Rollback

**Risk: Medium.** This hook owns the most branchy logic. The renderable-drain
interplay with the bubble hook (drainRenderables at open time vs. drainOnFinally)
must preserve the existing placement rules. The timer callbacks close over `setItems`
passed at `onToolResult` time — ensure no stale-dispatch issue.

**Rollback:** Revert new file and restore inline code in `use-streamed-send.ts`.
