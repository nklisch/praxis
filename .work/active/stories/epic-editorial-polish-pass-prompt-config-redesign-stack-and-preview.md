---
id: epic-editorial-polish-pass-prompt-config-redesign-stack-and-preview
kind: story
stage: done
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
- `packages/ui/src/lib/copy.ts` (added stack-related COPY keys
  ahead of Story 3 so the stack can reference them in isolation)

## Implementation notes (2026-05-14)

- Exports `PromptBlockStack` and the pure-function `assembleBlocks`
  helper (the latter is the unit-testable core of the assembly
  logic; the parent feature design called for this as a separate
  testable seam).
- `assembleBlocks(modeId, globalText, appendText, overridesById)`
  produces the ordered `AssembledBlock[]`:
  - mode fragments → `saveAction: "fragment"`, with overrides
    applied; `defaultText` set to the unmodified `fragment.template`
  - synthetic global block at `user-global` → `saveAction: "global"`
  - synthetic per-mode append block at `user-append` →
    `saveAction: "append"`
  - sorted via `FRAGMENT_ORDER.indexOf(positionLabel)` so the
    block list aligns 1:1 with `composeSystemPromptWithAttribution`.
- `dispatchSave(block, text)` routes to the correct IPC:
  - `"fragment"` → `client.author.customizePrompt(modeId, blockId,
    text)` + `overrides.refresh()`
  - `"global"` → `client.author.setGlobalPrompt(text || null)` + local
    `setGlobalText`
  - `"append"` → `client.author.setModeAppend({ modeId, text || null
    })` + local `setAppendText`
- Edit-mode exclusivity: stack tracks `editingBlockId: string | null`.
  Each `<PromptBlock>` receives `editEnabled = editingBlockId === null
  || editingBlockId === block.blockId`. When another block is in
  edit-mode, this block's Edit button is rendered disabled (visible
  affordance with reduced opacity per PromptBlock's existing pattern).
- In-flight draft piping: stack stores `editingDraft: string | null`
  from the active block via `onDraftChange`. When the editing block is
  the global or append block, the stack passes
  `draftGlobal` / `draftAppend` to the composed `AttributedPreviewPane`
  so toggling to Composed mid-edit shows the in-flight text with
  amber attribution.
- Mode picker uses the same `<select>` shape as the legacy
  `prompt-tab.tsx`, with COPY string `modePickerLabel`. Re-uses the
  existing label.
- Append block re-fetches on `modeId` change (effect deps:
  `[client, modeId]`). Global is loaded once on mount.

## Decisions logged

- **Initial-load gating**: `LoadingState` renders until `globalLoaded
  && appendLoaded && !overrides.loading`. This is a small flash but
  avoids showing half-assembled blocks for one render cycle.
- **`editEnabled` is the disable mechanism**: per the parent feature's
  design decision, other blocks' Edit buttons stay visible-but-
  disabled when one is open. `PromptBlock` already supports
  `editEnabled?: boolean`; the stack just passes the flag.
- **No new IPC**: the design said "reuse `AttributedPreviewPane`'s
  draftAppend plumbing". I did so — the only new wire-format is
  the local `editingDraft` snapshot. No new IPC channel.
- **COPY strings landed in this story, not Story 3**: the stack
  is the consumer; landing the keys here keeps Story 3's deletions
  cleaner. Story 3 only needs to drop the now-unused keys.

## Verification

- `pnpm --filter @praxis/ui typecheck`: green.
- `pnpm --filter @praxis/ui exec vitest run
  src/components/__tests__/prompt-block-stack.test.tsx`: 11 tests
  pass (5 assembleBlocks pure-function cases + 6 component
  integration cases).

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- The `hasOverride` flag for global/append blocks reads
  `text !== null && text !== ""` — consistent with the dispatch
  logic that maps empty strings to `null`. Fine, but worth a one-line
  comment so a future reader doesn't think "blank vs unset" is being
  treated separately.

**Notes**: `assembleBlocks` as a pure function with its own tests is
the right testable seam — keeps the component thin. Edit-mode
exclusivity via `editingBlockId` + `editEnabled` flag is clean
(disabled-not-hidden as designed). Draft pipe to composed pane is
gated on the editing block's `saveAction` so only global/append drafts
flow into `draftGlobal` / `draftAppend`, never a fragment override.
Mode-change refetches append but preserves global. 11 tests cover
assembly order, IPC routing per action, exclusivity, and the draft
plumbing. Ready to advance.
