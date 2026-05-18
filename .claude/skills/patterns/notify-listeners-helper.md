# notify-listeners-helper

A single `notifyListeners(listeners, event, log, component)` helper in
`packages/core/src/services/db-helpers.ts` is the canonical loop used by
every service that holds a `Set<Listener>` to fan an event out with
per-listener error isolation. Logs `${component}.listener_threw` and never
throws.

## Rationale

The `refactor-subscriber-registry-base` work concluded that the only piece
of "subscriber registry" scaffolding worth factoring out was the
listener-loop with per-listener try/catch — the actual `Set<Listener>`
lifecycle, snapshot-on-subscribe, filter semantics, and event shape differ
enough per service that a base class wasn't justified.

The shared piece IS the fanout. Four services now call this helper in
their private `emit()` instead of duplicating the for/try/catch/log loop.

This sits BELOW [subscriber-fanout-stream](subscriber-fanout-stream.md):
that pattern documents the four-layer cross-process flow; this one
documents how the service layer's `emit()` is implemented.

## Examples

### Example 1: ActivityRegistry.emit

**File**: `packages/core/src/services/activity-registry.ts:218`

```ts
private emit(event: ActivityEvent): void {
  notifyListeners(this.listeners, event, this.deps.log, "activity");
}
```

### Example 2: QuickCheckServiceImpl.emit

**File**: `packages/core/src/services/quick-check-service.ts:105`

```ts
private emit(event: QuickCheckEvent): void {
  notifyListeners(this.listeners, event, this.log, "quick-check-service");
}
```

### Example 3: SubAgentRegistryImpl.emit (with pre-filtering)

**File**: `packages/core/src/services/subagent-registry.ts:207`

```ts
private emit(event: SubAgentEvent): void {
  const targets: SubAgentListener[] = [];
  for (const { listener, filter } of this.listenerEntries) {
    if (filter?.parentCallId !== undefined) {
      const eventParentCallId = getEventParentCallId(event);
      if (eventParentCallId !== null && eventParentCallId !== filter.parentCallId) continue;
    }
    targets.push(listener);
  }
  notifyListeners(targets, event, this.deps.log, "subagent-registry");
}
```

### Example 4: CourseCreateServiceImpl.emit

**File**: `packages/core/src/services/course-create-service.ts:138`

```ts
notifyListeners(this.listeners, event, this.deps.log, "course-create");
```

Helper definition: `packages/core/src/services/db-helpers.ts:39`.

## When to Use

- Inside a service's private `emit(event)` after determining the set of
  target listeners — pass the resolved iterable to the helper.
- Whenever a service holds `Set<Listener>` (or a derived filtered view of
  it) and needs per-listener error isolation.

## When NOT to Use

- Subscriber lifecycle, `snapshot` delivery on subscribe, and unsubscribe
  semantics — those stay in the service (they vary per service: linger
  timers, max-N caps, filtered subscribes).
- Cross-process fanout — that's the IPC channel's job; the service stays
  in-process.
- Non-service event emitters (e.g. UI internals, indexer scheduling) where
  there's no shared `Set<Listener>` shape.

## Common Violations

- Inlining `for (const l of listeners) { try { l(event); } catch (err) { log.warn(...) } }`
  in a new service — call `notifyListeners` instead so the log key
  (`${component}.listener_threw`) is uniform and a future
  fanout-strategy change is one-file.
- Letting a listener exception bubble out of `emit()` and kill the call
  path that triggered the event.
- Passing the listeners' identity-tracking structure (e.g.
  `Set<{listener, filter}>`) directly — the helper takes
  `Iterable<(event) => void>`, so build the target listener list first.
