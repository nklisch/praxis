---
id: epic-editorial-polish-pass-prompt-config-redesign-stack-and-preview
kind: story
stage: implementing
tags: [ui, configure, prompt-customization]
parent: epic-editorial-polish-pass-prompt-config-redesign
depends_on: [epic-editorial-polish-pass-prompt-config-redesign-block-primitive]
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# PromptBlockStack — unified preview replacement with Blocks/Composed toggle

## Scope

Land the stack component that consolidates the prompt-editing surface.
It owns: mode picker, the ordered list of blocks (mode fragments +
global block + per-mode append block), save dispatch routing, the
stack-level `[Blocks | Composed]` toggle, and the wiring that pipes
in-flight drafts into the composed preview pane.

See the parent feature for the full design. This story implements
**Unit 2** and depends on Unit 1 (`PromptBlock`).

## Unit implemented

**Unit 2: `<PromptBlockStack>`**
- File: `packages/ui/src/components/prompt-block-stack.tsx` (new)
- CSS: `packages/ui/src/components/prompt-block-stack.module.css` (new)
- Test: `packages/ui/src/components/__tests__/prompt-block-stack.test.tsx`
  (new)
- Reuses: `AttributedPreviewPane` (existing), `PromptBlock` (Story 1)
- Patterns referenced: `mode-prompt-fragment-composition`,
  `use-resource-hook`, `editorial-ui-primitives`

## Acceptance criteria

- [ ] Exports `PromptBlockStack` and `PromptBlockStackProps` as
      designed (Unit 2 in parent feature body).
- [ ] Mode picker is rendered at the top of the stack; selecting a
      mode calls `onModeChange`.
- [ ] Block assembly produces an array of `AssembledBlock` sorted by
      `FRAGMENT_ORDER`, containing:
      - one entry per mode fragment (positions other than
        `user-global` / `user-append`) — `saveAction: "fragment"`
      - exactly one entry at `user-global` — `saveAction: "global"`,
        `currentText` from `client.author.getGlobalPrompt()`
      - exactly one entry at `user-append` — `saveAction: "append"`,
        `currentText` from `client.author.getModeAppend(modeId)`
- [ ] Mode-fragment overrides flow in via `useFragmentOverrides`; the
      override text takes precedence over `fragment.template` for
      `currentText`, and `hasOverride` reflects whether one is stored.
- [ ] Save dispatch:
      - `"fragment"` → `client.author.customizePrompt(modeId, blockId, text)`
        then `overrides.refresh()`
      - `"global"` → `client.author.setGlobalPrompt(text.trim() === "" ? null : text)`
        then refetch the global
      - `"append"` → `client.author.setModeAppend({ modeId, text: text.trim() === "" ? null : text })`
        then refetch the append
- [ ] Top-level `[Blocks | Composed]` toggle: in Blocks mode renders the
      `<PromptBlock>` list; in Composed mode renders
      `<AttributedPreviewPane modeId={modeId} view="composed"
       draftGlobal={...} draftAppend={...} />`.
- [ ] When the global block is in edit-mode, its in-flight draft is
      passed to the composed pane as `draftGlobal`; when the append
      block is in edit-mode, the draft is passed as `draftAppend`. When
      the editing block is a regular fragment, no draft props flow
      (fragment overrides are not previewable mid-edit by current IPC).
- [ ] Edit-mode exclusivity: only one block can be in edit-mode at a
      time. The stack tracks `editingBlockId: string | null`; the
      `Edit` button on every other block is disabled while one is
      active. (Disabled, not hidden — keeps the affordance discoverable.)
- [ ] Changing `modeId` refetches the per-mode append and per-mode
      fragment overrides, but the global block's `currentText` is
      preserved (no refetch).
- [ ] First-load: `<LoadingState />` is rendered until all three
      sources (mode fragments via `requireMode` — synchronous;
      `getGlobalPrompt`; `getModeAppend`) have resolved.
- [ ] IPC failures surface inline below the affected block (delegated
      via `onSave` rejection — the `PromptBlock` already handles error
      display).
- [ ] Unit tests in `prompt-block-stack.test.tsx` cover:
      - assembly order matches `FRAGMENT_ORDER`
      - global and append blocks appear at the correct positions
      - save dispatch routes to the correct IPC method per `saveAction`
      - edit-mode exclusivity (opening one block disables Edit on
        others)
      - Composed-toggle wires `draftGlobal` / `draftAppend` from the
        active editing block
      - mode change refetches append + overrides; global preserved

## Implementation notes

- The trickiest piece is the assembly logic. Implement it as a pure
  function `assembleBlocks(mode, globalText, appendText,
  overrides): AssembledBlock[]` that is straightforward to unit-test
  without rendering.
- Use `useDeferredValue` (or pass through to the pane) for draft
  inputs into the composed view — `AttributedPreviewPane` already
  defers internally, so just pass the raw drafts down.
- Title strings use COPY constants added in Story 3:
  - global → `COPY.prompt.blockGlobalTitle`
  - append → `COPY.prompt.blockAppendTitleFor(modeId)`
  - fragments → `fragment.id` (no COPY constant; fragment id IS the
    display name today)
- Position chip: render `positionLabel` in a muted mono span
  (matches today's `.fragmentPosition` style — steal it).
- Stack-level toggle uses the same segmented-control pattern as
  today's `previewToggleRow` in `prompt-tab.module.css`. New COPY:
  `stackToggleBlocks`, `stackToggleComposed`.

## Files touched

- `packages/ui/src/components/prompt-block-stack.tsx` (new)
- `packages/ui/src/components/prompt-block-stack.module.css` (new)
- `packages/ui/src/components/__tests__/prompt-block-stack.test.tsx`
  (new)
