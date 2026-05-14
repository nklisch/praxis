---
id: epic-editorial-polish-pass-prompt-config-redesign-tab-integration
kind: story
stage: implementing
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

- `packages/ui/src/routes/configure/prompt-tab.tsx` (modified)
- `packages/ui/src/routes/configure/prompt-tab.module.css` (trimmed)
- `packages/ui/src/lib/copy.ts` (modified)
- 12 files deleted (3 retired component files × 4 each: .tsx, .module.css,
  test.tsx — see Deletions section above)
