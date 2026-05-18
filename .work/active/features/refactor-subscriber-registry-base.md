---
id: refactor-subscriber-registry-base
kind: feature
stage: drafting
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Refactor: extract SubscriberRegistry<EventType> base for services

## Brief

The `subscriber-fanout-stream` pattern (documented at
`.claude/skills/patterns/subscriber-fanout-stream.md`) is implemented
correctly across several services, but each service reimplements the
`subscribe()` + `emit()` + per-listener error-isolation scaffolding from
scratch.

A reusable `SubscriberRegistry<EventType>` helper or base class would
consolidate ~20 LoC per service (snapshot-on-subscribe, listener Set
add/remove, try/catch around each listener call, snapshot-event emission
on connect).

This is **pure refactor** — the wire-level subscriber contract (the
events emitted, the snapshot-first semantic, the unsubscribe-returns-fn
shape) stays identical.

## Surface area

Services that own a subscriber registry today:

- `packages/core/src/services/activity-registry.ts:104-110, 217-225`
- `packages/core/src/services/course-create-service.ts:100-107, 119-150`
- `packages/core/src/services/subagent-registry.ts` (verify exact shape)
- `packages/core/src/services/quick-check-service.ts` (verify)

Each does roughly:

```ts
private listeners = new Set<Listener>();

subscribe(listener): () => void {
  listener({ kind: "snapshot", items: this.list() });
  this.listeners.add(listener);
  return () => { this.listeners.delete(listener); };
}

private emit(event): void {
  for (const listener of this.listeners) {
    try { listener(event); }
    catch (err) { this.deps.log.warn("..._listener_threw", { err: String(err) }); }
  }
}
```

Proposed helper:

```ts
// packages/core/src/services/_utils/subscriber-registry.ts
export class SubscriberRegistry<E> {
  constructor(private readonly opts: {
    snapshot: () => E;            // built lazily so we don't snapshot on every subscribe call site
    log: Logger;
    component: string;            // for error-log key
  }) {}
  subscribe(listener: (event: E) => void): () => void { … }
  emit(event: E): void { … }
}
```

## Why a feature (not a story)

- 3-4 service touch points across `packages/core/src/services/`
- Helper shape is a design decision (one base class vs two mixins; whether
  to support a snapshot factory or take a value)
- The subscriber-fanout-stream pattern doc may need a quick update to
  reference the new helper as the canonical implementation

## Discovery findings to design against

- 3+ services reimplement the same shape today
- Pattern is documented but only describes the producer-side semantics —
  doesn't currently mandate a shared base
- Already-existing channel `subscribe()` shape (snapshot-first) is
  load-bearing — UI hooks fold the first `snapshot` event into a Map.
  Don't break it.

## Out of scope

- Changing the subscriber event shape (snapshot vs delta delivery)
- Adding new services that should adopt the pattern but don't yet
- Restructuring the underlying IPC subscriber-fanout-stream consumer
  contract

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (all subscriber-related tests pass unmodified)
- [ ] At least 3 services (activity-registry, course-create-service,
      subagent-registry or quick-check) adopt the helper
- [ ] Per-listener error isolation preserved (one throwing listener
      doesn't break others — covered by existing tests)
- [ ] Pattern doc at `.claude/skills/patterns/subscriber-fanout-stream.md`
      references the helper as canonical (light update)

## Risk

**Low** — pure mechanical extract; pattern is already well-defined and
test-covered. Risk is forgetting an edge case (e.g., snapshot-on-subscribe
race) but each service's tests cover that.

## Rollback

`git revert <commit>` per service adoption is clean.
