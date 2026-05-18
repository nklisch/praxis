---
id: refactor-subscriber-registry-base-step-1-notify-listeners-helper
kind: story
stage: implementing
tags: [refactor]
parent: refactor-subscriber-registry-base
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Step 1: add notifyListeners helper and adopt in 4 services

## Brief

Add a tiny `notifyListeners<E>(listeners, event, log, component)` helper to
`packages/core/src/services/db-helpers.ts` and adopt it in the `private emit`
methods of the 4 services that follow the subscriber-fanout pattern.

The original feature scoped this as a "SubscriberRegistry<T> base class"
extraction. After reading the code, the cluster has more shape variance
than fits a clean base class (snapshot-on-subscribe split 2/2; subagent has
filter-aware delivery; course-create has rich inline observability). The
honest extract is the listener-iteration-with-error-isolation inner loop —
a 7-line pure helper. See the parent feature body's "Design correction"
section for the full rationale.

## Files (4 edits + 1 add)

- `packages/core/src/services/db-helpers.ts` — add `notifyListeners<E>` next to `loadOrThrow`
- `packages/core/src/services/activity-registry.ts` — adopt in private `emit`
- `packages/core/src/services/quick-check-service.ts` — adopt in private `emit`
- `packages/core/src/services/course-create-service.ts` — adopt in private `emit`; preserve the rich debug-log call BEFORE the helper invocation
- `packages/core/src/services/subagent-registry.ts` — extract filter-matched target listeners first, then call the helper

## Helper signature

```ts
// packages/core/src/services/db-helpers.ts (alongside loadOrThrow)
import type { Logger } from "../types/index.js";

/**
 * Fan out an event to a collection of subscribers with per-listener error
 * isolation. A throwing listener is logged with `${component}.listener_threw`
 * and does NOT prevent later listeners from receiving the event.
 *
 * Use inside a service's private `emit(event)` method to consolidate the
 * shared listener-loop scaffolding.
 */
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

## Per-service adoption

### activity-registry.ts

```ts
// Before (current emit body):
private emit(event: ActivityEvent): void {
  for (const listener of this.listeners) {
    try { listener(event); }
    catch (err) { this.deps.log.warn("activity-registry.listener_threw", { err: String(err) }); }
  }
}

// After:
private emit(event: ActivityEvent): void {
  notifyListeners(this.listeners, event, this.deps.log, "activity-registry");
}
```

### quick-check-service.ts

Same shape as activity. Use `component: "quick-check-service"`.

### course-create-service.ts

Preserve the existing debug log call BEFORE the listener fanout. The debug
log is on the service (not per-listener), so it stays outside the helper:

```ts
private emit(event: DraftStreamEvent): void {
  this.deps.log.debug("course-create.draft_stream.emit", {
    eventKind: event.kind,
    listenerCount: this.listeners.size,
    // … existing per-kind fingerprint preserved verbatim
  });
  notifyListeners(this.listeners, event, this.deps.log, "course-create-service");
}
```

### subagent-registry.ts

Extract the filter-matched target listeners first, then call the helper:

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

If `matchesFilter` doesn't exist as a private method today, inline the
filter-match logic into the loop (you may already see this pattern in the
current emit body — preserve its semantics exactly).

## Implementation notes

- The error log key shape changes for some services. Read each current `emit` body and confirm:
  - `activity-registry`: today may use `"activity-registry.listener_threw"` or similar — likely matches `${component}.listener_threw` already. Verify with grep.
  - `quick-check-service`: today's key — likely `"quickcheck.listener_threw"` or `"quick-check.listener_threw"`. Verify.
  - `course-create-service`: today's key — verify.
  - `subagent-registry`: already uses `"subagent-registry.listener_threw"` (read it earlier — line 105).
- If a test asserts on the exact prior log-key string, either: update the assertion to the new uniform shape, OR pass the exact prior component string as the 4th arg to preserve compatibility. Recommend the latter — preserve existing strings so tests pass unmodified.
- The helper accepts `Iterable<(event: E) => void>`, which works with both `Set<Listener>` (the natural store) and `Array<Listener>` (subagent's filter-extracted targets).
- Single commit, even though it touches 5 files — the changes are mechanically uniform and roll back together cleanly.

## Tests to verify

- `pnpm --filter @praxis/core typecheck`
- `pnpm vitest run packages/core/src/services/__tests__/activity-registry.test.ts packages/core/src/services/__tests__/quick-check-service.test.ts packages/core/src/services/__tests__/subagent-registry.test.ts packages/core/src/__tests__/course-create-service.test.ts`
- `pnpm biome check packages/core/src/services/db-helpers.ts packages/core/src/services/activity-registry.ts packages/core/src/services/quick-check-service.ts packages/core/src/services/course-create-service.ts packages/core/src/services/subagent-registry.ts`

Critical to preserve:
- Listener exceptions still get logged and don't break other listeners
- Subagent's filter-aware delivery still works (filtered listeners receive matching events; non-matching events skip them)
- Course-create's debug log still emits before the listener fanout

## Acceptance criteria

- [ ] `notifyListeners` exported from `packages/core/src/services/db-helpers.ts`
- [ ] All 4 services' `private emit` bodies are ~1-3 lines (subagent's is slightly longer due to filter extraction; that's fine)
- [ ] Typecheck/lint/test green (baseline preserved — 3 pre-existing UI typecheck errors, `.mockups/**` lint debt, flaky `use-fragment-overrides` test all unchanged)
- [ ] Per-listener error isolation still works (verify via existing `listener_threw` tests if present, or add one if not)
- [ ] No public API change — `subscribe(listener)` signature on every service is unchanged

## Risk

**Very low** — pure inner-loop helper extract. Each service's behavior is preserved exactly. Tests cover the listener-isolation guarantee.

## Rollback

`git revert <commit>` — clean single commit reverts all 5 file changes.
