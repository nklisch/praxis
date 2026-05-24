---
id: gate-security-spawn-from-assignment-parent-validation
kind: story
stage: backlog
tags: [security]
parent: null
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
