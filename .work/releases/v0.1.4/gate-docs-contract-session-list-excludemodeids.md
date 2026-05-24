---
id: gate-docs-contract-session-list-excludemodeids
kind: story
stage: done
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

## Implementation notes
Expanded the single-line `list(opts?:...)` declaration in `docs/CONTRACT.md` (actual line 1263, ±5 from story's 1258 due to prior sibling edit) into the multi-line form matching `session-client.ts:33-37`, and added a prose sentence explaining that `excludeModeIds` is filtered at the DB layer before `limit` is applied and that the library catalog uses `["configure"]`. `pnpm typecheck` passed with no errors.

## Review
Verdict: **done** (no blockers).

Cross-check against `packages/core/src/types/session-client.ts:33-37` confirms the multi-line signature in CONTRACT.md is an exact match — `includeEnded?`, `limit?`, and `excludeModeIds?` in the same order. The accompanying prose sentence correctly describes the DB-layer filtering and the `["configure"]` catalog use-case. No findings.
