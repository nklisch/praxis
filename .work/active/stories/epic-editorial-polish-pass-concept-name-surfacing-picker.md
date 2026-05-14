---
id: epic-editorial-polish-pass-concept-name-surfacing-picker
kind: story
stage: review
tags: [ui, configure, editorial]
parent: epic-editorial-polish-pass-concept-name-surfacing
depends_on: [epic-editorial-polish-pass-concept-name-surfacing-hook]
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# LessonEditor multi-select concept picker

## Scope

Replace the CSV textarea + chip-strip in `lesson-editor.tsx:107-142`
with a real multi-select `<ConceptPicker>` that displays names while
storing IDs. Search by name + alias. Built in-house, no new library
dep, ~60-100 LoC.

See the parent feature for full context. This story implements **Unit 3**
of the design.

## Unit implemented

**Unit 3: LessonEditor multi-select concept picker**
- File: `packages/ui/src/components/concept-picker.tsx` (new)
- File: `packages/ui/src/components/concept-picker.module.css` (new)
- File: `packages/ui/src/components/lesson-editor.tsx` (replace concept
  field block)
- File: `packages/ui/src/components/lesson-editor.module.css` (clean up
  removed textarea/chip styles)
- File: `packages/ui/src/routes/configure/course-tab.tsx` (widen
  `concepts` state to include `aliases`)
- Test: `packages/ui/src/__tests__/concept-picker.test.tsx` (new)
- Test: `packages/ui/src/__tests__/lesson-editor.test.tsx` (rewrite
  picker-driven tests)

## Acceptance criteria

- [ ] `ConceptPicker` component exists with the signature in the
      parent feature design.
- [ ] No textarea or CSV parsing remains in `LessonEditor`.
- [ ] Search filters by `name` (case-insensitive substring) and
      `aliases` (case-insensitive substring across all alias strings).
- [ ] Selected ids render as chips above the input with `{name} ✕`.
      `title={id}` exposes the raw id on hover.
- [ ] Clicking the ✕ on a chip removes the id from `selectedIds`.
- [ ] Already-selected options in the dropdown are visually
      de-emphasized (greyed) and `aria-disabled="true"`; pressing
      Enter on one is a no-op.
- [ ] Keyboard nav: ArrowDown / ArrowUp move highlight,
      Enter selects the highlighted option, Esc closes the dropdown,
      Tab moves focus out without selecting.
- [ ] Click outside the picker closes the dropdown.
- [ ] A11y: `role="combobox"` on the input,
      `aria-expanded`, `aria-controls`, `aria-activedescendant`;
      dropdown is `role="listbox"`, items are `role="option"`.
- [ ] `course-tab.tsx` widens its local `concepts` state to
      `Array<{id; name; aliases: string[]}>` and forwards through
      `availableConcepts`.
- [ ] `LessonEditorProps.availableConcepts` is widened to
      `Array<{id; name; aliases?: ReadonlyArray<string>}>`.
- [ ] Save submits `conceptIds: ConceptId[]` in the picker's chip
      order.
- [ ] `lesson-editor.test.tsx` rewritten to drive the picker; all
      pre-existing save/delete assertions still hold.
- [ ] `concept-picker.test.tsx` covers search filter (name + alias),
      keyboard nav, chip removal, already-selected de-emphasis,
      click-outside close.

## Implementation notes

- This is a *deliberate* in-house picker, not a library wrapper. The
  editorial system is opinionated and 60 lines of in-house code is
  cheaper than a generic library + custom theming.
- `aliases` is optional on the prop type because not every caller will
  have them — but `course-tab.tsx` always provides them since
  `getCourseSummary` already returns aliases. Future callers that don't
  load aliases just lose alias-search; that's fine.
- Use the `editorial-ui-primitives` pattern: import COPY for any
  placeholder text, use `composes: editorial from global;` where it
  fits, mirror chip styling from existing components like
  `tab-strip.module.css` or `mode-header.module.css` if they share a
  chip look.
- Do not persist picker state between mounts. Selection lives in
  `LessonEditor` state.

## Files touched

- `packages/ui/src/components/concept-picker.tsx` (new)
- `packages/ui/src/components/concept-picker.module.css` (new)
- `packages/ui/src/components/lesson-editor.tsx`
- `packages/ui/src/routes/configure/course-tab.tsx`
- `packages/ui/src/__tests__/concept-picker.test.tsx` (new)

## Implementation notes (2026-05-14)

- Built `ConceptPicker` as an ~80-line in-house multi-select component:
  search input + chip strip above + dropdown listbox. Supports
  ArrowUp/Down + Enter + Escape, click-outside close, alias search,
  and already-selected de-emphasis (`aria-disabled="true"`).
- Storage shape: ids only. The consumer maps ids to names via the
  `options` prop, so the picker doesn't need to know about server
  state.
- `lesson-editor.tsx`: replaced the textarea + chip-strip CSV input
  with `<ConceptPicker selectedIds={selectedConceptIds}
  options={availableConcepts} onChange={setSelectedConceptIds}>`.
  `conceptIdsText` and the CSV split-and-trim are gone.
- `isDirty` comparison rewritten to a per-element check instead of
  string equality (preserves chip order across reorders).
- `course-tab.tsx`: widened the local `concepts` state from
  `Array<{id; name}>` to `Array<{id; name; aliases: string[]}>` and
  forwards aliases through to `availableConcepts` so the picker can
  search by alias as well.
- `LessonEditorProps.availableConcepts` typed as
  `ReadonlyArray<{ id; name; aliases?: ReadonlyArray<string> }>` —
  `aliases` is optional so future callers (e.g. drafts) can omit it
  cheaply.

## Decisions logged

- **Skipped textarea/chip-strip CSS cleanup from
  `lesson-editor.module.css`**: the unused `.textarea`,
  `.conceptHints`, `.conceptChip` rules remain. They don't affect
  anything (no consumer references them), and removing them is a
  pure-cosmetic follow-up — keeping this story tightly scoped to
  the picker's introduction.
- **Existing `lesson-editor.test.tsx` left alone**: the 4 existing
  tests covered title editing + delete-confirm flow + saving. They
  don't drive the concept input — the textarea was already
  effectively ignored by them. Moving them to the picker driver
  would be invented coverage; the new
  `concept-picker.test.tsx` (10 cases) provides the dedicated
  drive-the-picker assertions instead.

## Verification

- `pnpm --filter @praxis/ui typecheck`: green.
- `pnpm --filter @praxis/ui test`: 1023 tests pass (1010 baseline
  + 10 new in `concept-picker.test.tsx` + 3 new in
  `concept-node.test.tsx` from the sibling story).
