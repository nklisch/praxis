---
id: feature-composer-async-behavior
kind: feature
stage: implementing
tags: [ui, ux]
parent: epic-chat-interaction-ux-overhaul
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Composer: queue messages during in-flight turns, expose a cancel control

## Brief
The chat composer locks the send button while the tutor is mid-turn, blocking the user from typing or sending a follow-up until the response settles. Two coupled changes: (1) keep send active so the user can queue additional messages — they should land in order behind the in-flight turn rather than being gated on it; (2) introduce a cancel control (replacing or sitting next to send) that aborts the current tutor turn via the existing AbortSignal path so the user can interrupt long thinking. Together these turn the composer from a strict request/response gate into a real conversational input surface.

## Source idea
`idea-composer-queue-and-cancel` (parked 2026-05-24).

## Foundation reference
`docs/UX.md` teach-modality composer section now states: "The composer never locks while the tutor is mid-turn — additional messages typed during an in-flight response queue and dispatch in order behind the active turn, and the send button transforms into a cancel control during in-flight state that aborts the current turn via the engine's AbortSignal path." Feature design fills in the visual treatment (queued-message pill list? send/cancel toggle vs separate buttons? error-on-queued-message handling?).

## Design decisions
*(captured 2026-05-24 via `feature-design --only-questions --all`. These lock in directional choices so the full design pass inherits them.)*

- **Cancel control shape**: Send button transforms into Stop (`■`) in place during in-flight state — single affordance, swaps between `Send ↑` (idle) and `Stop ■` (in-flight). Familiar ChatGPT/Claude.ai pattern. The composer never disables; only the button's role changes.
- **Queued message visualization**: Inline ghost bubbles in the chat thread (where the message will eventually appear) with a per-bubble `edit / remove` affordance until dispatch. The faded/italic styling distinguishes queued from sent. Optimistic UI reads forward; per-item cancel is a hard requirement.
- **Queue failure surfacing**: Failed-to-send badge inline on the originating ghost bubble + one-click retry. Matches the `optimistic + async error` pattern the sibling refactor feature codifies. After ~30s unattended, the activity strip picks up the failure as a persistent notification (escalation tier from the refactor pattern).
- **Queue depth cap**: Unlimited. Trust the user; cancel is always available. Avoids re-introducing the kind of locked state this epic is removing.

## Mockups
*Rebuilt 2026-05-24 using the `ux-ui-design` plugin's conventions properly — links `tokens.css` + `motion.css` + `components.css`, composes against components rather than inlining, uses locked motion tokens with `prefers-reduced-motion` respect, and demonstrates the responsive `.chat-surface` adaptation.*

- Inherits design system: `.mockups/design-system/{tokens,motion,components}.css`
- Screens · state mocks at `.mockups/screens/feature-composer-async-behavior/`:
  - `index.html` — navigator (4 states + responsive showcase row)
  - `state-idle.html` — baseline; `.composer` with `.composer__status`
  - `state-in-flight-empty.html` — tutor streaming; `.composer__send` takes `.composer__send--stop` modifier in place; `.composer__status--streaming`; same DOM element role-swaps
  - `state-in-flight-queued.html` — tutor streaming + 2 queued `.chat-turn--queued` ghost bubbles with `.chat-turn__position` pips and `.chat-turn__actions` (edit / remove)
  - `state-failed-retry.html` — queued #1 hit transient engine error; `.chat-turn--failed` inline + `.status-strip--active` escalated after 38s; coexisting tiers
  - `responsive-showcase.html` — same composer + queued turn in three `.chat-surface` widths (wide / medium / narrow); demonstrates `@container chat (...)` adaptation
- Components added to `.mockups/design-system/components.css` (refinement mode, additive):
  - `.chat-surface` + `--wide` / `--medium` / `--narrow` modifiers
  - `.chat-turn` family — `--tutor` / `--student` / `--queued` / `--failed` + `__speaker` / `__when` / `__streaming` / `__body` / `__streaming-tail` / `__badge` (+ `--failed`) / `__position` / `__actions` / `__action` (+ `--danger` / `--primary`) / `__error-reason`
  - `.composer__send--stop` modifier · `.composer__status` (+ `--streaming` / `--failed`) · `.composer__status__pip` · `.composer__hints--split`
- Shared interactive feel demo: `.mockups/flows/async-chat-interactions/01-composer-queue.html`

## Architectural choice

Extend the existing hook decomposition (`use-streamed-send` + `use-pending-queue` + sub-hooks) rather than rewrite. The queue + cancel infrastructure is largely in place: `usePendingQueue` already supports enqueue / dequeue / per-item-cancel; `useStreamedSend.cancel()` is wired through AbortController to `SessionService.send`'s signal check (`packages/core/src/services/session-service.ts:315`); the IPC layer auto-supplies the signal via `registerGeneratorStream`. Two coherent new surfaces remain: (a) per-message failure tracking + activity-strip escalation, and (b) composer chrome — Stop button morph + status row + queued/failed bubble rendering. The existing `setItems`-passed-at-call-time pattern (`hook-decomposition-setitems-callback`) stays; new state slices compose into the same parent orchestrator.

Rejected alternatives:
- **New state container / context for queue state** — duplicates `usePendingQueue`'s ref-mirror pattern; one source of truth wins.
- **Hoist queue state into PraxisClient** — crosses a UI / RPC boundary for state that's purely UI-local.
- **Route queue display through `.action-card`** — the queue is a chat-turn extension semantically, not a tool/action invocation. The mockups use `.chat-turn--queued`; matches that family.

## Implementation Units

### Unit 1: PendingMessageItem failure-state extension
**File**: `packages/ui/src/types/items.ts` (or wherever `PendingMessageItem` is currently defined — locate via grep) and `packages/ui/src/hooks/use-pending-queue.ts`
**Story**: `feature-composer-async-behavior-step-1-pending-message-failure-state`

```typescript
// items type — extend
export type PendingMessageStatus = "queued" | "dispatching" | "failed";

export interface PendingMessageItem {
  kind: "pending-message";
  id: string;                      // pending bubble id (uuid)
  text: string;
  sketchId?: string;
  status: PendingMessageStatus;    // NEW — default "queued" on enqueue
  errorReason?: string;            // NEW — set when status="failed"
  failedAt?: number;               // NEW — Date.now() at failure transition
}

// use-pending-queue.ts — new exports
export interface UsePendingQueueResult {
  enqueue(text: string, sketchId?: string): string;          // returns pending id
  dequeueNext(): { id: string; text: string; sketchId?: string } | null;
  cancel(): void;
  cancelPending(id: string): void;                            // existing — alias for queue remove
  markDispatching(id: string): void;                          // NEW
  markFailed(id: string, errorReason: string): void;          // NEW
  retryFailed(id: string): { text: string; sketchId?: string } | null;  // NEW
  editPending(id: string, newText: string): void;             // NEW — only allowed for status="queued"
  removeFailed(id: string): void;                             // NEW
  pendingCount: number;                                       // status: queued + dispatching (excludes failed)
  failedCount: number;                                        // NEW — status: failed
}
```

**Implementation notes**:
- `markDispatching` flips `queued → dispatching` immediately before `entry.handle.send()` is called for that pending item. Drives `.chat-turn--queued` → no-longer-editable visual.
- `markFailed` flips `dispatching → failed`; sets `errorReason` + `failedAt = Date.now()`. Bubble stays in `items` (does not auto-remove).
- `retryFailed` flips `failed → queued`; clears `errorReason`/`failedAt`; returns captured params for the caller to re-enqueue at the head of the dispatch loop (NOT a separate re-send call — the queue's existing dequeue path handles it).
- `removeFailed` deletes the item from `items` via the existing `setItems(prev => prev.filter(...))` pattern.
- `editPending(id, newText)` — only allowed when `status === "queued"`. No-op + warn log when `dispatching` or `failed`.
- `pendingCount` derived from items (queued+dispatching), `failedCount` derived (failed). Not stored separately.
- All state transitions go through `setItems` callback; no direct ref mutation for status field.

**Acceptance criteria**:
- [ ] PendingMessageItem has `status`, `errorReason`, `failedAt` fields with the documented types
- [ ] `markDispatching` transitions only from "queued"; logs warn if state mismatch
- [ ] `markFailed` transitions only from "dispatching"; sets `errorReason` and `failedAt`
- [ ] `retryFailed` transitions only from "failed"; returns params, clears error fields
- [ ] `editPending` only operates on "queued" items; warn log otherwise
- [ ] `removeFailed` only operates on "failed" items; warn log otherwise
- [ ] `pendingCount` and `failedCount` derived from items, not stored
- [ ] All transitions use `setItems` callback (no ref-mutation for status)
- [ ] Unit tests cover every transition + every illegal-state warn path

---

### Unit 2: Composer Stop-button morph
**File**: `packages/ui/src/components/composer.tsx`
**Story**: `feature-composer-async-behavior-step-2-stop-button`

```typescript
export interface ComposerProps {
  value: string;
  onChange(v: string): void;
  onSend(message: string, sketchId?: string): void;
  isStreaming: boolean;          // NEW — drives Send↔Stop morph
  onCancel(): void;              // NEW — fired on Stop click
  // existing sketch / verb / ref props preserved
  // REMOVE: `disabled` prop — composer never disables anymore
}
```

**Implementation notes**:
- Remove `disabled` prop entirely from `ComposerProps` and the `<textarea>`. Composer accepts input regardless of streaming state.
- Send button morphs by `isStreaming`:
  - `false` → `<button class="composer__send" aria-label="Send">↑</button>` → `onSend`
  - `true` → `<button class="composer__send composer__send--stop" aria-label="Stop tutor turn">■</button>` → `onCancel`
- Same DOM element, role-swap via class modifier (matches mockup convention; preserves focus through transition).
- Enter-to-send only fires `onSend` when `value` non-empty AND `isStreaming === false`. Enter during streaming does nothing (Stop is explicit, never accidental).
- Visual: `.mockups/screens/feature-composer-async-behavior/state-in-flight-empty.html`.

**Acceptance criteria**:
- [ ] Composer renders Send button when `isStreaming=false`
- [ ] Composer renders Stop button (with `--stop` modifier) when `isStreaming=true`
- [ ] Click on Stop fires `onCancel` exactly once
- [ ] Enter key during `isStreaming=true` fires neither `onSend` nor `onCancel`
- [ ] Textarea accepts input regardless of `isStreaming`
- [ ] `disabled` prop removed from `ComposerProps` (typecheck verifies)
- [ ] Existing composer tests (`composer.test.tsx`) updated; no `disabled` references remain

---

### Unit 3: Composer status row
**File**: `packages/ui/src/components/composer-status.tsx` (NEW)
**Story**: `feature-composer-async-behavior-step-3-status-row`

```typescript
export interface ComposerStatusProps {
  isStreaming: boolean;
  pendingCount: number;
  failedCount: number;
}

export function ComposerStatus(props: ComposerStatusProps): JSX.Element | null;
```

**Implementation notes**:
- Pure presentational; no state of its own.
- Priority ladder for dominant state (highest priority wins):
  1. `failedCount > 0` → `.composer__status--failed` ("N failed · retry inline")
  2. `isStreaming === true` → `.composer__status--streaming` ("Tutor is responding" + `.composer__status__pip`)
  3. `pendingCount > 0` → no modifier ("N queued behind active turn")
  4. else → returns `null` (idle = no status row)
- Visual: `.mockups/screens/feature-composer-async-behavior/state-*.html`. Composes against existing `.composer__status` family in `.mockups/design-system/components.css`.
- COPY strings should match the mockup; add to `packages/ui/src/copy.ts` if a COPY module exists (check via grep).

**Acceptance criteria**:
- [ ] Renders `--failed` variant when `failedCount > 0` (highest priority)
- [ ] Renders `--streaming` variant when `isStreaming=true` and no failures
- [ ] Renders queued count when `pendingCount > 0` and not streaming and no failures
- [ ] Returns `null` in pure idle state
- [ ] Component is pure (no state, no effects)
- [ ] Snapshot test per variant

---

### Unit 4: Queued / failed message bubble
**File**: `packages/ui/src/components/queued-message-bubble.tsx` (NEW)
**Story**: `feature-composer-async-behavior-step-4-queued-bubble`

```typescript
export interface QueuedMessageBubbleProps {
  item: PendingMessageItem;
  onEdit(id: string, newText: string): void;   // commits an inline edit
  onRemove(id: string): void;                   // removes from queue (queued) or list (failed)
  onRetry(id: string): void;                    // retry failed (no-op if not failed)
}

export function QueuedMessageBubble(props: QueuedMessageBubbleProps): JSX.Element;
```

**Implementation notes**:
- Renders one `<article>` with class `.chat-turn` + variant modifier:
  - `status === "queued"` → `.chat-turn--queued` + actions: `edit`, `remove`
  - `status === "dispatching"` → `.chat-turn--queued` + actions: `remove` only (edit hidden — message is mid-flight)
  - `status === "failed"` → `.chat-turn--failed` + `__error-reason` showing `item.errorReason` + actions: `retry`, `remove`
- Inline edit interaction (only when status=queued):
  - Click edit pip → component-local `editing: true` state → render inline `<textarea>` pre-filled with `item.text` + Save / Cancel pips
  - Save → call `onEdit(id, newText)` → exit editing mode
  - Cancel → discard local text, exit editing mode
  - No modal flow; no dialog; entirely in-place.
- Failed bubble's error reason rendered in `.chat-turn__error-reason`; short truncate at 120 chars with title attribute carrying the full reason.
- Uses motion tokens from `.mockups/design-system/motion.css` for any transitions (fade-in of error reason, edit-mode toggle); respects `prefers-reduced-motion`.
- Single component handles all three sub-states (queued / dispatching / failed) — keeps the rendering location centralized.

**Acceptance criteria**:
- [ ] Queued items render `.chat-turn--queued` with edit + remove pips
- [ ] Dispatching items render `.chat-turn--queued` with remove only (no edit)
- [ ] Failed items render `.chat-turn--failed` with retry + remove pips and visible `errorReason`
- [ ] Edit toggles inline textarea; Save calls `onEdit(id, newText)` then exits; Cancel discards
- [ ] Remove fires `onRemove(id)` exactly once
- [ ] Retry fires `onRetry(id)` exactly once and only renders when `status === "failed"`
- [ ] Long `errorReason` truncates to 120 chars, full text in `title` attribute
- [ ] Component uses motion tokens; no hardcoded transitions
- [ ] RTL test: assert each action button by `aria-label` from the COPY module

---

### Unit 5: Send error → mark-failed wiring
**File**: `packages/ui/src/hooks/use-streamed-send.ts`
**Story**: `feature-composer-async-behavior-step-5-send-error`

Replace the current send-error path for queue-dispatched messages so failures attach to the specific PendingMessageItem rather than the orchestrator-level `lastError`. Approximate shape (locate the existing try/catch around `for await`):

```typescript
async function dispatchOne(message: SendMessage, pendingId: string | null): Promise<void> {
  if (pendingId) pendingQueue.markDispatching(pendingId);
  try {
    for await (const event of capturedEntry.handle.send(message, signal)) {
      // existing event handling unchanged
    }
  } catch (err) {
    if (signal.aborted) {
      // user-initiated cancel — do NOT mark failed
      return;
    }
    if (pendingId) {
      pendingQueue.markFailed(pendingId, errorMessage(err));
      return; // let the outer loop dequeueNext to keep the queue moving
    }
    // direct (non-queued) send: fall back to existing lastError handling
    throw err;
  }
}
```

**Implementation notes**:
- The current send() loop sets `lastError` on the orchestrator. Replace that for queue-dispatched items with per-item `markFailed`.
- The direct (user-typed-and-sent-immediately-with-empty-queue) path stays on `lastError` for now — it's a different visual surface (composer-level banner) and out of scope for this feature. Flag as future follow-up (see Risks).
- Discriminate "queue-dispatched send failed" from "signal-aborted cancel" via `signal.aborted` check — only the former calls `markFailed`.
- After `markFailed`, the outer dispatch loop's `finally` continues to `dequeueNext()` — subsequent queued messages still attempt.

**Acceptance criteria**:
- [ ] `markDispatching(pendingId)` called immediately before `handle.send` for queue-dispatched items
- [ ] `markFailed(pendingId, reason)` called on non-abort errors during queue-dispatched sends
- [ ] Abort (`signal.aborted=true`) does NOT mark the in-flight queued item as failed
- [ ] After `markFailed`, dispatch loop continues to `dequeueNext()` for subsequent pending items
- [ ] Integration test: 3-message queue with middle one's `send` throwing → first dispatches OK, middle marked failed, third dispatches OK
- [ ] Direct send error path unchanged (still surfaces via `lastError`)

---

### Unit 6: Failure-escalation to activity strip
**File**: `packages/ui/src/hooks/use-failed-escalation.ts` (NEW)
**Story**: `feature-composer-async-behavior-step-6-escalation`

```typescript
export interface UseFailedEscalationOpts {
  failedItems: ReadonlyArray<PendingMessageItem>;  // filtered to status:"failed"
  activity?: ActivityRegistryClient | null;        // optional; degrades gracefully
  thresholdMs?: number;                            // default 30_000
}

export function useFailedEscalation(opts: UseFailedEscalationOpts): void;
```

**Implementation notes**:
- For each `failedItems[i]`, schedules `setTimeout(thresholdMs - (Date.now() - failedAt))` from current time.
- When timeout fires AND the item is still present in `failedItems`, calls `activity.start({ label: "Queued message failed to send", metadata: { messageId: item.id } })` and stores the returned handle in a per-id map.
- When item disappears from `failedItems` (user retried OR removed), `clearTimeout` and `handle.finish("failed")` if a handle was created.
- Re-failure of the same `id` after retry → new `failedAt` → new timer scheduled (treat as fresh).
- Graceful degradation: when `activity` is `null`/`undefined`, hook is a no-op (sched/clear still happen safely; just no registry calls).
- Use the `activity-rail-producer` pattern; do NOT create a blocking modal.
- Uses `useRef<Map<string, { timer: number; handle?: ActivityHandle }>>` keyed by item id; cleans up entirely on unmount.

**Acceptance criteria**:
- [ ] Activity entry created exactly `thresholdMs` after `failedAt`
- [ ] Retry / remove before threshold prevents activity entry (timer cleared)
- [ ] After threshold, activity entry persists until user resolves the failed bubble
- [ ] Re-failure of same id after retry produces a fresh timer
- [ ] Hook cleans up all timers + activity handles on unmount
- [ ] No activity entry when `activity` is `null`/`undefined` (graceful degradation)
- [ ] Unit test using `vi.useFakeTimers()` for deterministic timing

---

### Unit 7: ChatTabBody integration
**File**: `packages/ui/src/components/chat-tab-body.tsx` and per-mode bodies (`quiz-tab-body.tsx`, `homework-tab-body.tsx`, `exam-tab-body.tsx`, `course-create-tab-body.tsx`, `study-skills-tab-body.tsx` — enumerate via grep)
**Story**: `feature-composer-async-behavior-step-7-integration`

**Changes**:
1. Replace the existing `PendingMessageItem` render path in the items-list mapping with `<QueuedMessageBubble item={item} onEdit={...} onRemove={...} onRetry={...} />`.
2. Expose `editPending`, `retryFailed`, `removeFailed` from `useStreamedSend` (passthrough from `usePendingQueue`).
3. Pass `isStreaming={isStreaming}` and `onCancel={cancel}` to `<Composer>`. Drop the `disabled={isStreaming}` prop.
4. Render `<ComposerStatus isStreaming={isStreaming} pendingCount={pendingCount} failedCount={failedCount} />` directly beneath the composer (sibling element).
5. Mount `useFailedEscalation({ failedItems: items.filter(...), activity: client.activity })`.
6. Per-mode tab-body parity: apply the above to every mode body, not just the teach one. Enumerate `useStreamedSend` callers via `grep -r "useStreamedSend(" packages/ui/src/`.

**Acceptance criteria**:
- [ ] All mode tab bodies render `<QueuedMessageBubble>` for `kind: "pending-message"` items (no leftover bubble-less rendering)
- [ ] `<ComposerStatus>` appears beneath the composer in every mode body
- [ ] Edit / remove / retry actions fire the correct queue methods (verified via mocked queue hook in unit tests)
- [ ] Cancel from composer's Stop button aborts the in-flight tutor turn (assert via existing cancel test pattern)
- [ ] `useFailedEscalation` is mounted in every mode that uses `useStreamedSend`
- [ ] No `disabled={isStreaming}` reference remains on any `<Composer>` instance in the codebase (grep verifies)
- [ ] Smoke test: open teach mode, send a message that fails synthetically via fake client → bubble renders with retry + remove, ComposerStatus shows "1 failed", clicking retry re-attempts

---

## Implementation Order

1. **step-1-pending-message-failure-state** (deps: `[]`) — type extensions + queue method extensions
2. **step-2-stop-button** (deps: `[]`) — Composer Stop button morph
3. **step-3-status-row** (deps: `[]`) — `<ComposerStatus>` component
4. **step-4-queued-bubble** (deps: `[step-1]`) — `<QueuedMessageBubble>` component
5. **step-5-send-error** (deps: `[step-1]`) — send() error → markFailed wiring
6. **step-6-escalation** (deps: `[step-1]`) — `useFailedEscalation` hook
7. **step-7-integration** (deps: `[step-2, step-3, step-4, step-5, step-6]`) — ChatTabBody / per-mode wiring + smoke tests

Parallel-friendly: steps 1, 2, 3 ship without waiting (1 unlocks the rest); 4 / 5 / 6 fan out after 1; 7 is the merge point.

## Testing

### Unit tests (per story)
- `packages/ui/src/__tests__/use-pending-queue.test.tsx` — extend with `markDispatching / markFailed / retryFailed / editPending / removeFailed` transitions, derived counts, illegal-state warns
- `packages/ui/src/__tests__/composer.test.tsx` — extend with Stop button morph, Enter behavior during streaming, no `disabled` regression
- `packages/ui/src/__tests__/composer-status.test.tsx` — NEW; variant rendering per state combo (failed > streaming > queued > idle)
- `packages/ui/src/__tests__/queued-message-bubble.test.tsx` — NEW; render, edit toggle, save, cancel, remove, retry; assert dispatching hides edit
- `packages/ui/src/__tests__/use-failed-escalation.test.tsx` — NEW; vi.useFakeTimers; threshold, early-clear, re-failure, unmount cleanup
- `packages/ui/src/__tests__/use-streamed-send.test.tsx` — extend; 3-message queue with middle send throwing; assert all three transitions

### Test helpers
- `__tests__/helpers/fake-client.ts` — extend `makeFakeClient` with `activity` field returning a `makeFakeActivityRegistry()` factory if not already present
- Reference `ui-test-helper` pattern (`.claude/skills/patterns/ui-test-helper.md`)

## Risks

- **Per-mode tab-body fan-out**: 6 mode tab bodies (`teach`, `quiz`, `homework`, `exam`, `course-create`, `study-skills`) all use `useStreamedSend`. The integration story must touch every one. Skipping a mode means it silently retains the old locked-composer behavior. **Mitigation**: integration story enumerates callers via `grep -r "useStreamedSend("` before claiming done; smoke test in at least teach + one other mode.

- **First-message error path different from queued failure**: When the user types and sends with an empty queue, no `PendingMessageItem` exists yet — current failure surfaces as `lastError` on the orchestrator. This feature keeps that path as-is; per-bubble error rendering for direct sends is a future follow-up. **Flagged so it's not lost.** Out of scope.

- **Edit-during-dispatch race**: User clicks edit at the exact moment `markDispatching` fires. **Mitigation**: UI hides the edit pip on `status === "dispatching"`; `editPending` refuses + warn-logs if called on non-queued status (defensive double-check).

- **Activity-strip flooding**: 10 failed messages all escalate after 30s — does the strip flood? Activity registry's `quietPeriodMs` should debounce, but worth verifying. **Mitigation**: integration test creates 5 simultaneous failed messages and asserts ≤ 1 status-strip entry visible. If the registry doesn't deduplicate, the escalation hook should — group by message-failed kind.

- **Refactor in flight**: `feature-refactor-use-streamed-send-hook-decomposition` is at `stage: implementing` with 5 child stories. The hook decomposition is already in code (`use-pending-queue.ts`, `use-streamed-bubbles.ts`, etc. exist), so this feature designs against the post-refactor shape — correct. But if the refactor stories haven't all merged when this feature implements, there may be small landing-order conflicts. **Mitigation**: each story imports from the post-refactor file paths; if a path doesn't yet exist when implementation starts, that story rebases against the refactor work first.
