---
id: epic-prompt-editing-surface-v2-diff-aware-preview
kind: feature
stage: drafting
tags: [ui, configure, prompt-customization]
parent: epic-prompt-editing-surface-v2
depends_on:
  - epic-prompt-editing-surface-v2-compose-attribution
  - epic-prompt-editing-surface-v2-unified-configure-surface
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Diff-aware prompt preview

## Brief

Today the preview pane (`prompt-preview-pane.tsx`) renders the composed final
prompt as an undifferentiated wall of text. The user sees the result of their
customization but can't see *what* they changed — which spans came from
default fragments, which from their override, which from the per-mode append,
which from the global fragment. Mentally diffing against the default by eye
is the only way to know.

This feature replaces the preview pane with a diff- and attribution-aware
renderer. Consuming the segment list from `compose-attribution`, each span
is rendered with its source (default / override / append / global) made
visible — color, tag, or hover affordance per source.

**Render shape (resolved at epic-design)**: the pane has a single toggle
control at the top — `[Composed | Diff]`. In Composed mode the pane
renders the final prompt with source-attributed inline annotations
(highlight per source + tag/hover). In Diff mode it switches to a
side-by-side or unified diff against the unmodified default. The user
chooses the view that fits the task.

This pairs with the **per-block diff buttons** from `full-fragment-view`,
which drill down to a single fragment's diff. The global toggle is "show
me everything"; the per-block button is "show me this one."

Hosted inside the unified configure surface; replaces the current
preview-pane component in place.

## Epic context

- Parent epic: `epic-prompt-editing-surface-v2`
- Position in epic: terminal feature — depends on both foundation features
  (`compose-attribution` for source spans, `unified-configure-surface` as
  the host). Lands in wave 2 alongside `full-fragment-view`.

## Foundation references

- `docs/ARCHITECTURE.md:353` — config UI for the prompt-composition system

## Anchors

- Current preview pane (to replace) —
  `packages/ui/src/components/prompt-preview-pane.tsx`
- Preview service entry —
  `PromptCustomizationServiceImpl.previewPrompt` in
  `packages/core/src/services/prompt-customization-service.ts:153-194`
  (will need to thread the attribution shape from `compose-attribution`)
- IPC channel — `praxis.author.previewPrompt` in
  `packages/client/src/services/authoring-client.ts:180-186` (return shape
  may evolve to carry segments — coordinate with `compose-attribution`)
