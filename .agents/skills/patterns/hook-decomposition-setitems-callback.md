# Pattern: Hook Decomposition with setItems-Callback Passing

When a complex stateful hook (e.g. `useStreamedSend`) grows beyond ~300 LoC and has independent state slices, split it into N small sub-hooks that each own one slice plus a stable imperative API. Pass the parent's `setItems` (or other shared state setters) into the sub-hook's API methods at call time, NOT at hook construction, so async closures never read stale setters.

## Rationale

The original `useStreamedSend` mixed pending-queue, streamed-bubbles, interstitial-lifecycle, and reasoning-blocks state into one 500+ line hook. The refactor split each slice into a dedicated hook that owns its state and exposes an imperative API. Because the parent's `setItems` is needed inside long-running async loops, passing it at call time (not capturing at sub-hook construction) makes the sub-hook agnostic to which item list it mutates and avoids stale-closure bugs from `setItems` being captured at an earlier render.

## Examples

### Example 1: usePendingQueue

**File**: `packages/ui/src/hooks/use-pending-queue.ts:81`

```ts
const enqueue = useCallback((msg: PendingMessage, setItems: SetItems): void => {
  setPendingQueue((prev) => [...prev, msg]);
  setItems((prev) => [...prev, { kind: "pending-message", id: msg.id, /* ... */ }]);
}, []);
```

`SetItems` is `React.Dispatch<React.SetStateAction<ChatStreamItem[]>>`.

### Example 2: useStreamedBubbles

**File**: `packages/ui/src/hooks/use-streamed-bubbles.ts:36`

```ts
appendContent: (delta: string, setItems: SetItems) => void;
setContent: (content: string, setItems: SetItems) => void;
```

### Example 3: useReasoningBlocks

**File**: `packages/ui/src/hooks/use-reasoning-blocks.ts:20`

```ts
onThinking: (content: string, setItems: SetItems) => void;
closeReasoningBlock: (setItems: SetItems) => void;
```

### Example 4: useInterstitialLifecycle

**File**: `packages/ui/src/hooks/use-interstitial-lifecycle.ts:62`

```ts
onToolCall: (event: ToolCallEvent, setItems: SetItems) => void;
onToolResult: (event: ToolResultEvent, setItems: SetItems) => BubbleRenderables;
drainOnFinally: (lastBubbleId: string | null, setItems: SetItems) => void;
```

### Example 5: composition in useStreamedSend

**File**: `packages/ui/src/hooks/use-streamed-send.ts:199`

```ts
const queue = usePendingQueue();
const bubbles = useStreamedBubbles(setItems, setThinking);
const interstitial = useInterstitialLifecycle();
const reasoning = useReasoningBlocks();
// ...
queue.enqueue(entry, setItems);
bubbles.appendContent(event.content, setItems);
interstitial.onToolCall(event, setItems);
reasoning.onThinking(event.content, setItems);
```

`useBatchIngestion` at `packages/ui/src/hooks/use-batch-ingestion.ts:56` follows the same `(setState, ingestOneWithResult, getState) => result` shape, receiving the parent's stable setters/getters and exposing an imperative API.

## When to Use

- A hook is approaching 300+ LoC and contains independent state slices each with their own event handlers.
- The slices share a downstream effect (here: `setItems` for chat-item updates) but otherwise own different state.
- Tests would benefit from rendering a sub-hook in isolation.

## When NOT to Use

- The hook is small and has one cohesive concern — splitting just shuffles boilerplate.
- The sub-hooks would need to call each other in deeply intertwined ways — a single hook may be clearer.
- The setter is global / context-derived — pull it from context inside the sub-hook instead.

## Common Violations

- Capturing `setItems` in the sub-hook's constructor instead of passing per call — leads to stale-closure bugs the first time the parent re-renders.
- Returning a callback that the parent must wrap in `useCallback` to keep stable — instead, wrap it inside the sub-hook with `useCallback([])` and return the stable callback directly.
- Coupling sub-hooks together (e.g. `useStreamedBubbles` knowing about `usePendingQueue`) — sub-hooks are independent; the parent composes them.
