---
id: gate-docs-contract-session-active-modeid
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

# `docs/CONTRACT.md` `SessionService.active` signature drops the new `modeId` filter

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/CONTRACT.md:855`
- Code: `packages/core/src/types/session-client.ts:23`

## Current doc text
> `active(): Promise<SessionHandle | null>;`

## Reality
`SessionService.active` accepts `opts?: { modeId?: string }` and returns
the most-recent open session for the student filtered by mode when
provided. Implemented at `packages/core/src/services/session-service.ts:46`;
IPC schema `sessionActiveSchema` at
`packages/desktop/electron/main/session-channel.ts:46`.

## Required edit
Replace line 855 with:
```typescript
active(opts?: { modeId?: string }): Promise<SessionHandle | null>;
```
Add a single-line JSDoc above noting that when `modeId` is provided,
the most-recent open session of that mode is returned (used by the
configure-route to reuse one configure session per student).

## Implementation notes
Updated `docs/CONTRACT.md` line 855: replaced the bare `active()` signature with `active(opts?: { modeId?: string })` and added a 2-line JSDoc describing the mode-filter behavior, matching the prose style of the adjacent `spawnFromAssignment` and `spawnFromNote` JSDoc blocks. Confirmed `packages/core/src/types/session-client.ts:23` matched the story's claimed signature exactly. `pnpm typecheck` passed with no new errors.

## Review

Verdict: **done** (no blockers, no findings).

- `packages/core/src/types/session-client.ts:23` reads `active(opts?: { modeId?: string }): Promise<SessionHandle | null>;` — exact match with the updated CONTRACT.md signature.
- JSDoc prose style is consistent with the adjacent `spawnFromAssignment` and `spawnFromNote` blocks.
- No follow-up items warranted.
