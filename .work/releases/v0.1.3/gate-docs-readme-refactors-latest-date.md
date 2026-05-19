---
id: gate-docs-readme-refactors-latest-date
kind: story
stage: done
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: docs
created: 2026-05-18
updated: 2026-05-18
---

# README `docs/refactors/` line cites the wrong latest date

## Drift category
readme-staleness

## Location
- Doc: `README.md:252`
- Filesystem: `docs/refactors/2026-05-post-phase-14-ui.md`

## Current doc text
> - `docs/refactors/` — refactor plans (latest: post-phase-12)

## Reality
`docs/refactors/` contains `2026-04-post-phase-4.md`,
`2026-04-post-phase-12.md`, and `2026-05-post-phase-14-ui.md`. The
post-phase-14-UI plan is the latest.

## Required edit
Either update the parenthetical to `(latest: post-phase-14-UI)` or drop it
entirely — the directory's filename date prefix already conveys recency.

## Implementation notes (2026-05-18)

Dropped the parenthetical entirely. The filename date prefix
(`2026-04-...`, `2026-05-...`) already conveys recency without anyone
needing to update the README on every refactor doc.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Parenthetical `(latest: post-phase-12)` dropped from README.md line 252. Verified — line no longer contains any "latest:" text. Self-documenting via filename dates is the better convention.
