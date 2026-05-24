---
id: feature-empty-session-cleanup-registry
kind: story
stage: implementing
tags: [core, sessions, cleanup]
parent: feature-empty-session-cleanup
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# SessionPromotionRegistry service

## Brief

Create the `SessionPromotionRegistry` in-memory service that owns the map of
unpromoted sessions. Per the parent feature design, this is the single source
of truth that both `SessionService` (lazy-persist + promote-on-first-message)
and `TabsService` (orphan-tab cleanup in sweep) consult.

## Scope

Implement the service per the parent feature body's Unit 1 spec.

**File**: `packages/core/src/services/session/session-promotion-registry.ts`

### Interface

```typescript
export interface UnpromotedSessionState {
  sessionId: SessionId;
  studentId: StudentId;
  modeId: string;
  engineId: string;
  courseId?: CourseId;
  assignmentId?: AssignmentId;
  startedAt: Timestamp;
}

export interface SessionPromotionRegistry {
  register(state: UnpromotedSessionState): void;
  get(sessionId: SessionId): UnpromotedSessionState | null;
  promote<T>(sessionId: SessionId, txFn: (state: UnpromotedSessionState) => T): T;
  discard(sessionId: SessionId): Promise<void>;
  entries(): IterableIterator<[SessionId, UnpromotedSessionState]>;
}

export class SessionPromotionRegistryImpl implements SessionPromotionRegistry {
  // map-based impl
}
```

### Implementation Notes

- Inject `engineSessionManager` via the `lazy-resolver-thunk` pattern (`() => EngineSessionManager`)
  to defer construction-order coupling.
- `discard()` is idempotent and best-effort: lookup → engine close → DELETE
  tabs WHERE session_id → log → map.delete. Catch and log any per-step error;
  proceed to the next step.
- `promote()` is synchronous: the caller passes a `txFn` that runs the
  persistence inside an SQLite transaction. Registry removal happens after
  txFn returns successfully (within the same caller-managed tx).
- Wire into `ServiceDeps` and `buildServices` in `packages/desktop/electron/main/services.ts`.

## Acceptance Criteria

- [ ] `register` followed by `get` returns the same state object reference (or structural equivalent).
- [ ] `promote` returns the txFn's return value and removes the entry on success.
- [ ] `promote` throws (with a clear typed error) when sessionId is not registered.
- [ ] `discard` is idempotent (calling twice doesn't throw).
- [ ] `discard` calls `engineSessionManager.close(sessionId)`.
- [ ] `discard` executes `DELETE FROM tabs WHERE session_id = ?`.
- [ ] `entries()` reflects registered-but-not-yet-promoted-or-discarded.
- [ ] Unit tests cover all methods + the per-step idempotency of `discard`.
- [ ] `pnpm typecheck && pnpm lint && pnpm --filter @praxis/core test` green.

## Out of scope

- Wiring into `SessionService.start` / `send` (that's the lazy-and-sweep story).
- The sweep indexer (also the lazy-and-sweep story).
- Any IPC changes.
