# Subscriber-Fanout Stream

A service exposes `subscribe(listener[, filter?]) → unsubscribe`, an Electron main-process channel module fans events out to a `webContents`, a client class wraps it as `events(): AsyncIterable<E>`, and a UI hook iterates that stream while folding `event.kind` into a local Map → setState array. `snapshot` is sent first on subscribe so a fresh subscriber sees current state without waiting for the next mutation.

**Filtered subscribe**: services may accept an optional filter argument on `subscribe` to scope what a listener receives. The filter is applied at the fanout layer (the service's `notify` loop) — the listener is never invoked with events that don't match. `SubAgentRegistry.subscribe(listener, { parentCallId })` is the canonical example: a renderer that opened the chat thread for one parent `tool_call` only receives sub-agent events keyed to that callId. The unfiltered call (`subscribe(listener)`) remains the default. When adding a new subscribe-fanout channel, prefer unfiltered unless there's a concrete reason (UI scoped to a parent entity, fanout cost too high without the filter).

## Rationale

Three pieces of state in Praxis are pushed from the main process to every renderer subscription whenever they change: long-running activity items (the activity rail), live course-create drafts (the right pane), and pending quick checks (chat surface). All three follow the exact same shape because the requirements are identical: many transient items, multiple potential consumers, late-joiners must see current state. The pattern factors that into four cooperating layers so a new "live state" stream is mostly mechanical to add. The existing `ipc-channel-convention` covers the channel naming; this pattern is the layered subscribe-fanout shape that sits on top.

The `*-channel.ts` fanout layer (layer 2) is implemented via `registerSubscriberStream` from `packages/desktop/electron/main/stream-handler.ts` — it encapsulates the AbortController lifecycle, WebContents-alive push guard, envelope emission, error redaction, and companion `*.cancel` handler. See [streaming-ipc-channel-helpers](streaming-ipc-channel-helpers.md) for the full helper reference.

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

### Example 2: Course-create drafts channel — main-process fanout via helper
**File**: `packages/desktop/electron/main/course-create-drafts-channel.ts:27`
```typescript
registerSubscriberStream<DraftStreamEvent>(
  {
    channelBase: "praxis.courseCreate.drafts.events",
    log,
    webContentsGetter,
    activeAbortControllers,
  },
  { handle, on },
  {
    subscribe: (cb) => services.bootstrap.subscribe(cb),
  },
);
```

`registerSubscriberStream` (from `stream-handler.ts`) handles the AbortController lifecycle, WebContents-alive push guard, `{kind:"event"|"done"|"error"}` envelope emission, and companion `*.cancel` handler. See [streaming-ipc-channel-helpers](streaming-ipc-channel-helpers.md) for the full signature and all call sites.

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

The other two end-to-end instances are `services.activity` → `activity-channel.ts` → `activity-client.ts` → `useActivity` (`packages/ui/src/hooks/use-activity.ts:22`), and `services.quickCheck` → `quick-check-channel.ts` → `quick-check-client.ts` → `useQuickCheckBridge` (`packages/ui/src/hooks/use-quick-check-bridge.ts:38`). All channel-layer fanout uses `registerSubscriberStream`.

## When to Use

- New piece of mutable main-process state that 1+ renderer must reactively reflect (ambient progress, live drafts, pending HITL prompts; future: live notifications, live presence, live tool-call counters)
- Late joiners must see current state — the `snapshot` event is the contract that makes that work without a separate "fetch initial then subscribe" race

## When NOT to Use

- One-off computations that return a single value — use `transport.invoke` and a plain Promise
- Streaming work products from a one-shot operation (ingestion pipeline, agent turn) — those use `async function*` over `services.X.send/ingest()` rather than `subscribe(listener)`. The split is roughly: "subscribe-fanout" for shared mutable state visible to many subscribers; "async generator" for a per-call private stream

## Common Violations

- Forgetting to send `snapshot` on subscribe — fresh subscribers see an empty list until the next mutation, which can be minutes
- Inlining AbortController / push / finally boilerplate in a new channel instead of calling `registerSubscriberStream` — the helper handles the `wc.isDestroyed()` check, `signal.aborted` guard, envelope emission, error redaction, and `*.cancel` registration
- Skipping the `*.cancel` handler when rolling a custom channel — without it the AbortController is never aborted and the hold-open Promise never resolves, leaking the subscription for the renderer's lifetime
