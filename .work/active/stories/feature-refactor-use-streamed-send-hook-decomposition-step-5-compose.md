---
id: feature-refactor-use-streamed-send-hook-decomposition-step-5-compose
kind: story
stage: review
tags: [refactor, ui]
parent: feature-refactor-use-streamed-send-hook-decomposition
depends_on:
  - feature-refactor-use-streamed-send-hook-decomposition-step-1-pending-queue
  - feature-refactor-use-streamed-send-hook-decomposition-step-2-streamed-bubbles
  - feature-refactor-use-streamed-send-hook-decomposition-step-3-interstitial-lifecycle
  - feature-refactor-use-streamed-send-hook-decomposition-step-4-reasoning-blocks
created: 2026-05-24
updated: 2026-05-24
---

# Step 5: Slim `useStreamedSend` to compose sub-hooks

## Goal

With all four sub-hooks extracted, collapse `useStreamedSend` to the
orchestrating shell: compose the sub-hooks, own the top-level React state
(`items`, `isStreaming`, `thinking`, `lastError`), and implement the `send()`
event loop by delegating to sub-hook APIs. The public return shape is identical
to today — no consumer changes.

## Current state

`useStreamedSend` is ~534 lines containing the full state machines.
After Steps 1–4, inline remnants of queue/bubble/interstitial/reasoning still
exist in the file (the extraction steps each leave the orchestrator updated but
there may be residual inline code if any step deferred cleanup).

## Target state

`packages/ui/src/hooks/use-streamed-send.ts` slims to:
- Type exports (unchanged — `ChatMessage`, `ToolEntryItem`, etc.)
- `useStreamedSend()` body of ~120–150 lines (from ~534)
- No per-turn local state machines — all delegated

Expected skeletal structure after composition:

```ts
export function useStreamedSend(client, opts): UseStreamedSendResult {
  const [items, setItems] = useState<ChatStreamItem[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);

  const queue = usePendingQueue();
  const bubbles = useStreamedBubbles(setItems, setThinking);
  const interstitial = useInterstitialLifecycle();
  const reasoning = useReasoningBlocks();

  const send = async (sessionId, message, sketchId?) => {
    if (isStreaming) { queue.enqueue(..., setItems); return; }

    queue.userCancelledRef.current = false;
    setLastError(null);
    // add user bubble
    setItems((prev) => [...prev, { kind: "message", ... }]);
    setIsStreaming(true);
    setThinking(true);
    bubbles.reset();
    interstitial.reset();
    reasoning.reset();

    try {
      const stream = client.session.send(sessionId, message);
      const iter = stream[Symbol.asyncIterator]();
      queue.iteratorRef.current = iter;

      while (true) {
        const r = await iter.next();
        if (r.done) break;
        const event = r.value;
        if (event.type === "user_message") continue;

        if (event.type === "thinking") {
          reasoning.onThinking(event.content, setItems);
        } else if (event.type === "model_message") {
          reasoning.closeReasoningBlock(setItems);
          if (bubbles.currentAssistantId === null) {
            bubbles.openAssistantBubble(interstitial.drainRenderables());
          }
          if (event.partial) bubbles.appendContent(event.content);
          else bubbles.setContent(event.content);
          if (bubbles.activeBubbleContentLength > 0) setThinking(false);
          if (!event.partial) bubbles.closeAssistantBubble();
        } else if (event.type === "tool_call") {
          bubbles.closeAssistantBubble();
          reasoning.closeReasoningBlock(setItems);
          interstitial.onToolCall(event, setItems);
        } else if (event.type === "tool_result") {
          setThinking(true);
          interstitial.onToolResult(event, setItems);
        } else if (event.type === "system_note") {
          bubbles.closeAssistantBubble();
          setItems((prev) => [...prev, { kind: "system-note", ... }]);
          opts?.onSystemNote?.(sessionId);
        } else if (event.type === "interrupted") {
          bubbles.closeAssistantBubble();
          reasoning.closeReasoningBlock(setItems);
          interstitial.onInterrupted();
          setThinking(false);
          setItems((prev) => [...prev, { kind: "cancel-marker", id: nextId() }]);
          break;
        } else if (event.type === "error") {
          bubbles.closeAssistantBubble();
          setThinking(false);
          setLastError(event.error.message);
          break;
        }
      }
    } catch (err) {
      setThinking(false);
      setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      queue.iteratorRef.current = null;
      bubbles.closeAssistantBubble();
      reasoning.closeReasoningBlock(setItems);
      interstitial.drainOnFinally(bubbles.lastAssistantId, setItems);
      setIsStreaming(false);
      setThinking(false);
      const next = queue.dequeueNext(setItems);
      if (next !== undefined) {
        setTimeout(() => { void send(sessionId, next.content, next.sketchId); }, 0);
      }
      queue.userCancelledRef.current = false;
    }
  };

  // clearMessages, loadHistory unchanged

  return {
    items, isStreaming, thinking, lastError,
    send, cancel: queue.cancel, cancelPending: queue.cancelPending,
    pendingCount: queue.pendingCount,
    clearMessages, loadHistory,
  };
}
```

## Files affected

- `packages/ui/src/hooks/use-streamed-send.ts` — final composition pass
- No new files in this step

## Implementation notes

- Add `bubbles.reset()` method to `useStreamedBubbles` if not already present
  (resets `activeBubbleContent`, `currentAssistantId`, `lastAssistantId`).
  Each step may or may not have added `reset()` — align during composition.
- The `cancel` returned by the hook now comes from `queue.cancel` — same
  functional contract (`userCancelledRef.current = true; iteratorRef.current?.return?.()`).
- `setItems` passed into sub-hooks is the stable dispatcher from `useState`. No
  wrapper or memoization needed.
- After composition, verify the `finally` block is at nesting depth ≤ 2 (try/catch
  at depth 1, finally at depth 2 — no nested ifs beyond the `if (next)` guard).
- Do a final `pnpm lint:fix` pass — the Biome formatter may reflow the slimmed body.

## Verification checklist (run before marking done)

```bash
pnpm typecheck
pnpm lint
pnpm test
# Visually inspect: use-streamed-send.ts should be ≤ 350 lines total
# (types + slimmed hook body); the hook body itself ≤ ~150 lines
wc -l packages/ui/src/hooks/use-streamed-send.ts
```

## Acceptance

- All existing tests in `use-streamed-send.test.tsx` pass unchanged (no test
  modifications allowed in this step).
- `useStreamedSend` hook body is ≤ 150 lines.
- `finally` block nesting depth ≤ 2.
- No inline state-machine code remains in `useStreamedSend` (all delegated to sub-hooks).
- The public `UseStreamedSendResult` type is byte-identical to today.
- `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation notes

- **File size**: 725 → 336 lines (54% reduction)
- **`useStreamedSend()` body**: ~534 → 153 lines (function start line 183, file end 336)
- **`finally` block nesting depth**: 4-5 → 2 (try/catch at depth 1, finally at depth 2, single `if (next !== null)` guard at depth 3 for queue flush)
- **Sub-hook API adjustments**:
  - `useStreamedBubbles`: changed `nextBubbleId()` prefix from `msg-` to `bubble-` to prevent id collisions with `nextId()` in use-streamed-send.ts (both were using module-level counters starting at 0 with the same prefix, causing the first user message and first assistant bubble to share `msg-1` — this caused `setContent` to update the user message's content with assistant text in tests). This was a latent bug in step 2's implementation, fixed during composition.
  - `useStreamedBubbles`: unused import removed by `biome check --write`.
  - All other sub-hook APIs consumed as-is with no changes.
- **Inline state machines removed**: `pendingQueue`, `pendingQueueRef`, `userCancelledRef`, `iteratorRef`, `cancel`, `cancelPending` (queue); `activeBubbleContent`, `currentAssistantId`, `lastAssistantId`, `openAssistantBubble()`, `closeAssistantBubble()` (bubbles); `pendingByCallId`, `interstitialFirstSeenAt`, `pendingSettleTimers`, all renderable arrays, `MIN_INTERSTITIAL_VISIBLE_MS`, `settleNow` closure (interstitial); `currentReasoningId`, `closeReasoningBlock()` (reasoning).
- **Test result**: 1711/1711 passed; `pnpm typecheck` and `pnpm lint` (our files) clean.

## Risk + Rollback

**Risk: Low** (composition of already-extracted hooks). The risk is integration:
ensuring the reset/drain call order in `send()` matches the previously tested
behavior.

**Rollback:** If integration reveals a behavioral regression, revert this step
only — the sub-hooks (Steps 1–4) remain in place for the next composition attempt.
