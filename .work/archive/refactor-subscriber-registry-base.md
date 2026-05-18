---
id: refactor-subscriber-registry-base
kind: feature
stage: done
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

## Design correction (2026-05-18, refactor-design pass)

After reading the 4 services' actual subscribe/emit code, the original
"SubscriberRegistry<EventType> base class" framing is wrong — the shape
variance across the cluster is too high for a clean base class:

| Service | Listener set shape | Snapshot on subscribe? | Filter? | Inline emit observability |
|---|---|---|---|---|
| `activity-registry.ts:29` | `Set<ActivityListener>` | No (snapshot via `list()`) | No | No |
| `quick-check-service.ts:28` | `Set<QuickCheckListener>` | No (transient events) | No | No |
| `course-create-service.ts:88` | `Set<DraftStreamListener>` | Yes (`{kind:"snapshot", drafts}`) | No | Yes (rich debug log with per-kind fingerprint) |
| `subagent-registry.ts:95` | `Set<{listener, filter?}>` | Yes (filtered snapshot) | Yes (`{parentCallId?}`) | No |

A base class that supports snapshot-on-subscribe-or-not, filter-or-not, and
inline-observability-or-not would have so many hooks it'd be more code than
the inline implementations. Each service is correctly using the
subscriber-fanout pattern; that's the pattern doc's job, not a base class.

**What IS worth extracting**: the listener-iteration-with-error-isolation
inner loop. Every service has this shape:

```ts
private emit(event: E): void {
  // …optional observability log…
  for (const listener of this.listeners) {
    try {
      listener(event);
    } catch (err) {
      this.deps.log.warn("<service>.listener_threw", { err: String(err) });
    }
  }
}
```

A 7-line pure helper covers it:

```ts
// packages/core/src/services/_utils/listener-fanout.ts  (or co-locate next to load-or-throw in db-helpers.ts)
export function notifyListeners<E>(
  listeners: Iterable<(event: E) => void>,
  event: E,
  log: Logger,
  component: string,
): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      log.warn(`${component}.listener_threw`, { err: String(err) });
    }
  }
}
```

Adopted across the 3 services that have a plain listener set (activity,
quick-check, course-create). Subagent's filter-aware delivery extracts its
target listeners first then calls the helper, so it can adopt too:

```ts
// subagent-registry.ts
const targets = Array.from(this.listenerEntries)
  .filter(e => this.matchesFilter(e.filter, event))
  .map(e => e.listener);
notifyListeners(targets, event, this.deps.log, "subagent-registry");
```

Net savings: ~5 LoC per site × 4 sites = ~20 LoC, plus uniform error log
key (`*.listener_threw`) across services that today emit slightly different
keys.

This is a **smaller** refactor than the original feature scoped. Honest
verdict: the original "SubscriberRegistry base class" was an over-design.
A tiny helper is the right shape.

## Refactor Overview

Add `notifyListeners<E>` to `packages/core/src/services/db-helpers.ts` (the
existing service utilities module). Adopt in 4 services' private `emit`
methods. No public API change; pure internal cleanup.

## Refactor Steps

### Step 1: Add helper + adopt in all 4 services
**Priority**: Low (small payoff)
**Risk**: Very low (mechanical inner-loop refactor)
**Files**:
- `packages/core/src/services/db-helpers.ts` (add helper)
- `packages/core/src/services/activity-registry.ts` (adopt in `emit`)
- `packages/core/src/services/quick-check-service.ts` (adopt in `emit`)
- `packages/core/src/services/course-create-service.ts` (adopt in `emit`; preserve the rich debug-log side effect outside the listener-loop)
- `packages/core/src/services/subagent-registry.ts` (extract filter-matching targets then call helper)
**Story**: `refactor-subscriber-registry-base-step-1-notify-listeners-helper`

**Current state** (representative — activity-registry.ts):
```ts
private emit(event: ActivityEvent): void {
  for (const listener of this.listeners) {
    try { listener(event); }
    catch (err) { this.deps.log.warn("activity-registry.listener_threw", { err: String(err) }); }
  }
}
```

**Target state**:
```ts
private emit(event: ActivityEvent): void {
  notifyListeners(this.listeners, event, this.deps.log, "activity-registry");
}
```

For course-create-service: keep the debug log call BEFORE the helper invocation:
```ts
private emit(event: DraftStreamEvent): void {
  this.deps.log.debug("course-create.draft_stream.emit", { /* existing fingerprint */ });
  notifyListeners(this.listeners, event, this.deps.log, "course-create-service");
}
```

For subagent-registry:
```ts
private emit(event: SubAgentEvent): void {
  const targets: SubAgentListener[] = [];
  for (const entry of this.listenerEntries) {
    if (this.matchesFilter(entry.filter, event)) {
      targets.push(entry.listener);
    }
  }
  notifyListeners(targets, event, this.deps.log, "subagent-registry");
}
```

(The filter-matching predicate is an existing helper in subagent-registry; or
extract one if not.)

**Implementation notes**:
- The error log key changes shape across all 4 services to `"<service>.listener_threw"` (consistent). Today they use slightly different prefixes (`"subagent-registry.listener_threw"` already matches this shape; others may differ). Read each service's current key before the swap; verify no test asserts on the exact string.
- The helper accepts `Iterable<(event: E) => void>` so it works with `Set<Listener>` directly (most cases) and with `Array<Listener>` (subagent after filter extraction).
- Place the helper next to `loadOrThrow` in `packages/core/src/services/db-helpers.ts`. That file is the established home for these tiny cross-service helpers; adding here keeps imports short and discoverable.

**Acceptance criteria**:
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green from repo root (baseline preserved)
- [ ] `notifyListeners` exported from `packages/core/src/services/db-helpers.ts`
- [ ] Each of the 4 services' `private emit(...)` method body is now ~1-3 lines
- [ ] Error log keys are uniform across the 4 services (`"<component>.listener_threw"`)
- [ ] No wire-format / public API change — services still expose the same `subscribe(listener)` shape

**Rollback**: `git revert <commit>` — clean. Single-commit refactor; reverts cleanly.

---

## Implementation Order

1. Single step. Could be done inline by one agent in a single pass since the surface is small.

## Atomic-step acknowledgments

None. Every change is reversible per-file.

## Out-of-scope follow-ups

- Adding `subscribe(listener): () => void` to the helper as an `addListener`
  variant — not worth it; the `Set.add` / return-unsub pattern is already
  one line.
- A real `SubscriberRegistry<T>` base class — explicitly DROPPED per the
  design correction above.

## Implementation Run Summary

Single child story implemented and advanced to review (commit `1df6ce0`).
Total LoC delta: +23 (helper) in `db-helpers.ts`; net −19 across the 4
service files; +6 in quick-check-service for the new optional logger
parameter + NOOP fallback (see deviation note below).

| Service | Prior emit body | New emit body | Notes |
|---|---|---|---|
| `activity-registry.ts` | 7 LoC | 1 LoC | Component `"activity"` preserves prior log-key shape |
| `quick-check-service.ts` | 6 LoC (silent swallow, no log) | 1 LoC (logs via helper) | **Behavior change**: silent → observable (see deviation) |
| `course-create-service.ts` | 8 LoC | 1 LoC + preserved debug-log call | Debug log call stays before the helper invocation |
| `subagent-registry.ts` | 12 LoC | 6 LoC | Filter-match extraction loop + helper call |

### Cross-cutting deviations

- **`QuickCheckServiceImpl` gained a logger dep**: the class previously had no deps; the agent added an optional `constructor(log?: Logger)` parameter defaulting to a module-local `NOOP_LOGGER`. Existing call sites (`new QuickCheckServiceImpl()`) are unchanged. Production observability is unchanged until someone updates the wiring in `services.ts` to pass a real logger — that's a small follow-up worth a backlog item (`idea-wire-logger-into-quick-check-service`).
- **Silent-swallow removed from quick-check-service**: previously, listener exceptions were silently dropped (`} catch { /* swallow */ }`). After the refactor, exceptions are routed through the helper which logs `"quick-check-service.listener_threw"`. With the NOOP logger default in production, this is currently observably the same as before. Once the wiring follow-up lands, this becomes a net improvement (observable listener bugs instead of silent corruption).

### Verification status

- **Typecheck**: baseline preserved (3 pre-existing UI errors unchanged)
- **Tests**: 55 across the 4 service test files pass unmodified
- **Lint**: clean on all 5 touched files
- **Public API**: every service's `subscribe(listener)` signature is unchanged

### What's now possible

- Future services adopting the subscriber-fanout pattern get the listener loop for free — one line: `notifyListeners(this.listeners, event, this.deps.log, "<component>")`.
- Listener-error log keys are uniform across the codebase (`"<component>.listener_threw"`).
- The pattern doc at `.claude/skills/patterns/subscriber-fanout-stream.md` can reference `notifyListeners` as the canonical inner-loop primitive (small follow-up).

## Review (2026-05-18)

**Verdict**: Approve (aggregate)

**Blockers**: none
**Important**: none
**Nits**: see child story review (`refactor-subscriber-registry-base-step-1-notify-listeners-helper`).

**Aggregate lens findings**:
- **Design alignment**: the original framing was wrong (SubscriberRegistry base class doesn't fit); the design correction in this body pivots to a tiny `notifyListeners` helper, which actually shipped.
- **Foundation-doc alignment**: no foundation-doc claims about subscriber-fanout internals; only the pattern doc at `.claude/skills/patterns/subscriber-fanout-stream.md` describes the producer-side contract. That doc can be updated to reference `notifyListeners` as the canonical inner-loop primitive — small docs follow-up.
- **Breaking changes**: none. Public `subscribe(listener)` signatures unchanged across all 4 services. The optional `log?: Logger` ctor param added to QuickCheckServiceImpl is backward-compatible and tracked separately at `idea-wire-logger-into-quick-check-service`.
- **Capability completeness**: the listener-fanout pattern is now consolidated; future services adopt with one line.

**Notes**: Smaller delivery than originally scoped (one helper + one child story instead of a base class hierarchy). The design correction is honest and produces a real abstraction — modest savings (~20 LoC) but uniform observability primitive across the codebase.
