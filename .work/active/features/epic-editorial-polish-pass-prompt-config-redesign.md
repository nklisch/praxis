---
id: epic-editorial-polish-pass-prompt-config-redesign
kind: feature
stage: drafting
tags: [ui, configure, prompt-customization]
parent: epic-editorial-polish-pass
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Prompt config redesign — section reorder + unified block-oriented preview

## Brief

The prompt-editing surface that shipped in `epic-prompt-editing-surface-v2`
(done) has two outstanding polish gaps. **First**, the teaching-style
section — the highest-signal knob users touch — sits at the bottom of
the configurator form, forcing scrolling past less-frequent options to
reach the primary lever. **Second**, the preview surface has too many
parallel shapes: global prompt preview, append preview, composed
preview, full-fragment view. Each has its own layout, they drift out
of sync, and the user has to understand four panels to see one prompt.

This feature delivers a v3-shaped prompt-editing surface. Sections
reorder by **frequency of use** (teaching style to the top, lower-
frequency options below — exact ordering decided at feature-design).
The four preview shapes collapse onto a **single block-oriented view**:
one block per fragment / section, with a single toggle to switch
between "blocks" (each fragment as a discrete editable card) and
"composed" (the assembled output). The global prompt becomes just
another block in the stack — no separate "global" surface. The append
preview reuses the composed-preview path with the appended block
highlighted. Net effect: one canonical surface, with the only axis of
variation being "blocks vs composed."

## Epic context

- Parent epic: `epic-editorial-polish-pass`
- Position in epic: independent — touches the configurator and the
  prompt-editing primitives. Runs in parallel with the other three
  features.

## Scope absorbed from backlog

- `idea-teaching-style-top-of-prompt-config` — reorder configurator
  sections by frequency of use; teaching style to the top.
- `idea-unified-prompt-preview-blocks` — unify global / append /
  composed / full-fragment previews onto one block-oriented view with
  a composed-output toggle.

## Foundation references

- `docs/ARCHITECTURE.md` — prompt composition pipeline; mode +
  pedagogy pack composition
- Prior epic: `epic-prompt-editing-surface-v2` (done) — this is the
  v3 polish on top
- `CLAUDE.md` — patterns `editorial-ui-primitives`,
  `mode-prompt-fragment-composition`

## Anchors (current implementation)

- Configurator route —
  `packages/ui/src/routes/configure/` (the prompt config tab specifically)
- Prompt configurator panel — search for prompt-config / configurator
  components under `packages/ui/src/components/` and the configure
  route directory
- Existing preview components — search for `Preview`, `AppendPreview`,
  `ComposedPreview`, `FullFragmentView` in `packages/ui/src/components/`
- Editorial primitives — `packages/ui/src/components/editorial/`
- Block-oriented UI reference patterns — look at how the existing
  fragment-list renders for shape inspiration
