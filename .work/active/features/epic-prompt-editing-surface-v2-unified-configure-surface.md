---
id: epic-prompt-editing-surface-v2-unified-configure-surface
kind: feature
stage: drafting
tags: [ui, configure, prompt-customization]
parent: epic-prompt-editing-surface-v2
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Unified prompt-customization surface in Configure

## Brief

Today the three customization layers live in three different places: global
fragment under Settings (`packages/ui/src/routes/settings.tsx:3` mounts
`GlobalPromptEditor`), per-mode append under
`packages/ui/src/routes/configure/prompt-tab.tsx`, and per-fragment override
under the same tab in a separate section. The user has to navigate between
two top-level screens to see one consistent mental model. The editor column
is also narrower than the surrounding editorial layout.

This feature replaces the three scattered editors with one coherent prompt-
customization screen in the Configure prompt tab, hosting all three layers
(global / per-mode append / per-fragment override) as sibling layers in one
view, and unmounts the Settings global-prompt entry point. Settings is
reserved for app-level concerns (engines, keys, theme). The new screen uses
the full editorial-column width so long fragment templates aren't forced to
wrap unnecessarily.

This feature lands the **container** — it can ship with today's editor
internals slotted into the new layout. The redesigned fragment view and
diff-aware preview are separate child features that consume this container.

## Epic context

- Parent epic: `epic-prompt-editing-surface-v2`
- Position in epic: **container feature** — `full-fragment-view` and
  `diff-aware-preview` depend on this for their host screen. Can land in
  parallel with `compose-attribution`.

## Foundation references

- `docs/ARCHITECTURE.md:353` — "Prompt customization — knobs for teaching
  style, persona, mode-prompt overrides. Surfaces the prompt-composition
  system as a config UI." This feature is the realization of that surface.

## Anchors

- Configure prompt tab — `packages/ui/src/routes/configure/prompt-tab.tsx`
- Settings route (relocate global out of here) —
  `packages/ui/src/routes/settings.tsx:3`
- Editor components (kept, re-hosted) —
  `packages/ui/src/components/{global-prompt-editor,mode-append-editor,prompt-fragment-editor,prompt-preview-pane}.tsx`
- Editorial primitives — see `editorial-ui-primitives` pattern
- Existing tests: `packages/ui/src/__tests__/configure-prompt-tab.test.tsx`,
  `packages/ui/src/components/__tests__/global-prompt-editor.test.tsx`
