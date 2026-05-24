---
id: feature-ipc-input-bounds-hardening
kind: feature
stage: done
tags: [security]
parent: null
depends_on: []
release_binding: null
gate_origin: security
created: 2026-05-23
updated: 2026-05-23
---

# IPC input bounds hardening

## Brief
Three v0.1.4 gate-security findings share the same shape: IPC schemas accept inputs
without upper bounds or ownership validation, leaving the backend to defensively cap
unbounded values (or, in one case, write them unchecked). All three are Low severity
in a local-first single-user Electron app — none are exploits, all are data-integrity
or self-DoS knobs — but together they show a missing codebase convention for IPC
input bounds.

This feature picks a convention once, applies it uniformly across the three known
sites, and establishes the pattern so the next IPC schema follows it without
re-deriving it.

## Findings (child stories)
- `feature-ipc-input-bounds-hardening-session-list-limit` —
  `session.list`'s `limit` and `excludeModeIds` have no upper bound; a renderer
  asking for `limit: 2^31` would scan the whole sessions table.
  (`packages/desktop/electron/main/session-channel.ts:171–178`)
- `feature-ipc-input-bounds-hardening-spawn-from-assignment-parent` —
  `spawnFromAssignment` writes `parentSessionId` verbatim without verifying the
  parent session exists or belongs to the same student. Risk is dangling
  `parent_session_id` that other code may dereference as if real.
  (`packages/core/src/services/session-service.ts:632–660`)
- `feature-ipc-input-bounds-hardening-spawn-from-passage-offset` —
  `spawnFromPassage` has no upper bound on `endOffset`; full document text is
  loaded and concatenated per call.
  (`packages/core/src/services/session-service.ts:802–814`)

## Design questions for the per-feature pass
- **Convention for bounds**: per-domain constants module
  (`packages/desktop/electron/main/limits.ts` or similar), inline `.max(N)` per
  schema, or a Zod helper (`boundedArray`, `boundedLimit`)?
- **Convention for ownership validation**: helper at the service boundary
  (`assertSessionBelongsToStudent(id, studentId)`), or inline `loadOrThrow` per
  caller? Tie into the existing `server-resolved-student-id` pattern.
- **Where docs live**: extend `.claude/skills/patterns/` with a new IPC-input-
  validation pattern or update an existing one?
- **Scope discipline**: apply only to the 3 known sites, or sweep all IPC schemas
  in this pass? Recommend: 3 known sites + leave a roll-up TODO for unbounded
  schemas to be picked up by gate-security in future releases.

## Constraints
- Local-first single-user app — don't over-engineer. The threat model is "buggy
  or misbehaving renderer" not "remote attacker."
- The convention must read well at-a-glance in `<domain>-channel.ts` files — IPC
  schemas already carry meaningful Zod chains; the bounds shouldn't visually
  drown the rest.
- Per `.claude/skills/patterns/ipc-envelope-handler.md` and
  `server-resolved-student-id`, the IPC layer already has a hard guard on student
  identity; the new convention layers on top, doesn't replace.

## Next
Per-feature design via `/agile-workflow:feature-design feature-ipc-input-bounds-hardening`
to lock the convention, then drain the three child stories.

## Resolution

This feature was scoped as a **cluster bucket** with a hoped-for design pass to lock
a codebase-wide convention for IPC input bounds. In practice the children were
implemented standalone with reasonable inline values (`limit: 1000`, `excludeModeIds: 32`,
`MAX_PASSAGE_OFFSET: 10_000_000`, `MAX_PASSAGE_LENGTH: 100_000`) and parent ownership
validation.

All children advanced to `done` in this autopilot run:

- `feature-ipc-input-bounds-hardening-session-list-limit` (done)
- `feature-ipc-input-bounds-hardening-spawn-from-assignment-parent` (done)
- `feature-ipc-input-bounds-hardening-spawn-from-passage-offset` (done)

A future story can extract these into a shared convention module if a similar bound
is needed for another IPC schema. Until then, the inline values are reasonable and
each schema documents its rationale via a comment.
