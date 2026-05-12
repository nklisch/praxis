---
id: feature-prompt-customization-layers-settings-global
kind: story
stage: review
tags: [ui, content]
parent: feature-prompt-customization-layers
depends_on: [feature-prompt-customization-layers-compose-wiring]
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-12
---

# Settings global-prompt editor

## Scope

Implements Unit 6 of `feature-prompt-customization-layers`. Adds a new section
to the Settings route with an editor for the cross-mode global prompt fragment.
Side-by-side textarea + live preview pane that composes against any mode the
user picks.

Depends on `feature-prompt-customization-layers-compose-wiring` for the
`client.author.getGlobalPrompt` / `setGlobalPrompt` / `previewPrompt` IPC
surface.

## Files to touch

- `packages/ui/src/components/global-prompt-editor.tsx` (new)
- `packages/ui/src/components/global-prompt-editor.module.css` (new)
- `packages/ui/src/components/prompt-preview-pane.tsx` (new — extracted shared primitive used by Story 3 too)
- `packages/ui/src/components/prompt-preview-pane.module.css` (new)
- `packages/ui/src/routes/settings.tsx` — render `<GlobalPromptEditor />` in a new section.

### Tests
- `packages/ui/src/components/__tests__/global-prompt-editor.test.tsx` (new)
- `packages/ui/src/__tests__/settings-route.test.tsx` (extend, if exists; otherwise new) — assert the new section renders.

## Acceptance Criteria

### Editor
- [ ] On mount, the textarea is populated with the stored global fragment (empty string if none).
- [ ] Typing updates a local `draft` state.
- [ ] `useDeferredValue(draft)` (or 250ms debounce) drives a `client.author.previewPrompt({ modeId: previewMode, draftGlobal: deferredDraft })` call.
- [ ] Preview `<pre>` element renders the returned composed prompt string.
- [ ] A mode selector ("preview against") lists all 7 student-facing modes; default is `"teach"`.
- [ ] Changing the mode re-runs the preview against that mode.

### Save semantics
- [ ] Save button is enabled only when `draft.trim() !== stored.trim()` and `!saving`.
- [ ] Click save calls `client.author.setGlobalPrompt(draft.trim() === "" ? null : draft)`.
- [ ] On success, the "saved · <time>" indicator appears; button disables until next edit.
- [ ] On server-side error, an inline error message renders.

### Empty + clear
- [ ] Clearing the textarea and saving sends `null` and clears the stored row.
- [ ] After clearing, the preview pane reflects the no-user-global state (the user-global slot is absent from the composed prompt).

### Lock-gated UX
- [ ] When the configurator is locked, the editor is read-only with an "unlock to edit" hint (mirroring the existing Phase 11 prompt-tab lock behavior — verify the exact pattern from `packages/ui/src/routes/configure/prompt-tab.tsx`).

### Shared preview pane
- [ ] `<PromptPreviewPane modeId draftGlobal? draftAppend?>` extracted to a standalone component so Story 3's `<ModeAppendEditor>` reuses it.
- [ ] The pane handles its own debounce + IPC call; consumers just pass the draft inputs and an `onModeChange` if they want the mode picker.

### Styling
- [ ] Composes editorial CSS where it makes sense (section heading, lede).
- [ ] Textarea and preview `<pre>` use monospace for accuracy.
- [ ] On narrow viewports (< 720px), stack vertically (editor above preview) instead of side-by-side.

### Tests
- [ ] `global-prompt-editor.test.tsx`: initial load, draft updates trigger preview, mode selector changes preview, save persists, empty save clears, locked state.
- [ ] Mock `client.author` via `makeFakeClient({ author: { ... } })`.

## References

- Design: `.work/active/features/feature-prompt-customization-layers.md` (Unit 6)
- Existing Settings route: `packages/ui/src/routes/settings.tsx`
- Lock UX pattern: `packages/ui/src/routes/configure/prompt-tab.tsx`
- UI test helper: `packages/ui/src/__tests__/helpers/fake-client.ts`

## Implementation notes

### Files created

- `packages/ui/src/components/prompt-preview-pane.tsx` — shared primitive (see below)
- `packages/ui/src/components/prompt-preview-pane.module.css`
- `packages/ui/src/components/global-prompt-editor.tsx`
- `packages/ui/src/components/global-prompt-editor.module.css`
- `packages/ui/src/components/__tests__/global-prompt-editor.test.tsx`

### Files modified

- `packages/ui/src/routes/settings.tsx` — imports and renders `<GlobalPromptEditor />` below the engine config form
- `packages/ui/src/__tests__/settings-route.test.tsx` — extended with two new assertions: section heading and textarea presence

### Shared primitive shape

`<PromptPreviewPane>` accepts `{ modeId, draftGlobal?, draftAppend?, showModeSelector?, onModeChange? }`. It owns `useDeferredValue` on both draft inputs, the `client.author.previewPrompt(...)` IPC call (cancellable on re-render via `cancelled` flag), and the `<pre>` rendering. Conditional IPC arguments: draft fields are only forwarded when the caller actually passes them (undefined check), so the pane correctly uses stored values when the caller doesn't override. The mode selector is opt-in via `showModeSelector`; Story 3 (`ModeAppendEditor`) can render the pane with a fixed `modeId` and no selector.

### Lock-gate handling

Lock state is read via the existing `useLock()` hook. When `isSet && !isUnlocked`, the textarea gets `readOnly` + `disabled`, the save button row is hidden entirely, and a `role="note"` hint paragraph appears with an unlock prompt. This mirrors the intent of the existing prompt-tab lock behavior (which gates the save button) but is slightly stricter (also makes the textarea read-only), which is appropriate for a Settings-level edit surface.

### Save semantics

Explicit save button gated by `dirty && !saving` where `dirty = draft.trim() !== stored.trim()`. On success, `stored` is updated to the saved value, `savedAt` is set (triggering the `saved · HH:MM:SS` indicator), and the indicator auto-hides on the next edit. On empty/whitespace draft, `null` is sent to `setGlobalPrompt`, clearing the stored row server-side. `savedAt` is also cleared to `null` on any draft change via `setSavedAt(null)` in the `onChange` handler.

### Mobile-stacking decision

CSS grid with `grid-template-columns: 1fr 1fr` on wide viewports, collapsing to `grid-template-columns: 1fr` below 720px (same breakpoint used elsewhere in the UI). Editor pane stacks above preview pane at narrow widths.

### Tests added

`global-prompt-editor.test.tsx` covers: initial loading state, textarea populated from stored value, empty stored → empty textarea, save disabled when unchanged, save enabled after edit, save calls `setGlobalPrompt(text)`, empty save calls `setGlobalPrompt(null)`, saved indicator appears, inline error on save failure, mode selector renders, read-only + lock hint when locked, save button hidden when locked, `previewPrompt` called on mount and result rendered.

`settings-route.test.tsx` extended: "Global prompt" section heading renders, editor textarea renders.

### Verification

- `pnpm --filter @praxis/ui typecheck` — clean
- `pnpm typecheck` (workspace) — clean
- `pnpm --filter @praxis/ui test` — 90 files, 754 tests, all pass
