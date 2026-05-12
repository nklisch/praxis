---
id: gate-cruft-episodic-to-messages-alias
kind: story
stage: implementing
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: cruft
created: 2026-05-12
updated: 2026-05-12
---

# Unused `episodicToMessages` alias kept "for the transition" with zero callers

## Confidence
High

## Category
compatibility shim

## Location
`packages/ui/src/hooks/episodic-to-messages.ts:312-316`

## Evidence
```ts
/**
 * @deprecated Use `episodicToItems` instead. Returns `ChatStreamItem[]` now.
 * This alias exists for the transition; it will be removed in a follow-up.
 */
export const episodicToMessages = episodicToItems;
```

Repo-wide grep across `packages/`, `tests/`, `scripts/` (excluding `dist/`) returns zero callers.

## Removal
Delete lines 312-316. The comment promised removal "in a follow-up" — this is that moment.
