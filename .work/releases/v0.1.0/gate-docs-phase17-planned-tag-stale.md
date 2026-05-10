---
id: gate-docs-phase17-planned-tag-stale
kind: story
stage: done
tags: [documentation]
parent: feature-release-v0.1.0-doc-findings
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# Foundation docs tag Phase 17 sections as "(Phase 17, planned)" — Phase 17 shipped

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/SPEC.md:109`, `docs/CURRICULUM.md:278`,
  `docs/UX.md:435,453`
- Code: `packages/curriculum/src/modes/teach.ts:53-58`,
  `packages/tools/src/quick-check/`,
  `packages/ui/src/components/quick-check-card.tsx`,
  `.work/releases/v0/feature-phase-17-item-types-and-quick-checks.md`

## Current doc text
> SPEC.md:109 — `## Human-in-the-loop tool dispatch (Phase 17, planned)`
> CURRICULUM.md:278 — `## Assessment item design (Phase 17, planned)`
> UX.md:435 — `## Inline quick-check cards (Phase 17, planned)`
> UX.md:453 — `## Item kind UX patterns (Phase 17, planned)`

## Reality
Phase 17 (item types + inline quick checks) shipped in the prior `v0`
release bundle. Quick-check tools are wired into `teachMode.toolNames`,
the new item kinds (single-choice, multi-select, numerical, matching,
ordering, two-tier) have graders + renderers, and `praxis.quickCheck.*`
IPC channels are live. The "(planned)" tag is stale in four section
headings across three foundation docs.

## Required edit
Strip `, planned` (and the parentheses if appropriate) from all four
headings — they should read `## Human-in-the-loop tool dispatch`,
`## Assessment item design`, `## Inline quick-check cards`, `## Item
kind UX patterns`. Per the rolling-foundation principle the doc
describes the present, not a phase plan.

## Implementation notes
Stripped the full `(Phase 17, planned)` parenthetical from all four headings across three docs. The body prose in each section already describes the shipped implementation; no prose changes were needed.

## Review (2026-05-10)

Four heading parentheticals stripped. This is a clean rolling-foundation fix — the body prose already described the shipped implementation, only the headings were stale. No prose rewrites needed; none were made. Approve.
