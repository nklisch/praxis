---
id: epic-ui-redesign-ground-up-workspace-note-editor-cornell-fix-nested-interactive
kind: story
stage: review
tags: [ui, a11y]
parent: epic-ui-redesign-ground-up-workspace
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Fix: textarea inside button in Cornell cue column (invalid HTML)

## Context

`packages/ui/src/components/note-editor-cornell.tsx` wraps a `<textarea>`
inside a `<button>` to create a combined "click-to-scroll + editable cue"
hit target. Per the HTML5 spec, `<button>` content model forbids interactive
content descendants — `<textarea>` is interactive content. Browsers handle
this gracefully, but screen readers and HTML parsers may behave
inconsistently, and the pattern may silently break under browser updates.

## Problematic lines

`note-editor-cornell.tsx` lines ~116–139:
```tsx
<button ... onClick={() => handleCueClick(i)}>
  <textarea ... onClick={(e) => e.stopPropagation()} />
</button>
```

## Fix direction

Replace the `<button>` wrapper with a `<div>` that acts as the click
surface via `onClick` + `onKeyDown` (Enter/Space for keyboard nav) +
`role="button"` + `tabIndex={0}`. The `<textarea>` inside is naturally
focusable and editable without conflict.

Or alternatively: remove the `<button>` wrapper entirely and handle cue
activation through the `<textarea>`'s `onFocus` event — focusing a cue
textarea sets it active and scrolls the matching marker into view. This
is simpler and removes the hit-area ambiguity.

## Acceptance criteria

- [x] No `<textarea>` (or other interactive content) nested inside `<button>`
      in `note-editor-cornell.tsx`.
- [x] Cue click-to-scroll behavior preserved (click/focus on cue activates
      and scrolls the matching ◆ marker).
- [x] Existing 17 cornell tests pass with any needed updates.
- [x] `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation notes

Replaced the `<button>` wrapper in the cue column with `<div role="button"
tabIndex={0}>` to remove the invalid nested interactive content. Key changes:

- `cueRefs` type changed from `Map<number, HTMLButtonElement>` to
  `Map<number, HTMLDivElement>`.
- Added `onKeyDown` handler (Enter/Space) on the div for keyboard activation.
- Removed `e.stopPropagation()` from the textarea's `onChange` (no longer
  needed to prevent triggering a button's form submit; `onClick` propagation
  guard retained to prevent the cue-scroll from firing on every text click).
- Added `{/* biome-ignore lint/a11y/useSemanticElements */}` comment to
  suppress Biome's suggestion to use `<button>` — this is intentionally not
  a `<button>` precisely because interactive content nesting is the bug
  being fixed.
- The notes section `<div key={i}>` had a pre-existing `noArrayIndexKey` lint
  issue (suppression comment not effective for multi-line JSX attributes in
  Biome 2) — this was not introduced by this change; the section is unchanged
  from the original commit.
- All 17 tests pass. Full suite (4461 tests) green.
