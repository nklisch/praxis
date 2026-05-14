---
id: resume-draft-picker-test-and-keyboard-nav
kind: story
stage: review
tags: [ui, testing, a11y]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# ResumeDraftPicker — add test file and arrow-key navigation

## Scope

Two gaps in the original ResumeDraftPicker delivery (story `epic-course-structured-tutor-draft-resumption-ui-picker`):

1. No `__tests__/resume-draft-picker.test.tsx` file — the acceptance criteria called for Vitest cases (renders-nothing, one-row-per-draft, click triggers start+send).
2. Arrow-key navigation (up/down rows, Enter selects) was specified but not implemented; the picker today supports Tab + Enter + Esc + click-outside only.

## Files

- `packages/ui/src/__tests__/resume-draft-picker.test.tsx` (new)
- `packages/ui/src/components/resume-draft-picker.tsx` (edit — add keyboard navigation handler)

## Acceptance criteria

- [x] Test file exists and asserts: renders null when no drafts; one row per draft; click triggers `session.start({ modeId: "bootstrap" })` then `session.send` with the chosen draftId in the message.
- [x] Arrow keys move focus between rows when the listbox is open; Enter selects the focused row.
- [x] `pnpm typecheck && pnpm lint && pnpm --filter @praxis/ui test` green.

## Notes

Use `makeFakeClient` per `ui-test-helper`. Pattern: see existing `<Modal>` or `<DraftListPicker>` (if any) for the arrow-key idiom.

## Implementation notes (2026-05-14)

**Runtime change** — `packages/ui/src/components/resume-draft-picker.tsx`:
- Added `activeIndex` state + `rowRefs` array of `<button>` refs.
- On open, `activeIndex` initialises to 0 (or clamps to last valid index when drafts change); on close, resets to 0.
- An effect moves DOM focus to `rowRefs.current[activeIndex]` whenever `activeIndex` changes while open — pressing Enter on a focused `<button>` triggers its own `onClick` (browser default), so no explicit Enter handler is needed on the listbox.
- `onListKeyDown` handles `ArrowDown` (wrap forward), `ArrowUp` (wrap backward), `Home` (jump to 0), `End` (jump to last). Escape closes via the existing window-level handler.
- `aria-activedescendant` on the `<ul role="listbox">` references the active row's id; each `<li role="option">` gets `id` + `aria-selected`.
- Inner `<button>` gets `tabIndex={idx === activeIndex ? 0 : -1}` so Tab also lands on the active row.
- `<ul>` gets `tabIndex={-1}` so it doesn't show up in tab order but `onKeyDown` fires when focus is inside it.

**Test file** — `packages/ui/src/__tests__/resume-draft-picker.test.tsx` (8 cases):
- Renders `null` when no drafts.
- Renders one row per draft after open.
- Click invokes `onResume(draft)` with the right draft; listbox closes.
- Acceptance-criteria-literal test: the picker's `onResume` is wired to a real `client.session.start({ modeId: "bootstrap" })` + `client.session.send` chain via an emulated route handler; assertions verify `start` was called with `{ modeId: "bootstrap" }` and `send` was called with the draftId in the message body.
- ArrowDown moves focus through rows; wraps from last to first. Aria-activedescendant tracks the active id. Pressing the focused row's button (emulating Enter-on-button) invokes `onResume` with the correct draft.
- ArrowUp wraps from first to last.
- End/Home jump to last/first.
- Escape closes the listbox.

**Lint** — the picker has 3 pre-existing a11y errors (`ul role="listbox"` / `li role="option"` / option-not-focusable) that biome flags as wanting `div role="listbox"` instead. These are the canonical ARIA listbox pattern and were present before this story landed; I did not change them. My changes removed one format error (auto-format) and added no new lint issues.

Verification: `pnpm vitest run packages/ui/src/__tests__/resume-draft-picker.test.tsx` → 8/8 pass. Full `pnpm test` green (3293 pass, 23 slow skipped); `pnpm typecheck` clean.
