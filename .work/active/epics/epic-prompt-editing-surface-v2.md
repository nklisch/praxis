---
id: epic-prompt-editing-surface-v2
kind: epic
stage: done
tags: [ui, configure, prompt-customization]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Prompt editing surface v2 — unify, reveal, diff

## Brief

The v0.1.1 `feature-prompt-customization-layers` feature shipped layered prompt
customization (global / per-mode append / fragment overrides) but the editing
surface is incoherent: the global prompt lives in Settings, per-mode append and
overrides live in Configure under separate sections, only customizable
fragments are even shown (locked fragments are invisible rather than visibly
locked), active overrides aren't badged, and the live preview is an
undifferentiated wall of text. On top of that, the lock button — meant to
prevent default changes from overwriting a customized fragment — currently does
nothing. The result is that the customization model the user is supposed to
reason about (default → override → append → composed) is not legible in the UI.

This epic is a v2 of the prompt-customization surface: one coherent screen in
Configure that shows every fragment for the active mode (customizable +
non-customizable, with locks visible), badges fragments that already have a
stored override, surfaces global + per-mode-append + overrides as three
sibling layers (not three scattered screens), and renders the preview with
source attribution and a diff against the default. Settings is reserved for
app-level concerns (engines, keys, theme) only.

## Scope absorbed from backlog

This epic absorbs four parks from the v0.1.1 release retro:

- `idea-unified-prompt-editing-surface` (this epic's source — umbrella)
- `idea-prompt-menu-full-width` (constrained column → fluid editorial layout)
- `idea-prompt-customization-full-fragment-view-with-diff` (show all
  fragments + diff-aware preview)
- `idea-global-prompt-move-to-configure` (relocate global out of Settings)
- `idea-lock-button-no-op` (broken lock affordance — confirmed at scope time
  to belong here; fix as a child story)

## Anchors (current implementation)

- `composeSystemPrompt` — `packages/curriculum/src/brief/compose.ts:52-66`
- `FRAGMENT_ORDER` — `packages/curriculum/src/brief/compose.ts:35-45`
- `PromptFragment` type — `packages/core/src/types/mode.ts:29-34`
- `PromptCustomizationServiceImpl` — `packages/core/src/services/prompt-customization-service.ts`
- Configure prompt tab — `packages/ui/src/routes/configure/prompt-tab.tsx`
- Editors —
  `packages/ui/src/components/{global-prompt-editor,mode-append-editor,prompt-fragment-editor,prompt-preview-pane}.tsx`
- Hardcoded customizable list (the visibility gap) —
  `packages/ui/src/components/prompt-fragment-editor.tsx:9-41`

## Why now

The v0.1.1 feature was a "ship it and learn" — the layered model is right, the
UI is incomplete. Iterating now while the surface is still new is cheaper than
waiting for it to ossify, and the diff-aware preview unblocks teachers
authoring serious customizations without trial-and-error.

## Decomposition

Split by capability, not by layer. The composition output and the editing
container can advance in parallel; both then unlock the fragment view and
the diff-aware preview. Result is two clean waves with no critical-path
serialization beyond `attribution → diff-preview` and `unified-surface →
fragment-view + diff-preview`.

The "lock-button-no-op" bug folds into `full-fragment-view`: the codebase
already honors the configurator lock in `global-prompt-editor.tsx` and
`mode-append-editor.tsx`, but `prompt-fragment-editor.tsx:54-185` has no
lock check at all — that asymmetry is the bug. The fix is part of the
fragment-view rebuild, not a standalone story.

Foundation roll-forward: none. `docs/ARCHITECTURE.md:353` already states the
prompt-customization config UI as part of the architecture; this epic is its
realization, not a new boundary. `composeSystemPrompt`'s contract evolves to
optionally carry attribution, but the underlying composition model is
unchanged — no SPEC.md update needed.

### Child features

- `epic-prompt-editing-surface-v2-compose-attribution` — extend
  `composeSystemPrompt` to optionally return source-tagged segments
  (default / override / append / global). Foundation for diff preview. —
  depends on: `[]`
- `epic-prompt-editing-surface-v2-unified-configure-surface` — one Configure
  prompt screen hosting all three editors; relocate global out of Settings;
  full-width editorial layout. — depends on: `[]`
- `epic-prompt-editing-surface-v2-full-fragment-view` — show all fragments
  (incl. locked), badge active overrides, drive from `PromptFragment.customizable`
  rather than the hardcoded list, wire configurator lock to the fragment editor
  (fixes lock-button-no-op). — depends on:
  `[epic-prompt-editing-surface-v2-unified-configure-surface]`
- `epic-prompt-editing-surface-v2-diff-aware-preview` — preview renders
  source-attributed spans + diff against unmodified default. — depends on:
  `[epic-prompt-editing-surface-v2-compose-attribution,
  epic-prompt-editing-surface-v2-unified-configure-surface]`

### Decomposition risks

- **Attribution-shape coupling**: the segment shape returned by
  `compose-attribution` directly drives the diff renderer in
  `diff-aware-preview`. If feature 1 picks a tree shape but feature 4 wants
  flat spans, there will be friction. Feature 1's design pass should
  enumerate the shapes feature 4 needs to render before locking in.
- **"Unified surface" risk of being a relocation, not a redesign**: if
  `unified-configure-surface` just collocates today's three editors
  unchanged, the user still has three separate mental models in one screen.
  The feature design pass should commit to layer-as-sibling-control rather
  than three stacked panels.
- **IPC return-shape evolution**: `praxis.author.previewPrompt` currently
  returns `string`. The diff-aware preview likely needs segments. Coordinate
  the IPC shape change in `compose-attribution`'s feature design so both
  the engine path (string) and the preview path (segments) stay coherent —
  same handler, different return shapes by request flag, or a separate
  channel.

## Review (2026-05-13) — aggregate

**Verdict**: Approve

All four child features shipped clean and were individually approved:
- `...compose-attribution` (done) — segment-level attribution shape
- `...unified-configure-surface` (done) — single configure surface hosting all 3 layers
- `...full-fragment-view` (done, review 3675c3d) — FragmentBlock with lock + badges + per-block diff
- `...diff-aware-preview` (done, review bfe099d) — AttributedPreviewPane with global Composed/Diff toggle

**Aggregate-only checks**:
- Capability completeness: users can edit ALL fragments (not just a hardcoded list), see what's edited, see what's locked, and view both per-block and whole-prompt diffs against defaults. Lock-button-no-op bug is fixed across all three editors.
- Foundation alignment: `docs/ARCHITECTURE.md:353` already references the prompt-customization config UI; no drift.
- Cross-cutting: both wave-2 features use the same source-coded color vocabulary for diff highlighting (default = no decoration, override = amber, append = green, global = teal). Consistency preserved.

What's now possible: prompt customization is honest, transparent, and respects the configurator lock. Users no longer wonder what they've changed vs. what's default — the UI shows them.
