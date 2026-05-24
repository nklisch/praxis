---
id: story-refactor-where-predicate-naming-consistency
kind: story
stage: implementing
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-23
---

# Rename `predicates` → `conditions` in `session-service.ts` for `dynamic-where-predicate` consistency

## Brief
The `dynamic-where-predicate` pattern (see
`.claude/skills/patterns/dynamic-where-predicate.md`) is used in 5+ Drizzle queries.
Four sites name the array `conditions`; one site names it `predicates`. Renaming the
outlier makes the pattern uniformly greppable.

## Sites
**Conformant (`conditions`):**
- `packages/core/src/services/flashcards-service.ts:113–120`
- `packages/core/src/services/notes-service.ts:174–180`
- `packages/core/src/services/library-service.ts:63–78`
- `packages/core/src/services/library-service.ts:154–164`

**Outlier (`predicates`):**
- `packages/core/src/services/session-service.ts:448–458`

## Target
Rename the local `predicates` variable to `conditions` in
`session-service.ts:448–458`. Single-file, single-symbol rename. Update any nearby
comments that reference the old name.

## Value tier: Low
Style consistency only. Worth doing because it makes future searches for the pattern
deterministic, but no functional value.

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` green
- `grep -rn "const predicates" packages/core/src/services/` returns no hits for this
  pattern usage
- `grep -rn "const conditions" packages/core/src/services/` returns all five sites
