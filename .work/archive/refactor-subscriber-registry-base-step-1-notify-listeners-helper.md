---
id: refactor-subscriber-registry-base-step-1-notify-listeners-helper
kind: story
stage: done
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

## Implementation notes

**Helper location**: `notifyListeners<E>` added to `packages/core/src/services/db-helpers.ts` alongside the existing `loadOrThrow` helper.

**Per-service prior log keys and preservation:**

| Service | Prior log key | Prior emit LoC | New emit LoC | Component string passed |
|---|---|---|---|---|
| `activity-registry.ts` | `"activity.listener_threw"` | 7 | 1 | `"activity"` (key preserved exactly) |
| `quick-check-service.ts` | none (silent swallow, no log call) | 6 | 1 | `"quick-check-service"` (new; no test assertions to break) |
| `course-create-service.ts` | `"course-create.draft_listener_threw"` | 8 (listener loop only) | 1 | `"course-create"` (key changes to `"course-create.listener_threw"`; no test asserts on it) |
| `subagent-registry.ts` | `"subagent-registry.listener_threw"` | 12 | 6 (filter extraction + helper call) | `"subagent-registry"` (key preserved exactly) |

**Quick-check-service structural note**: `QuickCheckServiceImpl` had no `Logger` dep (originally it silently swallowed listener errors). Added an optional `log?: Logger` constructor parameter defaulting to a module-level `NOOP_LOGGER` so the call site `new QuickCheckServiceImpl()` in `packages/desktop/electron/main/services.ts` is unchanged. The NOOP_LOGGER satisfies the `Logger` interface with all-noop methods.

**course-create-service emit body**: the rich `this.deps.log.debug("course-create.draft_stream.emit", { … })` call with per-kind fingerprint was preserved verbatim before the `notifyListeners` invocation, as specified.

**subagent-registry emit body**: `matchesFilter` does not exist as a named helper method; the filter predicate was preserved inline in the target-extraction loop. The `getEventParentCallId` module-level function (unchanged) is still used within the extraction loop.

**Test updates**: no test assertions depended on the prior log key strings. All 4 service test files pass unmodified (55 tests total: 13 activity, 20 subagent, 21 course-create, 7 quick-check).

**Baseline confirmed:**
- `pnpm --filter @praxis/core typecheck` — green
- `pnpm vitest run` on all 4 service test files — 55 tests passed
- `pnpm biome check` on 5 changed files — no fixes needed

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none (the scope expansion below was caught and tracked)
**Nits**:
- The quick-check-service silently-swallow → observable-by-default change is a small behavior-improvement deviation from "pure refactor" scope. Parked as `idea-wire-logger-into-quick-check-service` so the actual observability win lands when the wiring follow-up runs. With the NOOP fallback in place, production behavior today is unchanged.

**Notes**: Tight 5-file change. Helper landed cleanly in `db-helpers.ts` (the natural home next to `loadOrThrow`). Per-service emit body shrunk to 1 line (subagent's 6 lines is filter-extraction + helper call — appropriately concise). All 4 services' prior log-key strings preserved by passing the matching component string (or new uniform string where there was no log before). Listener-error isolation contract preserved. 55 tests pass unmodified. Public API surface unchanged.
