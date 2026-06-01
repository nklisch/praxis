# Pattern: `optimistic-dispatch`

`useOptimisticAction<TParams>` is the canonical hook for every UI affordance that triggers async engine / IPC / chat work. The affordance fires without blocking; a pip beside it conveys state; failures surface inline with retry or escalate to the activity strip. Never re-implement the state machine inline.

## When to Apply

Any UI affordance (button, context menu item, selection bar action) that:
- Triggers IPC work whose result does not need to block further user interaction, **and**
- Should remain re-triggerable after a failure

Do **not** use for:
- `useEffect`-driven data loads — no user trigger affordance to attach a pip to; use `useResource` instead.
- Modal-owned destructive operations (lesson delete, gate override) that own their own `submitting/error` UX via `ConfirmReasonModal` — keep those as raw `async` handlers and don't double-wrap.
- Actions where the UI _must_ block until completion (e.g. `↗ ask Praxis` passage spawn, which navigates synchronously on resolve).

## The Hook

**File**: `packages/ui/src/hooks/use-optimistic-action.ts`

```typescript
useOptimisticAction<TParams>({
  dispatch: (params: TParams) => Promise<void>,  // throw → "failed"
  onSuccess?: () => void,
  onError?: (err: unknown) => void,
  resetSuccessAfterMs?: number,  // default 800
}): {
  state: ActionState,          // "idle" | "pending" | "success" | "failed" | "retrying"
  errorReason?: string,
  trigger(params: TParams): void,
  retry(): void,               // replays with captured params from last trigger()
  dismiss(): void,             // failed → idle
  externalSettle(state: "success" | "failed", reason?: string): void,
}
```

## State Machine

```
              trigger()
idle ─────────────────────► pending ──── dispatch resolves ──► success ─► (auto-reset) ─► idle
                                │
                                └──── dispatch throws ────────► failed
                                                                  │
                              retry() ◄────────────────────────────┘
                                │
                                ▼
                            retrying ──── dispatch resolves ──► success ─► (auto-reset) ─► idle
                                │
                                └──── dispatch throws ────────► failed
```

- `trigger()` captures `params` in a ref; `retry()` replays the same params without user re-input.
- Success auto-resets to idle after `resetSuccessAfterMs` (default 800 ms) — the pip flashes then vanishes.
- `failed` is sticky until `retry()` or `dismiss()`.
- `externalSettle()` is a no-op when state is `"idle"`, `"success"`, or `"failed"` — safe to call from a stream handler without a guard.

## Failure Tiers

**Tier 1 — inline pip + popover**: The default path. `<ActionPip state={action.state} />` sits beside the trigger button; when `state === "failed"`, `<FailurePopover reason={action.errorReason} actions={[retry, dismiss]} />` anchors to the same wrapper. Used when the affordance persists after trigger (most surfaces).

**Tier 2 — strip escalation**: When the affordance is gone after trigger (e.g. the selection bar dismisses immediately on click) there is no inline pip to attach. Track `failedAt` via `onError` or a `useEffect`, then pass to `useActionEscalation`. After `thresholdMs` (default 30 000 ms) the failure surfaces in the `<StatusStrip>` without blocking navigation.

Both tiers compose — most surfaces run both.

## Components

- **`<ActionPip state={action.state} />`** (`packages/ui/src/components/action-pip.tsx`) — circular indicator. Invisible at `"idle"`. In `"failed"` state renders as a `<button>` for keyboard access.
- **`<FailurePopover label reason actions[] />`** (`packages/ui/src/components/failure-popover.tsx`) — anchored popover with retry/dismiss buttons. Conditionally render when `state === "failed"`. Needs a `position: relative` parent to anchor correctly.
- **`<ActionCard label title action actionLabel>`** (`packages/ui/src/components/action-card.tsx`) — optional all-in-one wrapper for mid-thread suggestion cards. Composes trigger button + pip + popover. Use when the card _is_ the affordance (e.g. "Save as flashcards"). Build the pip+popover inline when the trigger is embedded in a larger surface.

## Canonical Examples

### 1. Basic dispatch (assignment submit)

**File**: `packages/ui/src/components/assignment-card.tsx:68`

```tsx
const [failedAt, setFailedAt] = useState<number | null>(null);

const submitAction = useOptimisticAction<void>({
  dispatch: async () => {
    const result = await submit();
    if (result) {
      setLocalGrade(result.grade);
    } else {
      // useAssignment.submit swallows errors and returns null on failure.
      // Propagate as a throw so useOptimisticAction transitions to "failed".
      throw new Error("Submission failed — please retry.");
    }
  },
  onError: () => {
    setFailedAt(Date.now());
  },
});

// Wire the pip + popover beside the button:
<button type="button" onClick={() => submitAction.trigger()}>Submit</button>
<ActionPip state={submitAction.state} />
{submitAction.state === "failed" && (
  <FailurePopover
    reason={submitAction.errorReason}
    actions={[
      { label: COPY.actionPip.retryLabel, onClick: submitAction.retry, variant: "primary" },
      { label: COPY.actionPip.dismissLabel, onClick: submitAction.dismiss },
    ]}
  />
)}
```

`useActionEscalation` is also wired (`packages/ui/src/components/assignment-card.tsx:128`) with `activity: null` (renderer-side has no `start()`-capable registry yet).

### 2. External settle (streaming-event-driven completion)

**File**: `packages/ui/src/components/course-create-tab-body.tsx:115`

When success arrives via a stream event rather than the dispatched Promise, make `dispatch` return a Promise that intentionally never self-resolves. The stream handler calls `externalSettle()` to drive the state transition:

```tsx
const confirmAction = useOptimisticAction<void>({
  dispatch: async () => {
    setConfirming(true);
    // Never resolves — externalSettle() from the draft-events stream drives settlement.
    await new Promise<void>(() => {});
  },
  onError: () => {
    setConfirmFailedAt(Date.now());
    setConfirming(false);
  },
});

// In the finalized-event handler (packages/ui/src/components/course-create-tab-body.tsx:151):
useEffect(() => {
  let cancelled = false;
  (async () => {
    for await (const event of client.drafts.events()) {
      if (cancelled) break;
      if (event.kind === "finalized") {
        confirmAction.externalSettle("success");  // safe no-op if not pending
        // ... open teach session ...
        break;
      }
    }
  })();
  return () => { cancelled = true; };
}, [tab.sessionId, client, navigate, openTab]);
```

The button + pip wiring is identical to the basic pattern (`packages/ui/src/components/course-create-tab-body.tsx:285`).

### 3. Per-row instances (extract a sub-component)

**File**: `packages/ui/src/components/library-document-picker.tsx:50`

`useOptimisticAction` cannot be called in a loop (React rules of hooks). Extract a sub-component so each row owns its own hook instance:

```tsx
// ❌ Wrong — hooks in a loop:
{docs.map((doc) => {
  const action = useOptimisticAction({ dispatch: () => attach(doc.id) }); // illegal
  return <Row key={doc.id} action={action} />;
})}

// ✓ Correct — sub-component owns the hook:
function DocumentPickerRow({ doc, scope, onOptimisticAttach, onOptimisticRevert }: ...) {
  const attachAction = useOptimisticAction<void>({
    dispatch: async () => {
      await client.documentScopes.attach({ scope, documentId: doc.documentId, source: "manual" });
      onAttached?.(doc.documentId);
    },
    onError: () => {
      onOptimisticRevert(doc.documentId);  // revert parent state on failure
      setFailedAt(Date.now());
    },
  });

  const handleAttach = () => {
    onOptimisticAttach(doc.documentId);   // optimistic update before the IPC call
    attachAction.trigger();
  };
  // ...
}

// Parent renders:
{data.library.map((doc) => (
  <DocumentPickerRow
    key={doc.documentId}
    doc={doc}
    onOptimisticAttach={handleOptimisticAttach}
    onOptimisticRevert={handleOptimisticRevert}
  />
))}
```

`handleOptimisticAttach` / `handleOptimisticRevert` call `setData` on the parent's `useResource` result (`packages/ui/src/components/library-document-picker.tsx:219`).

### 4. Strip-only failure (when the affordance is gone post-trigger)

**File**: `packages/ui/src/components/document-tab-body.tsx:285`

The selection action bar dismisses immediately on click. There is no persistent pip — failures go straight to tier 2. Track `failedAt` via `useEffect`, aggregate, and pass to `useActionEscalation`:

```tsx
const noteAction = useOptimisticAction<NoteParams>({
  dispatch: async (params) => {
    await client.notes.create({ format: "free", body: { kind: "free", text: params.text } });
  },
});

// Track failedAt via useEffect (hook doesn't expose transition timestamp):
const [noteFailedAt, setNoteFailedAt] = useState<number | null>(null);
useEffect(() => {
  if (noteAction.state === "failed") {
    setNoteFailedAt((prev) => prev ?? Date.now());
  } else {
    setNoteFailedAt(null);
  }
}, [noteAction.state]);

// On click — dismiss bar immediately, action runs in background:
const handleNote = () => {
  noteAction.trigger({ text: selectionBar.text });
  dismissBar();
};

// Aggregate and escalate (packages/ui/src/components/document-tab-body.tsx:341):
const failedActions = useMemo(() => {
  const list = [];
  if (noteAction.state === "failed" && noteFailedAt !== null)
    list.push({ id: "selection-note", label: "Note creation failed", failedAt: noteFailedAt });
  // ... other actions
  return list;
}, [/* deps */]);

useActionEscalation({ failedActions, activity: null });
```

## Escalation

**File**: `packages/ui/src/hooks/use-action-escalation.ts`

```typescript
useActionEscalation({
  failedActions: ReadonlyArray<{ id: string; label: string; failedAt: number }>,
  activity?: ActivityRegistryClient | null,  // null → degrades gracefully
  thresholdMs?: number,                      // default 30 000 ms
}): void
```

Per-item lifecycle: item appears → timer scheduled for `thresholdMs − elapsed` → timer fires → `activity.start({ label })` in `<StatusStrip>` → item disappears (retry/dismiss) → `clearTimeout` + `handle.finish("failed")`.

Pass `activity: null` in renderer-side components — `ActivityClient` (the renderer-side client) has `events()`/`dismiss()` but not `start()`, which belongs to `ActivityRegistry` (server-side). The hook degrades gracefully with `null`. A future iteration can thread a `start()`-capable registry from the app shell if needed.

## Gotchas

- **Hooks in a loop**: `useOptimisticAction` cannot be called in a loop. Extract a sub-component for per-row patterns (see `DocumentPickerRow` in `library-document-picker.tsx`).

- **Optimistic state reversion on failure**: When `handleAttach` immediately updates parent state before the IPC call resolves (e.g. adding to `attachedIds`), the `onError` callback must revert. Pass `onOptimisticRevert` into the sub-component and call it from `onError`. See `packages/ui/src/components/library-document-picker.tsx:73`.

- **External settle for streaming**: When success arrives via a stream event, `dispatch` returns an intentionally-never-resolving Promise and the stream handler calls `action.externalSettle("success" | "failed", reason?)`. `externalSettle` is a no-op if the action is `"idle"`, `"success"`, or `"failed"` — safe to call unconditionally from the event loop. See `packages/ui/src/components/course-create-tab-body.tsx:115`.

- **`failedAt` tracking**: The hook does not expose when it transitioned to `"failed"`. For `useActionEscalation`, capture it via `onError: () => setFailedAt(Date.now())` (when only one action is on the surface) or via `useEffect` on `state === "failed"` (when aggregating multiple actions). See the `document-tab-body.tsx` example above.

- **Errors that don't throw**: Some IPC calls (e.g. `useAssignment.submit()`) swallow errors and return `null`. Your `dispatch` must explicitly throw on null/falsy returns for the hook to reach `"failed"`. See `packages/ui/src/components/assignment-card.tsx:110`.

- **Modal-owned destructive operations**: Some surfaces (lesson delete, gate override) route through a `ConfirmReasonModal` that owns its own `submitting/error` state. Don't double-wrap — keep those as raw `async` handlers inside the modal. The judgment: if the operation needs a confirmation dialog with a reason field, the modal owns the UX; `useOptimisticAction` is for non-blocking, immediately-fired affordances.

- **Button disabled state**: Do not disable the trigger button during `"pending"` as a general rule — the pip carries the state. The affordance stays interactive so the user can continue without waiting. Exception: in sub-component rows where re-triggering before the first attempt settles would create duplicate IPC calls, a `disabled={state === "pending" || state === "retrying"}` is acceptable. See `packages/ui/src/components/library-document-picker.tsx:118`.

## Anti-Patterns

- **Disabling the trigger button during in-flight** (except per-row sub-components) — defeats the "UI never blocks" principle. The pip carries the state.
- **`disabled={isStreaming}` on Composer-like surfaces** — see related composer refactor.
- **Re-implementing the state machine inline** — `useState("idle")` + `try/catch` → always go through the hook.
- **Using this pattern for `useEffect`-driven data loads** — no user trigger affordance; use `useResource` or a plain `useEffect`.
- **Calling `externalSettle` without the never-resolving `dispatch` pattern** — if `dispatch` resolves before `externalSettle` fires, the hook transitions to `"success"` twice (second is a no-op, but the intent is unclear). Always pair them: `dispatch` never resolves ↔ `externalSettle` drives settlement.
