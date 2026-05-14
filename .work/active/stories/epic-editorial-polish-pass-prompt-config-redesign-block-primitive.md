---
id: epic-editorial-polish-pass-prompt-config-redesign-block-primitive
kind: story
stage: done
tags: [ui, configure, prompt-customization]
parent: epic-editorial-polish-pass-prompt-config-redesign
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# PromptBlock — editorial primitive for one slot in the composed prompt

## Scope

Land a single editorial component that wraps the view-mode → edit-mode →
save / cancel lifecycle for one prompt slot. Replaces (in Story 3) the
three near-duplicate lifecycles in `GlobalPromptEditor`,
`ModeAppendEditor`, and `FragmentBlock`.

See the parent feature for the full design. This story implements
**Unit 1**.

## Unit implemented

**Unit 1: `<PromptBlock>` primitive**
- File: `packages/ui/src/components/prompt-block.tsx` (new)
- CSS: `packages/ui/src/components/prompt-block.module.css` (new)
- Test: `packages/ui/src/components/__tests__/prompt-block.test.tsx` (new)
- Patterns referenced: `editorial-ui-primitives`,
  `mode-prompt-fragment-composition`

## Acceptance criteria

- [ ] Exports `PromptBlock` and `PromptBlockProps` as designed in the
      parent feature body (Unit 1).
- [ ] View-mode renders `currentText` in a `<pre>` with an editorial
      header carrying `title`, `positionLabel`, badges (`Edited`,
      `Locked`), and an `Edit` button (when editable).
- [ ] Clicking `Edit` swaps to edit-mode: a textarea pre-populated with
      `currentText`, with `Save` and `Cancel` actions.
- [ ] `Save` calls `props.onSave(draft)`; resolves edit-mode to false on
      successful resolve; surfaces errors via local state.
- [ ] `Cancel` discards the draft and returns to view-mode without IPC.
- [ ] When `locked || !customizable`, the `Edit` button is not rendered;
      the block is view-only.
- [ ] `onDraftChange` fires on every keystroke in edit-mode and with
      `null` on save / cancel / unmount.
- [ ] Per-block `Diff` toggle is gated on
      `defaultText !== undefined && customizable`; it shows a 2-column
      Default vs Current comparison below the editor.
- [ ] "Return to default" button is rendered iff
      `hasOverride && customizable && !locked`; calls
      `onReturnToDefault`.
- [ ] `Edited` badge appears iff `hasOverride === true`.
- [ ] `Locked` badge appears iff `!customizable`.
- [ ] Header `title` uses `composes: editorial from global;` for the
      editorial italic display serif.
- [ ] Unit tests in `prompt-block.test.tsx` cover:
      - view-mode render
      - enter / save / cancel lifecycle
      - locked / non-customizable hide Edit
      - `onDraftChange` keystroke + null-on-exit emission
      - Edited badge visibility
      - Diff toggle visibility gate
      - "Return to default" wiring

## Implementation notes

- Pure presentational primitive — no IPC, no service dependencies.
  All side effects flow through `onSave` and `onReturnToDefault`.
- Internal state: `editing: boolean`, `draft: string`,
  `saving: boolean`, `error: string | null`, `showDiff: boolean`.
- Entering edit-mode snapshots `currentText` into `draft`. Updates to
  `currentText` from props while editing do NOT clobber the draft (the
  user's in-flight work is sacred); the snapshot only re-runs when
  edit-mode is re-entered.
- `onDraftChange(null)` MUST fire on Save success, Cancel, and unmount
  during edit-mode, so the parent stack can clear any composed-view
  highlighting that was driven by an in-flight draft.
- Diff render mirrors the existing `FragmentBlock` 2-column layout —
  steal the CSS module's `.diff` / `.diffCol` / `.diffHeader` / `.diffPre`
  styles and rename.

## Files touched

- `packages/ui/src/components/prompt-block.tsx` (new)
- `packages/ui/src/components/prompt-block.module.css` (new)
- `packages/ui/src/components/__tests__/prompt-block.test.tsx` (new)

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: 8 tests pass. Pure presentational primitive — no IPC, no service deps. Lifecycle (view → edit → save/cancel), `onDraftChange(null)` exit signaling, locked/customizable gating all wired. Diff toggle correctly gated on `defaultText !== undefined && customizable`. Ready for Unit 3 (the consumer adoption story) to replace the three near-duplicate lifecycles.
