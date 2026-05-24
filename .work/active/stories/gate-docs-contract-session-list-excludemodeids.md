---
id: gate-docs-contract-session-list-excludemodeids
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: docs
created: 2026-05-23
updated: 2026-05-23
---

# `docs/CONTRACT.md` Phase-14 `SessionService.list` signature missing `excludeModeIds`

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/CONTRACT.md:1258`
- Code: `packages/core/src/types/session-client.ts:33-37`

## Current doc text
> `list(opts?: { includeEnded?: boolean; limit?: number }): Promise<SessionSummary[]>;`

## Reality
`list` accepts an `excludeModeIds?: string[]` filter applied at the DB
layer via `notInArray(sessions.modeId, ...)` so `limit` counts only
non-excluded sessions. The library hook
(`packages/ui/src/hooks/use-library.ts`) now passes
`excludeModeIds: ["configure"]` to suppress configure sessions from the
library catalog.

## Required edit
Replace line 1258 with:
```typescript
list(opts?: {
  includeEnded?: boolean;
  limit?: number;
  excludeModeIds?: string[];
}): Promise<SessionSummary[]>;
```
Note in the surrounding prose that `excludeModeIds` is filtered
server-side before `LIMIT`, and that the library catalog uses it to
hide `configure` sessions.
