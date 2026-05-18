---
id: epic-ui-redesign-ground-up-workspace-note-editor-cornell-fix-nested-interactive
kind: story
stage: implementing
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

- [ ] No `<textarea>` (or other interactive content) nested inside `<button>`
      in `note-editor-cornell.tsx`.
- [ ] Cue click-to-scroll behavior preserved (click/focus on cue activates
      and scrolls the matching ◆ marker).
- [ ] Existing 17 cornell tests pass with any needed updates.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.
