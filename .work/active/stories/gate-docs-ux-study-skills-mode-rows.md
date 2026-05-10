---
id: gate-docs-ux-study-skills-mode-rows
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# UX.md surface map and mode-tints table omit `study-skills` mode

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/UX.md:24-28` (surface map per-mode tab body shapes) and
  `docs/UX.md:46-53` (mode tints table)
- Code: `packages/curriculum/src/modes/index.ts:10-18` (registry includes
  `studySkillsMode`); `packages/ui/src/components/study-skills-tab-body.tsx`
  (per-mode body exists)

## Current doc text
> (lines 24-28) tab body shape per mode: teach → chat / bootstrap →
> canvas + outline / quiz → flashcard rhythm / homework → paginated set /
> exam → proctored
> (lines 46-53) Mode tints table — six rows: teach, bootstrap, quiz,
> homework, exam, configure.

## Reality
A 7th mode `study-skills` (Phase 18, the metacognition coach's dedicated
mode) is registered in the curriculum and has its own tab body component
(`study-skills-tab-body.tsx`). It is described in CURRICULUM.md:104-110
but absent from both the UX.md surface map and the mode-tints table.

Note: `packages/ui/src/components/mode-meta.ts` ALSO lacks a
`study-skills` entry; a follow-up code item should add the tint +
ornament. The doc-side fix is to add the row once the tint/ornament is
chosen — flag the doc-code coupling.

## Required edit
Add a `study-skills` row to the mode-tints table (line 46-53) and a
`study-skills → coach reflection` entry to the surface-map ascii block
(line 24-28). The actual tint/ornament must come from `mode-meta.ts`
once added there; if the team prefers to stage this, the doc edit can
land alongside the mode-meta entry as a single doc+code stride.
