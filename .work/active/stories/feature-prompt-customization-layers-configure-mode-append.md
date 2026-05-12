---
id: feature-prompt-customization-layers-configure-mode-append
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

# Configure prompt-tab per-mode append editor

## Scope

Implements Unit 7 of `feature-prompt-customization-layers`. Adds a new
"Per-mode append" section to the configure-mode Prompt tab, above the existing
style sliders and `<PromptFragmentEditor>`. Mode selector + textarea + live
preview, scoped to one mode at a time.

Also reframes the existing fragment editor as "Advanced" with intro copy that
nudges users to the append surface first.

Depends on `feature-prompt-customization-layers-compose-wiring` (uses
`client.author.getModeAppend` / `setModeAppend` / `previewPrompt`). Reuses the
`<PromptPreviewPane>` primitive landed by
`feature-prompt-customization-layers-settings-global` — if that story has not
landed when this one starts, the implementer extracts the primitive here
instead (just lift it into a separate file as part of this story's commits).

## Files to touch

- `packages/ui/src/components/mode-append-editor.tsx` (new)
- `packages/ui/src/components/mode-append-editor.module.css` (new)
- `packages/ui/src/components/prompt-preview-pane.tsx` (reuse — landed by sibling story; if not present, lift inline as part of this story)
- `packages/ui/src/routes/configure/prompt-tab.tsx` — add a new section above the existing style-sliders section; insert "Advanced" intro copy above the existing `<PromptFragmentEditor>`.

### Tests
- `packages/ui/src/components/__tests__/mode-append-editor.test.tsx` (new)
- `packages/ui/src/__tests__/configure-prompt-tab.test.tsx` (extend) — assert new section renders ABOVE style-sliders and the "Advanced" framing renders above the fragment editor.

## Acceptance Criteria

### Editor
- [ ] Mode selector dropdown lists all 7 student-facing modes; default is `"teach"`.
- [ ] On mount and on mode-selector change, fetch the stored append for that mode via `client.author.getModeAppend(modeId)` and populate the textarea.
- [ ] Live preview via `<PromptPreviewPane modeId={selectedMode} draftAppend={deferredDraft} />`.
- [ ] When the mode changes, the textarea repopulates AND the preview switches.

### Save semantics
- [ ] Save button is enabled only when `draft.trim() !== stored.trim()` and `!saving`.
- [ ] Click save calls `client.author.setModeAppend({ modeId: selectedMode, text: draft.trim() === "" ? null : draft })`.
- [ ] On success, "saved" indicator appears; button disables.
- [ ] On error, inline error.

### Empty + clear
- [ ] Clearing and saving sends `null`; preview reflects the no-append state.

### Mode-switch unsaved-draft handling
- [ ] When the user has unsaved edits and switches the mode selector, prompt them via a confirm or auto-discard (pick the simpler — explicit "you have unsaved changes; discard?" confirm is the safer default).
- [ ] Switching after saving silently loads the new mode's stored append.

### Prompt tab restructure
- [ ] New section `<h2>Per-mode append</h2>` renders ABOVE the existing "Style sliders" section.
- [ ] Intro copy under the heading reads: "Add text to the end of a specific mode's prompt. The text appears after the framework's content and before the postamble."
- [ ] Above the existing `<PromptFragmentEditor>` section, an "Advanced" intro renders: "Advanced: replace specific framework fragments wholesale. Use append above for additive customization first."
- [ ] Existing style-sliders and fragment-editor surfaces still work — no regressions.

### Lock-gated UX
- [ ] Locked state matches the existing prompt-tab lock UX.

### Tests
- [ ] `mode-append-editor.test.tsx`: initial load for default mode, mode switch fetches different stored value, draft updates trigger preview, save persists per mode, empty save clears, locked state.
- [ ] `configure-prompt-tab.test.tsx` (extended): assert section order (per-mode append → style sliders → fragment editor); assert "Advanced" framing copy.

## References

- Design: `.work/active/features/feature-prompt-customization-layers.md` (Unit 7)
- Sibling story: `feature-prompt-customization-layers-settings-global` (provides the shared `<PromptPreviewPane>`).
- Existing prompt tab: `packages/ui/src/routes/configure/prompt-tab.tsx`
- Existing fragment editor: `packages/ui/src/components/prompt-fragment-editor.tsx`

## Implementation notes

### Files created

- `packages/ui/src/components/mode-append-editor.tsx` — new component; mode-selector dropdown + textarea + lock-gate logic. Mirrors `GlobalPromptEditor` shape.
- `packages/ui/src/components/mode-append-editor.module.css` — styles; side-by-side grid layout matching the global editor.
- `packages/ui/src/components/__tests__/mode-append-editor.test.tsx` — 14 tests covering: initial load, mode switch, save, null-clear, locked state, confirm-on-unsaved-switch, preview IPC.
- `packages/ui/src/__tests__/configure-prompt-tab.test.tsx` — new; 7 tests: section heading, intro copy, section order (DOM heading order assertion), style-slider regression, fragment-editor regression.

### Modified files

- `packages/ui/src/routes/configure/prompt-tab.tsx` — new Per-mode append section inserted at top; Advanced framing copy on the fragment-overrides section; `<ModeAppendEditor />` imported and rendered.

### `<PromptPreviewPane>` reuse

The sibling story (`feature-prompt-customization-layers-settings-global`) had already landed `prompt-preview-pane.tsx`. Consumed as-is with `modeId={selectedMode}` and `draftAppend={draft}`. The pane owns `useDeferredValue` debounce internally so no manual timer in `ModeAppendEditor`.

### Mode-switch unsaved-draft strategy

Used `window.confirm("You have unsaved changes. Discard and switch mode?")` — the simpler default specified in the story. Confirm returns `false` → no mode change; `true` → `setSelectedMode` triggers the load effect.

### Lock-gate handling

`useLock()` hook (same as `GlobalPromptEditor`). `isLocked = isSet && !isUnlocked`. Locked: `readOnly={true}` on textarea, save button hidden, lock-hint `<p role="note">` shown.

### Ordering verified

Section order in `prompt-tab.tsx`: Per-mode append (line 42) → Teaching Style (line 51) → Prompt Fragment Overrides (line 100). DOM heading order assertion in `configure-prompt-tab.test.tsx` confirms this programmatically.

### Verification

```
pnpm --filter @praxis/ui typecheck  → clean
pnpm typecheck                      → clean (all packages)
pnpm --filter @praxis/ui test       → 777 tests, all pass
pnpm lint                           → 9 pre-existing errors in claude-cli-sdk; 0 new errors in our files
```
