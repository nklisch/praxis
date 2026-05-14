---
id: epic-editorial-polish-pass-prompt-config-redesign-tab-integration
kind: story
stage: review
tags: [ui, configure, prompt-customization]
parent: epic-editorial-polish-pass-prompt-config-redesign
depends_on: [epic-editorial-polish-pass-prompt-config-redesign-stack-and-preview]
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# PromptTab integration — section reorder + retirement of legacy editors

## Scope

Replace the current five-section prompt-tab layout with the two-section
v3 layout (Teaching Style first, Prompt blocks second), wire the new
`<PromptBlockStack>`, and delete the four retired components and their
tests in one commit.

See the parent feature for the full design. This story implements
**Unit 3** and depends on Unit 2 (`PromptBlockStack`).

## Unit implemented

**Unit 3: PromptTab integration + retirements**
- File: `packages/ui/src/routes/configure/prompt-tab.tsx` (modified)
- File: `packages/ui/src/routes/configure/prompt-tab.module.css`
  (trimmed — block-stack styles move to the stack's own CSS module)
- File: `packages/ui/src/lib/copy.ts` (modified)
- Patterns referenced: `editorial-ui-primitives`

## Acceptance criteria

### Layout

- [ ] `PromptTab` renders exactly two sections in this order:
      1. Teaching Style (uses existing `StyleSliderForm`)
      2. Prompt blocks (uses new `<PromptBlockStack>`)
- [ ] The old internal `<FragmentStack>` and
      `<PromptPreviewWithToggle>` components in `prompt-tab.tsx` are
      removed.
- [ ] The five `COPY.prompt.{globalSection*, fragmentSection*,
      previewSection*, modePickerLabel}` keys used by retired UI are
      removed from `COPY.prompt`.
- [ ] New COPY keys added under `COPY.prompt`:
      - `blocksSectionTitle: "Prompt blocks"` (or similar — editorial
        voice; final string at implementer discretion)
      - `blocksSectionDesc`
      - `blockGlobalTitle: "Global prompt"`
      - `blockAppendTitleFor: (modeId: string) => string`
      - `stackToggleBlocks: "Blocks"`
      - `stackToggleComposed: "Composed"`

### Deletions

- [ ] `packages/ui/src/components/global-prompt-editor.tsx` deleted.
- [ ] `packages/ui/src/components/global-prompt-editor.module.css`
      deleted.
- [ ] `packages/ui/src/components/__tests__/global-prompt-editor.test.tsx`
      deleted.
- [ ] `packages/ui/src/components/mode-append-editor.tsx` deleted.
- [ ] `packages/ui/src/components/mode-append-editor.module.css`
      deleted.
- [ ] `packages/ui/src/components/__tests__/mode-append-editor.test.tsx`
      deleted.
- [ ] `packages/ui/src/components/fragment-block.tsx` deleted.
- [ ] `packages/ui/src/components/fragment-block.module.css` deleted.
- [ ] `packages/ui/src/components/__tests__/fragment-block.test.tsx`
      deleted.
- [ ] `packages/ui/src/components/prompt-preview-pane.tsx` deleted.
- [ ] `packages/ui/src/components/prompt-preview-pane.module.css`
      deleted.
- [ ] No grep hit for the deleted component names remains anywhere
      under `packages/ui/`.

### Preserved

- [ ] `packages/ui/src/components/attributed-preview-pane.tsx` is
      unchanged.
- [ ] `packages/ui/src/components/attributed-preview-pane.module.css`
      is unchanged.
- [ ] `packages/ui/src/components/__tests__/attributed-preview-pane.test.tsx`
      still passes unchanged.
- [ ] `packages/ui/src/hooks/use-fragment-overrides.ts` and its tests
      are unchanged (the stack reuses the hook).

### Tests + tooling green

- [ ] `pnpm --filter @praxis/ui typecheck` is green.
- [ ] `pnpm --filter @praxis/ui test` is green.
- [ ] `pnpm typecheck` and `pnpm test` at the workspace root are green.
- [ ] `pnpm lint` is green.

### Smoke (manual — document in PR description)

- [ ] Open Configure → Prompt tab. Teaching Style is at the top.
- [ ] Edit a fragment via its inline editor. Save shows the "Edited"
      badge. Composed toggle shows the override segment highlighted.
- [ ] Edit the global block. Composed toggle reflects the in-flight
      draft.
- [ ] Edit the append block. Composed toggle reflects the in-flight
      append.
- [ ] Editing one block disables Edit on all others.
- [ ] Return-to-default on a fragment restores the default segment.

## Implementation notes

- This story is the deletion gate. Before deleting any retired
  component file, run `rg "<ComponentName>"` over `packages/ui` to
  confirm no callers remain outside the retired file itself; the
  design pass confirmed none today but the implementer must
  re-verify at commit time.
- The `prompt-tab.module.css` file's `.fragmentStack`,
  `.fragmentBlock*`, `.fragmentId`, `.fragmentPosition`,
  `.lockedBadge`, `.fragmentTemplate`, `.modePicker*`, `.modeSelect`,
  `.previewContainer`, `.previewToggleRow`, `.toggleBtn*` rules are
  no longer referenced by `prompt-tab.tsx`. Move whichever the
  stack/block components want into their own CSS modules and delete
  the rest from `prompt-tab.module.css`. Net: `prompt-tab.module.css`
  should only carry `.layout`, `.section`, `.sectionTitle`,
  `.sectionDesc`, and the slider form styles after this story.
- The existing tests under
  `packages/ui/src/routes/configure/__tests__/prompt-tab.test.tsx`
  (if any) should be updated to reflect the new two-section layout.
  If none exist, add a small test asserting:
      - Teaching Style heading appears before Prompt blocks heading
        in DOM order

## Files touched

- `packages/ui/src/routes/configure/prompt-tab.tsx` (rewritten)
- `packages/ui/src/routes/configure/prompt-tab.module.css` (trimmed)
- `packages/ui/src/lib/copy.ts` (dropped retired keys)
- `packages/ui/src/__tests__/configure-prompt-tab.test.tsx`
  (rewritten — old layout tests removed; new tests assert the
  two-section v3 layout)
- `packages/ui/src/__tests__/configure-route.test.tsx` (added
  fakes for `getGlobalPrompt` / `getModeAppend` /
  `listFragmentOverrides` / `previewPromptWithAttribution` /
  `setGlobalPrompt` / `setModeAppend` because the tab now mounts
  `<PromptBlockStack>` which calls those methods)
- 11 files deleted (the 4 retired components + their CSS + their
  test files):
  - `global-prompt-editor.{tsx,module.css}` + test
  - `mode-append-editor.{tsx,module.css}` + test
  - `fragment-block.{tsx,module.css}` + test
  - `prompt-preview-pane.{tsx,module.css}` (no test file
    existed for the preview pane)

## Implementation notes (2026-05-14)

- `prompt-tab.tsx` rewritten as the v3 two-section layout. Order is
  Teaching Style → Prompt blocks, matching the design's
  highest-frequency-first decision.
- All four retired components and their tests removed. Per the design's
  Deletions section, I verified with grep that the only remaining
  reference to the retired component *names* is a description string in
  `settings-route.test.tsx` ("does not render the GlobalPromptEditor
  ..."), which is harmless — it asserts the component is NOT present.
- COPY keys dropped: `globalSectionTitle`, `globalSectionDesc`,
  `fragmentSectionTitle`, `fragmentSectionDesc`, `previewSectionTitle`,
  `previewSectionDesc`, `previewToggleComposed`, `previewToggleDiff`.
- `prompt-tab.module.css` trimmed from ~213 lines to ~70: kept
  `.layout`, `.section`, `.sectionTitle`, `.sectionDesc`,
  `.sliderForm`, `.error`, `.success`, `.saveBtn` (and its hover /
  disabled). Removed all `.fragment*`, `.modePicker*`,
  `.previewContainer`, `.previewToggleRow`, `.toggleBtn*` rules.
- `configure-prompt-tab.test.tsx` retired the 13-test old-layout
  suite. The new test asserts:
  - exactly two `<section>` elements after the stack loads
  - DOM order: Teaching Style before Prompt blocks
  - retired headings (Global Fragment / Composed Preview / Prompt
    Fragments) are NOT present
  - the prompt block stack's mode picker is mounted

## Decisions logged

- **No fallback / migration banner**: the design said "Single-pass
  migration: do not keep the old editors behind a flag." I followed
  that — there's no transitional state, just the new layout. The
  retired components are gone in this commit.
- **`prompt-preview-pane` had no test file**: only the .tsx and
  .module.css were deleted for it. Not surprising — it was a
  wrapper around `AttributedPreviewPane` introduced in v2 and
  superseded before its dedicated test landed.
- **`StyleSliderForm` extracted-inline**: kept the inline definition
  in `prompt-tab.tsx` rather than promoting to its own file. It's
  tiny, only used here, and the file is now short enough that
  splitting would add navigation cost without payoff.

## Verification

- `pnpm --filter @praxis/ui typecheck`: green.
- `pnpm --filter @praxis/ui test`: 972 tests pass across 111 files.
  Net of: -3 deleted test files (fragment-block, global-prompt-editor,
  mode-append-editor) and -1 reduced (configure-prompt-tab 13 → 4),
  +1 new test file (prompt-block-stack), +sundry baseline.
