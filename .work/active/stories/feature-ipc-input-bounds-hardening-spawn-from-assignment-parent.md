---
id: feature-ipc-input-bounds-hardening-spawn-from-assignment-parent
kind: story
stage: review
tags: [security]
parent: feature-ipc-input-bounds-hardening
depends_on: []
release_binding: null
gate_origin: security
created: 2026-05-23
updated: 2026-05-23
---

# `spawnFromAssignment` writes an unvalidated `parentSessionId` verbatim

## Severity
Low — from gate-security on release v0.1.4 (bundle didn't introduce; pre-existing).

## Domain
Input Validation & Injection (data-integrity flavour, not exploit)

## Location
`packages/core/src/services/session-service.ts:632-660`

## Evidence
```ts
// Update the session row to set parentSessionId.
this.deps.db
  .update(sessions)
  .set({ parentSessionId: input.parentSessionId })
  .where(eq(sessions.id, handle.sessionId))
  .run();
```

## Remediation direction
Resolve and verify the parent `sessions` row exists (and belongs to the
same student) before writing `parentSessionId`. SQL injection is not
possible (Drizzle parameterises), but a malicious or buggy caller can
plant a dangling `parent_session_id` that other code may dereference as
if real. In a local single-user Electron app this is a data-integrity
nit, not an attack surface — hence backlog.

## Implementation notes

**Validation logic added** — at the top of `spawnFromAssignment` (before the assignment
lookup), the method now:
1. Resolves `studentId` via `getOrCreateDefaultStudentId(this.deps.db)` (matches pattern
   used in `start()` and other service methods).
2. Queries the `sessions` table for the `parentSessionId` row.
3. Throws `"Parent session not found: <id>"` if no row exists.
4. Throws `"Parent session belongs to a different student"` if the row's `studentId`
   doesn't match — message does not leak the parent's studentId per security convention.

**Error format** — `throw new Error(...)` with a descriptive string, matching the sibling
`"Assignment not found: <id>"` pattern on line 639.

**Tests added** — 2 new negative-path tests appended to the existing
`SessionServiceImpl.spawnFromAssignment` describe block in
`packages/core/src/services/__tests__/session-service.notify.test.ts`:
- `"throws when parentSessionId does not exist"` — passes a fresh `uuidv7()` as parentSessionId.
- `"throws when parentSessionId belongs to a different student"` — inserts a session owned by a
  different student UUID and expects the cross-student error.

Both tests were verified to fail before the fix and pass after (confirmed by running in isolation).
Total suite: 1148 tests, all green. Typecheck: clean.
