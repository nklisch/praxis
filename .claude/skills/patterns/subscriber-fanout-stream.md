# Subscriber-Fanout Stream

A service exposes `subscribe(listener) → unsubscribe`, an Electron main-process channel module fans events out to a `webContents`, a client class wraps it as `events(): AsyncIterable<E>`, and a UI hook iterates that stream while folding `event.kind` into a local Map → setState array. `snapshot` is sent first on subscribe so a fresh subscriber sees current state without waiting for the next mutation.

## Rationale

Three pieces of state in Praxis are pushed from the main process to every renderer subscription whenever they change: long-running activity items (the activity rail), live bootstrap drafts (the bootstrap right pane), and pending quick checks (chat surface). All three follow the exact same shape because the requirements are identical: many transient items, multiple potential consumers, late-joiners must see current state. The pattern factors that into four cooperating layers so a new "live state" stream is mostly mechanical to add. The existing `ipc-channel-convention` covers the channel naming; this pattern is the layered subscribe-fanout shape that sits on top.

## Examples

### Example 1: ActivityRegistry — service with snapshot-on-subscribe
**File**: `packages/core/src/services/activity-registry.ts:104`
```typescript
subscribe(listener: ActivityListener): () => void {
  listener({ kind: "snapshot", items: this.list() });
  this.listeners.add(listener);
  return () => {
    this.listeners.delete(listener);
  };
}
```

### Example 2: Bootstrap drafts channel — main-process fanout with AbortController hold-open
**File**: `packages/desktop/electron/main/bootstrap-drafts-channel.ts:28`
```typescript
handle("praxis.bootstrap.drafts.events.start", async (_event, streamId: string) => {
  const controller = new AbortController();
  activeAbortControllers.set(streamId, controller);
  const eventsChannel = `praxis.bootstrap.drafts.events.events.${streamId}`;
  const push = (msg: IpcStreamMessage<DraftStreamEvent>) => {
    const wc = webContentsGetter();
    if (!wc || wc.isDestroyed()) return;
    wc.send(eventsChannel, msg);
  };

  let unsubscribe: (() => void) | null = null;
  try {
    unsubscribe = services.bootstrap.subscribe((event) => {
      if (controller.signal.aborted) return;
      push({ kind: "event", payload: event });
    });
    await new Promise<void>((resolve) => {
      controller.signal.addEventListener("abort", () => resolve(), { once: true });
    });
    push({ kind: "done" });
  } finally {
    unsubscribe?.();
    activeAbortControllers.delete(streamId);
  }
});
```

### Example 3: useDrafts — UI hook folds events into a local Map → setState array
**File**: `packages/ui/src/hooks/use-drafts.ts:29`
```typescript
useEffect(() => {
  let cancelled = false;
  const local = new Map<string, DraftCourseState>();
  (async () => {
    try {
      for await (const event of client.drafts.events()) {
        if (cancelled) break;
        switch (event.kind) {
          case "snapshot":
            local.clear();
            for (const d of event.drafts) local.set(d.draftId, d);
            break;
          case "started":
          case "updated":
            local.set(event.draft.draftId, event.draft);
            break;
          case "finalized":
          case "discarded":
            local.delete(event.draftId);
            break;
        }
        setDrafts(Array.from(local.values()));
      }
    } catch {
      if (!cancelled) setDrafts([]);
    }
  })();
  return () => {
    cancelled = true;
  };
}, [client]);
```

The other two end-to-end instances are `services.activity` → `activity-channel.ts` → `activity-client.ts` → `useActivity` (`packages/ui/src/hooks/use-activity.ts:22`), and `services.quickCheck` → `quick-check-channel.ts` → `quick-check-client.ts` → `useQuickCheckBridge` (`packages/ui/src/hooks/use-quick-check-bridge.ts:38`).

## When to Use

- New piece of mutable main-process state that 1+ renderer must reactively reflect (ambient progress, live drafts, pending HITL prompts; future: live notifications, live presence, live tool-call counters)
- Late joiners must see current state — the `snapshot` event is the contract that makes that work without a separate "fetch initial then subscribe" race

## When NOT to Use

- One-off computations that return a single value — use `transport.invoke` and a plain Promise
- Streaming work products from a one-shot operation (ingestion pipeline, agent turn) — those use `async function*` over `services.X.send/ingest()` rather than `subscribe(listener)`. The split is roughly: "subscribe-fanout" for shared mutable state visible to many subscribers; "async generator" for a per-call private stream

## Common Violations

- Forgetting to send `snapshot` on subscribe — fresh subscribers see an empty list until the next mutation, which can be minutes
- Pushing without checking `wc.isDestroyed()` — Electron throws if the WebContents is gone
- Forgetting `controller.signal.aborted` guard inside the listener — events keep being pushed after cancel, racing with cleanup
