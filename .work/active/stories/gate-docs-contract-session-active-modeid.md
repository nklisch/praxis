---
id: gate-docs-contract-session-active-modeid
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
