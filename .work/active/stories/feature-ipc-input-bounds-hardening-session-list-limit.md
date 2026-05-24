---
id: feature-ipc-input-bounds-hardening-session-list-limit
kind: story
stage: implementing
tags: [security]
parent: feature-ipc-input-bounds-hardening
depends_on: []
release_binding: null
gate_origin: security
created: 2026-05-23
updated: 2026-05-23
---

# `session.list` IPC has no upper bound on `limit` or `excludeModeIds` array length

## Severity
Low — from gate-security on release v0.1.4 (the schema was extended this
release to add `excludeModeIds`; pre-existing `limit` is unbounded too).

## Domain
API Security / Resource Exhaustion

## Location
`packages/desktop/electron/main/session-channel.ts:171-178`

## Evidence
```ts
const sessionListSchema = z.object({
  includeEnded: z.boolean().optional(),
  limit: z.number().int().positive().optional(),
  excludeModeIds: z.array(z.string()).optional(),
}).optional();
```

## Remediation direction
Add `.max(N)` to `limit` (e.g. 1000) and to `excludeModeIds` (e.g. 32) so
a renderer that asks for `limit: 2^31` doesn't read the entire history
table in one IPC call, and to bound the eventual `NOT IN (?, ?, …)`
clause. The follow-up `firstEvent` lookup is N round-trips per row
(already flagged as a TODO in the code comment), so very large `limit`
values amplify cost.
