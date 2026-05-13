---
id: epic-prompt-editing-surface-v2-full-fragment-view
kind: feature
stage: drafting
tags: [ui, configure, prompt-customization]
parent: epic-prompt-editing-surface-v2
depends_on: [epic-prompt-editing-surface-v2-unified-configure-surface]
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Full fragment view with locks, badges, and configurator lock fix

## Brief

The fragment override editor today (`prompt-fragment-editor.tsx:9-41`) ships a
hardcoded `CUSTOMIZABLE_FRAGMENTS` list — only those appear in the dropdown.
Non-customizable fragments (preamble, role, tools, postamble, etc.) are
completely invisible, so the user can't tell whether a missing fragment is
"doesn't exist" or "you can't touch it." Active overrides aren't badged
either: the user has to pick each fragment to find out which ones they've
already changed. And the configurator lock affordance is asymmetric — global
and append editors honor the lock (read-only when locked) but the fragment
editor has no lock check at all (`prompt-fragment-editor.tsx:54-185`), which
is the source of the "lock button does nothing" bug reported against the
prompt surface.

This feature redesigns the fragment view to:
- Render **every** fragment in the active mode (driven by the mode's
  `PromptFragment[]` and `FRAGMENT_ORDER`, not the hardcoded list) as a
  block in the unified surface.
- Mark non-customizable fragments visibly locked (read-only with their
  default text shown) so the user sees the full shape of the composed
  prompt without being able to break invariants `composeSystemPrompt`
  already protects (`compose.ts:54-60`).
- Badge fragments that currently have a stored override.
- Per-block "return to default" button that clears the override for that
  fragment (calls `clearFragmentOverride`).
- Per-block "diff view" button — drills down to show that single
  fragment's default vs. override (the global Composed | Diff toggle is
  handled by `diff-aware-preview`).
- Honor the **configurator lock** — Praxis's parent/child safety
  mechanism that restricts the configurator surface to a sub-set when
  engaged. When the lock is on, the fragment editor goes read-only,
  consistent with the global and append editors. Fixes the
  lock-button-no-op bug by making the fragment editor honor the same
  lock everything else honors.

## Epic context

- Parent epic: `epic-prompt-editing-surface-v2`
- Position in epic: consumer of the unified surface; runs in parallel with
  `diff-aware-preview` in wave 2.

## Foundation references

- `docs/ARCHITECTURE.md:353` — "Prompt customization … config UI"

## Anchors

- Current editor (to replace) —
  `packages/ui/src/components/prompt-fragment-editor.tsx`
- Hardcoded customizable list (to remove) —
  `prompt-fragment-editor.tsx:9-41`
- Source of truth for which fragments are customizable —
  `PromptFragment.customizable: boolean` in
  `packages/core/src/types/mode.ts:29-34`
- Override list — `listFragmentOverrides(modeId)` in
  `packages/core/src/services/prompt-customization-service.ts:145-151`
- Lock pattern to mirror — `global-prompt-editor.tsx:23,33,102-103` and
  `mode-append-editor.tsx:34,44,128-132,150-151`
- Existing test — `packages/ui/src/__tests__/prompt-fragment-editor.test.tsx`
