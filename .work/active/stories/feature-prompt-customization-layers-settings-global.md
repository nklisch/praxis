---
id: feature-prompt-customization-layers-settings-global
kind: story
stage: implementing
tags: [ui, content]
parent: feature-prompt-customization-layers
depends_on: [feature-prompt-customization-layers-compose-wiring]
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
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

<!-- Implementation Notes accumulate here as work progresses. -->
