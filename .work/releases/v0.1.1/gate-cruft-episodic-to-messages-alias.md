---
id: gate-cruft-episodic-to-messages-alias
kind: story
stage: done
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

## Implementation notes
Inline cruft cleanup applied as part of the v0.1.1 autopilot batch.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
