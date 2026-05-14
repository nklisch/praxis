---
id: gate-docs-ux-prompt-customization-v2-surface
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: docs
created: 2026-05-14
updated: 2026-05-14
---

# UX.md "Prompt customization" surface still shows the v0.1.1 mode-fragment-list sketch — the v2 block-stack with attribution + diff preview shipped

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/UX.md:546-579`
- Code:
  - `packages/ui/src/routes/configure/prompt-tab.tsx:3,120`
  - `packages/ui/src/components/prompt-block-stack.tsx`
  - `packages/ui/src/components/fragment-block.tsx`
  - `packages/ui/src/components/prompt-preview-pane.tsx`
  - `packages/curriculum/src/brief/compose.ts:89` (`composeSystemPromptWithAttribution`)

## Current doc text
> ## Configure surface — Prompt customization
> Surfaces the prompt-composition system as a config UI.
> [ASCII sketch showing per-fragment list with override fields, plus Socratic / Terse / Formal style sliders and a "Live preview of a sample exchange"]
> Some fragments are NOT customizable — the verification principle and graded-grounding hierarchy are non-negotiable. Sliders adjust style; freeform fields override specific fragments.

## Reality
The prompt-customization surface is a unified Configure tab built from
`PromptBlockStack` (per-fragment "blocks" rendered in `FRAGMENT_ORDER`
including locked fragments), plus a `PromptPreviewPane` that supports
a **Composed** view and a **Diff** view powered by
`composeSystemPromptWithAttribution` (per-segment source attribution).
Global fragment, per-mode append, and per-fragment overrides are all
sibling layers in this one screen — the Settings route no longer
mounts `GlobalPromptEditor`. There are no "Socratic / Terse / Formal"
style sliders in the v0.1.2 surface; teaching-style customization
flows through the same fragment-override mechanism as everything else.

## Required edit
Replace the section so it describes the block-stack layout: a
global-fragment block at the top, a mode picker (driven by
`Mode.displayName`), one block per fragment in `FRAGMENT_ORDER` (with
locked fragments visibly locked and editable fragments showing
override + revert), the per-mode user-append block, and a
`[Composed | Diff]` preview toggle backed by
`composeSystemPromptWithAttribution`. Drop the style-slider sketch —
it's not what shipped. Keep the "not all fragments are customizable"
rule.
