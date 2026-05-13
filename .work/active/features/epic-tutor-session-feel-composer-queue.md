---
id: epic-tutor-session-feel-composer-queue
kind: feature
stage: review
tags: [ui, chat, tutor-ux]
parent: epic-tutor-session-feel
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Composer queue while streaming — keep typing, send when it's your turn

## Brief

The composer locks while the tutor is streaming
(`packages/ui/src/components/chat-tab-body.tsx:325`:
`disabled={isStreaming || examLockdown}`), so a follow-up thought is lost
unless the user remembers to retype it after the turn ends. There's no
queue, no draft preservation across the lock, no visual signal that "the
tutor is busy, but I can still type."

This feature decouples typing+submission from `isStreaming`. The composer
is typable any time. Submitting during a streaming turn enqueues the
message instead of locking it out: queued messages render in the thread
as pending bubbles (visually distinct from sent / delivered), the user can
see and (at design time TBD) edit or cancel them while pending, and the
queue flushes automatically when the engine turn ends. The exam-mode
lockdown still locks the composer hard — that's a different concern.

## Epic context

- Parent epic: `epic-tutor-session-feel`
- Position in epic: independent UI/state feature — wave 1, parallelizable
  with the three other children.

## Foundation references

- `docs/ARCHITECTURE.md:343` — chat surface description; this feature
  changes the composer's interaction model within the existing surface.

## Anchors

- Composer component — `packages/ui/src/components/composer.tsx:44-132`
  (`disabled` prop; send button gated at line 125; `Enter` submit at
  line 102-107; send button render at line 125-127)
- Streaming state — `packages/ui/src/hooks/use-streamed-send.ts:127-537`
  - State declarations — lines 128-134
  - Send entry guard `if (isStreaming) return` — line 141
  - `setIsStreaming(true)` — line 156
  - `finally` cleanup — end of function (resets isStreaming/thinking)
  - Cancel — lines 136-138 (`iteratorRef.current?.return?.()`)
- Composer mount — `packages/ui/src/components/chat-tab-body.tsx:80`
  (calls `useStreamedSend(client)`), `:325` (`disabled` prop expression)
- ChatStreamItem discriminated union — somewhere in
  `packages/ui/src/hooks/episodic-to-messages.ts` (the `kind:
  "message" | "interstitial" | "thinking" | ...` shape)
- User message persistence (server-side) — unchanged

## Design decisions (resolved by epic + autopilot)

From the epic-design resolutions:
- **Pending render location**: inline in the thread at the position the
  message will occupy on flush. Visually marked (e.g., faded + a
  `▶ PENDING` tag or similar editorial mark).
- **Flush semantics**: separate turns — each queued message becomes its
  own engine turn. Preserves temporal structure.
- **Cancellation**: allowed via per-bubble × affordance before flush.
- **Edit-while-pending**: NOT supported in v1 — cancel and retype if you
  want to revise.

Resolved by autopilot:
- **Queue state location**: lives inside `useStreamedSend` (the hook
  already owns send-flow state). Adds two state fields:
  `pendingQueue: PendingMessage[]` and exposes a `cancelPending(id)`
  callback. The queue is per-hook-instance — since each
  `<ChatTabBody>` mounts its own `useStreamedSend`, queues are
  per-tab, which is correct: a queued message in tab A doesn't flush
  when tab B's turn ends.
- **Pending item shape**: extend `ChatStreamItem` with a new
  `kind: "pending-message"` variant. Carries `id`, `content`,
  optional `sketchId`. Distinct kind so the renderer dispatches a
  styled pending bubble (rather than overloading the existing
  `message` kind with a `pending: boolean` flag — a new kind reads
  better at every dispatch site and surface).
- **Cap**: no hard cap on pending count for v1. If the user wants 50
  queued messages, that's their call. (Soft UX consideration: the
  thread visually shows the buildup; if it becomes a problem we add
  a cap later.)
- **Flush mechanism**: in the `send()` finally block, after the
  cleanup that resets `isStreaming` to false, check if
  `pendingQueueRef.current` is non-empty. If so, schedule the next
  message via `setTimeout(..., 0)` so React commits state first,
  then invoke `send(sessionId, message, sketchId)` recursively. Each
  recursive call goes through the same path (will pile up its own
  pending if user submits again mid-flush) — no special "I'm
  flushing" mode needed.
- **Cancel-mid-flush behavior**: when the user clicks Stop during a
  turn AND there are pending messages, the queue is preserved (not
  flushed) so the user can decide whether to remove them or let them
  flush on the next user action. Rationale: clicking Stop signals
  "interrupt this train of thought" — auto-flushing queued messages
  defeats the intent. The pending bubbles remain visible until the
  user manually removes them (×) or starts a new turn (next send
  triggers the queue flush).
- **Persistence**: pending queue is NOT persisted across app restart.
  In-flight UI state only. Rationale: the queue is ephemeral by
  intent; if the user closes the app mid-stream, they've signaled
  intent to leave — restoring pending messages on relaunch would
  surprise them.

## Architectural choice

**State lives in `useStreamedSend`; rendering goes through the existing
`ChatStreamItem` union with a new `"pending-message"` kind.** Cleanly
extends the established pattern; no new context, no new top-level
component, no new IPC surface. The send flow's existing `try/finally`
shape is the natural place to flush.

Two alternatives rejected:
- *Separate `usePendingQueue` hook composed alongside `useStreamedSend`.*
  Splits state that's tightly coupled to the send lifecycle across two
  hooks; complicates the cancel-on-stream-end semantics. Reject.
- *Render pending in a dedicated zone above the composer.* Resolved
  against at epic-design — pending inline reads as conversation
  continuing.

## Implementation Units

### Unit 1: `PendingMessage` type + `ChatStreamItem` extension

**File**: `packages/ui/src/hooks/episodic-to-messages.ts` (or wherever
the `ChatStreamItem` union lives — verify during impl)

Add a new variant:

```typescript
export interface PendingMessageItem {
  kind: "pending-message";
  id: string;
  role: "user";        // always user; tutor doesn't queue
  content: string;
  sketchId?: SketchId;
}

export type ChatStreamItem =
  | MessageItem        // existing
  | InterstitialItem   // existing
  | ThinkingItem       // existing
  // … plus new:
  | PendingMessageItem;
```

The new kind is **not** produced by `episodicToItems` — pending messages
exist only in live UI state, never persist to episodic.

**Acceptance Criteria**:
- [ ] `ChatStreamItem` includes the new variant.
- [ ] Exhaustive `switch` checks (if any) handle the new kind.

---

### Unit 2: Queue state in `useStreamedSend`

**File**: `packages/ui/src/hooks/use-streamed-send.ts`

Add state + handlers:

```typescript
interface PendingMessage {
  id: string;
  content: string;
  sketchId?: SketchId;
}

// Inside the hook:
const [pendingQueue, setPendingQueue] = useState<PendingMessage[]>([]);
const pendingQueueRef = useRef<PendingMessage[]>([]);
// Mirror state to ref so the finally block reads the latest value
// without depending on closure capture timing.
useEffect(() => {
  pendingQueueRef.current = pendingQueue;
}, [pendingQueue]);

const cancelPending = useCallback((pendingId: string): void => {
  setPendingQueue((prev) => prev.filter((p) => p.id !== pendingId));
  setItems((prev) =>
    prev.filter((it) => !(it.kind === "pending-message" && it.id === pendingId)),
  );
}, []);
```

Extend the result type:

```typescript
export interface UseStreamedSendResult {
  items: ChatStreamItem[];
  isStreaming: boolean;
  thinking: boolean;
  lastError: string | null;
  send: (sessionId: SessionId, message: string, sketchId?: SketchId) => Promise<void>;
  cancel: () => void;
  cancelPending: (pendingId: string) => void;     // new
  pendingCount: number;                            // new (derived: pendingQueue.length)
  clearMessages: () => void;
  loadHistory: (sessionId: SessionId) => Promise<void>;
}
```

(`pendingCount` is convenient for parent components that need to react
to queue depth — e.g., for the cancel-all affordance if added later.
Cheap; just `pendingQueue.length`.)

**Acceptance Criteria**:
- [ ] Hook returns the new fields.
- [ ] `cancelPending(id)` removes the bubble + queue entry atomically.

---

### Unit 3: Modify `send()` to queue when streaming

**File**: `packages/ui/src/hooks/use-streamed-send.ts` (replace the
`if (isStreaming) return` block at line 141)

```typescript
const send = async (
  sessionId: SessionId,
  message: string,
  sketchId?: SketchId,
): Promise<void> => {
  if (isStreaming) {
    // Queue instead of dropping.
    const pendingId = nextId();
    const entry: PendingMessage = {
      id: pendingId,
      content: message,
      ...(sketchId !== undefined && { sketchId }),
    };
    setPendingQueue((prev) => [...prev, entry]);
    setItems((prev) => [
      ...prev,
      {
        kind: "pending-message",
        id: pendingId,
        role: "user",
        content: message,
        ...(sketchId !== undefined && { sketchId }),
      } satisfies PendingMessageItem,
    ]);
    return;
  }

  // … existing send logic unchanged …
```

The composer call site updates to pass `sketchId` through — current
composer already calls `onSend(message, sketchId)` so the wire-up just
threads `sketchId` into `send()`.

**Acceptance Criteria**:
- [ ] Submitting while `isStreaming=true` adds a pending entry to the
      queue AND a `pending-message` item to the thread.
- [ ] Pending bubbles render in the order they were submitted.
- [ ] Returning from `send()` while queueing doesn't trigger any
      network call.

---

### Unit 4: Auto-flush in `finally`

**File**: `packages/ui/src/hooks/use-streamed-send.ts` — end of the
existing `try/finally` block.

Append to the finally cleanup (after the existing `setIsStreaming(false)`
and friends):

```typescript
} finally {
  iteratorRef.current = null;
  setIsStreaming(false);
  setThinking(false);
  // … existing settle-timer drain, error capture, etc. …

  // Auto-flush next pending message (if any). Schedule via
  // setTimeout(0) so React commits the just-finished turn's items
  // before we kick off the next send.
  const queue = pendingQueueRef.current;
  if (queue.length > 0) {
    const [next, ...rest] = queue;
    pendingQueueRef.current = rest;
    setPendingQueue(rest);
    setItems((prev) =>
      prev.filter((it) => !(it.kind === "pending-message" && it.id === next.id)),
    );
    setTimeout(() => {
      // Fire-and-forget. The recursive send() goes through the same
      // path; if the user submits again during this turn, the queue
      // grows again.
      void send(sessionId, next.content, next.sketchId);
    }, 0);
  }
}
```

`sessionId` is in scope from the outer `send()` arguments.

**Implementation Notes**:
- The recursive `void send(...)` call is intentional — each queued
  message becomes a fully independent turn.
- If a turn fails mid-flight (`error` event), `finally` still runs
  and still triggers the flush. Decision: do we flush after an
  error? Yes — the user's queued messages aren't connected to the
  failed turn. If the error is persistent, subsequent turns will
  also fail and the user can stop the chain via `cancel()` or
  `cancelPending()`.
- If the user clicked Stop mid-turn (cancel via
  `iteratorRef.current?.return?.()`), the finally block still
  runs — but per the design decision above, we DO NOT auto-flush
  after a user-initiated cancel. Detection: track a
  `userCancelled` boolean alongside the abort, set in `cancel()`,
  cleared at the start of `send()`. Check it in finally:
  ```typescript
  if (!userCancelledRef.current && queue.length > 0) { /* flush */ }
  userCancelledRef.current = false;
  ```

**Acceptance Criteria**:
- [ ] When the engine turn naturally ends with queued messages, the
      first queued message is dequeued and sent as a new turn.
- [ ] If the user clicked Stop, pending messages stay in the queue.
- [ ] Multiple queued messages flush sequentially (each becomes its
      own turn).

---

### Unit 5: Composer + tab body wiring

**File**: `packages/ui/src/components/chat-tab-body.tsx:325`

Replace:
```typescript
disabled={isStreaming || examLockdown}
```
With:
```typescript
disabled={examLockdown}
```

The composer is enabled whenever exam-mode lockdown is off — streaming
no longer locks input.

Also wire up the cancel-pending callback to the renderer that draws
pending bubbles. The `<ChatStream>` (or equivalent component that maps
items to bubbles) needs the callback. Pass through:

```typescript
<ChatStream
  items={items}
  // … existing props …
  onCancelPending={cancelPending}  // new
/>
```

And the bubble renderer adds an `×` button on `kind: "pending-message"`
items that calls `onCancelPending(item.id)`.

**File**: `packages/ui/src/components/composer.tsx` — no change to
the component itself. Its `disabled` prop now reflects only exam
lockdown (or other future hard-locks).

**Acceptance Criteria**:
- [ ] Composer accepts input while `isStreaming === true`.
- [ ] Send button submits while streaming → pending bubble appears.
- [ ] × on a pending bubble removes it (queue + thread both).
- [ ] Exam mode still locks input (regression check).

---

### Unit 6: Pending bubble styling

**File**: a new CSS module or extension to the existing chat-bubble
styles (likely `packages/ui/src/components/chat-stream.module.css` or
similar — verify during impl).

Visual treatment for `kind: "pending-message"`:
- Same overall bubble shape as a sent user message.
- Reduced opacity (~0.55) to mark "not yet delivered."
- Small inline tag/chip: `▶ PENDING` rendered in the same italic-serif
  treatment as `ModeMeta.deck` text (consistent typography family).
- `×` close button at the trailing edge of the bubble.

Match the editorial primitives pattern — no new colors; reuse the
existing chat-bubble palette with opacity reduction.

**Acceptance Criteria**:
- [ ] Pending bubble is visually distinct from a delivered user
      bubble.
- [ ] Hover/focus states on the × button are visible.

---

### Unit 7: Tests

**File**: `packages/ui/src/__tests__/use-streamed-send.test.tsx`
(extend if present)

Test cases:
- **Queue on stream**: simulate a streaming turn (engine handle with
  a long-running event sequence), submit a second message via
  `send()`, assert that:
  - Original turn continues unaffected.
  - `pendingQueue` has one entry.
  - `items` has a `pending-message` item.
- **Auto-flush**: after the stream's `finally`, the pending message
  is dequeued AND a new engine turn starts with it.
- **Cancel pending**: `cancelPending(id)` removes the entry from
  both queue and items.
- **No flush after user cancel**: invoke `cancel()` mid-stream; on
  finally, queue is preserved (not auto-flushed).
- **Multiple queued messages flush sequentially**: queue 3, let the
  current turn end, verify each becomes its own turn.

**File**: `packages/ui/src/__tests__/chat-tab-body.test.tsx` (or new) —
verify composer accepts input while streaming.

**Acceptance Criteria**:
- [ ] All new tests pass.
- [ ] Existing `use-streamed-send` tests continue to pass.

---

## Implementation Order

Single-stride. No child stories — cohesive UI/hook change in one
package. Suggested intra-stride order:

1. Unit 1 (ChatStreamItem extension).
2. Unit 2 (queue state in hook).
3. Unit 3 (send queues when streaming).
4. Unit 4 (auto-flush in finally + userCancelled handling).
5. Unit 5 (composer disabled + chat-tab-body wiring).
6. Unit 6 (pending bubble styling).
7. Unit 7 (tests, run after each prior unit to catch regressions
   early — minimum at the end).

## Testing

Covered by Unit 7. The hook is the only state authority; testing it
end-to-end with a mock client (`makeFakeClient`) covers most of the
behavior. The UI assertions on bubble appearance / × affordance live
in the tab-body / chat-stream tests.

## Risks

1. **Race between user-cancel and flush** (medium). The
   `userCancelled` boolean must be set BEFORE the iterator's
   `.return()` resolves so the finally block reads the right value.
   The current `cancel()` callback (line 136-138) just calls
   `.return()` — adding `userCancelledRef.current = true` before that
   is straightforward. Cleared at the start of the next `send()` (or
   start of try) so retry works.
2. **Infinite queue feedback** (low). If `send()` calls itself
   recursively via `setTimeout(0)` from finally, and the user
   somehow triggers the same recursion fast enough, could we stack
   up too deep? No — `setTimeout` schedules to the macrotask queue,
   so the call stack unwinds. Even with hundreds of queued messages,
   each is a separate macrotask cycle.
3. **Lost messages on hot reload / unmount** (low). If the dev
   reloads while messages are pending, they're lost. Acceptable for
   v1; production hot-reload isn't a user scenario.
4. **Exam mode interaction** (low). Exam lockdown sets
   `examLockdown=true`. The composer's `disabled={examLockdown}`
   handles this correctly; queue doesn't apply because the composer
   can't submit during lockdown.
5. **Sketches attached to pending messages** (low). The sketch is
   already persisted by the time `onSend(sketchId)` fires (see
   `ComposerSketch.onCaptured`). Pending sketches are valid — they
   re-flush by id. No race.

## Implementation Notes

Implemented 2026-05-13 in a single stride.

### Files changed

- `packages/ui/src/hooks/use-streamed-send.ts` — Units 1–4. Added `PendingMessageItem`
  type and `PendingMessage` internal type. Added `pendingQueue` state + `pendingQueueRef`
  mirror + `userCancelledRef`. Added `cancelPending` callback. Updated `send()` to enqueue
  when `isStreaming` is true. Added auto-flush logic in `finally`: if `!userCancelledRef`
  and queue non-empty, dequeues the first entry, removes its pending bubble, and fires
  `void send(sessionId, next.content, next.sketchId)` via `setTimeout(0)`. `cancel()`
  sets `userCancelledRef.current = true` before `.return()`. `send()` signature updated
  to accept optional `sketchId`. Added `cancelPending` and `pendingCount` to the
  result type.

- `packages/ui/src/hooks/episodic-to-messages.ts` — Fixed a tsgo narrowing bug introduced
  by the previous sub-wave: the `event.result.error.message` access in the tool_result
  case was inside a conditional spread expression that tsgo couldn't narrow. Replaced with
  an explicit `if (result.ok) / else` block.

- `packages/ui/src/components/chat-tab-body.tsx` — Unit 5. Destructures `cancelPending`
  from the hook. Renders a `pending-message` item as a faded bubble with `▶ PENDING`
  chip and `×` dismiss button. Changed composer `disabled` from
  `{isStreaming || examLockdown}` to `{examLockdown}`.

- `packages/ui/src/components/chat-tab-body.module.css` — Unit 6. Added
  `.pendingBubble`, `.pendingContent`, `.pendingChip`, `.pendingDismiss` styles.
  Bubble right-aligns (user side), 0.55 opacity, hover raises to 0.75,
  dismiss button has focus-visible outline.

- `packages/ui/src/components/configure-chat-pane.tsx` — Added `pending-message`
  early-return guard (null) in the item renderer to handle the new union variant.

- `packages/ui/src/components/sidekick-panel.tsx` — Same guard as configure-chat-pane.

- `packages/ui/src/__tests__/use-streamed-send.test.tsx` — Unit 7. Added 6 new tests:
  queue-on-stream, auto-flush, cancelPending, no-flush-after-user-cancel,
  multiple-queued-flush-sequentially, pendingCount-starts-at-zero.

- `packages/ui/src/__tests__/chat-tab-body-dispatch.test.tsx` — Added test verifying
  composer textarea is not disabled (streaming no longer locks input).

### Design fidelity

All 7 design units landed as specified. No design-flaw escape needed:
the `userCancelledRef` pattern composted cleanly — `cancel()` sets it
before `.return()`, `finally` reads it, `send()` clears it on next call.
The ref mirror (`pendingQueueRef`) is essential: the finally closure
captures `sessionId` from its outer `send()` call, but `pendingQueue`
state would be stale without the ref.

### Test results

- 58/58 use-streamed-send tests pass (53 existing + 5 new queue tests).
- 7/7 chat-tab-body-dispatch tests pass (6 existing + 1 new).
- 859/859 total UI tests pass.
- Zero new typecheck errors in changed files.
- Lint clean on all changed files.
