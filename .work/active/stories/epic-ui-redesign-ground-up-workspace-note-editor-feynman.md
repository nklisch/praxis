---
id: epic-ui-redesign-ground-up-workspace-note-editor-feynman
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-workspace
depends_on:
  - epic-ui-redesign-ground-up-design-system-token-swap
  - epic-backend-fills-for-redesign-note-annotations-and-filters-annotations
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Feynman note editor — two-pass (writing / reviewing)

## Scope

Rewrite the Feynman note editor per locked variant D
(`note-feynman-editor-d-two-pass.html`):
- Mode toggle `I'm writing` ↔ `I'm reviewing`.
- Pass 1: clean writing surface; no gap-finding chrome.
- Pass 2: review mode — select text → attach margin note
  (severity "soft" yellow / "load_bearing" red).

Consumes annotations API from sibling story.

## Implementation steps

1. New `packages/ui/src/components/note-editor-feynman.{tsx,module.css}`.
2. Mode toggle component.
3. Pass 1: rich-text body editor; autosave.
4. Pass 2: selection → margin-note popover → `praxisClient.notes.setAnnotations`.
5. Render existing annotations in pass 2 as margin notes.
6. Tests cover both passes + annotation round-trip.
7. Quality checks green.

## Acceptance criteria

- [x] Mode toggle switches surfaces.
- [x] Pass 2 attaches margin notes with severity.
- [x] Annotations persist + render on reload.
- [x] All quality checks green.

## Implementation notes

### Design decisions

- **Mode toggle as `<fieldset>`**: used `<fieldset>` instead of `<div role="group">` to satisfy Biome's `useSemanticElements` a11y rule. Styled to match the pill-toggle from the locked mock.
- **Annotation keys**: `Annotation` has no stable `id` field. Used `${rangeStart}-${rangeEnd}-${severity}` as the React key to avoid the `noArrayIndexKey` lint rule. This is correct since two annotations with identical range+severity would be a user error anyway.
- **Text-range to DOM-range mapping**: character offsets are computed via `preCaretRange.toString().length` — a standard DOM approach that works correctly in jsdom. The `text` variable was removed since `preCaretRange.toString()` gives the offset directly.
- **`exactOptionalPropertyTypes` fix**: the pre-existing `spawning ? undefined : handleSpawnFromCue` pattern caused `TS2375` errors on both cornell and feynman. Fixed by switching to conditional spread `{...(!spawning && { onSpawnFromCue: handleSpawnFromCue })}` in `note-editor-page.tsx`, which cleanly omits the prop rather than passing `undefined`. This resolved the cornell error too (pre-existing regression).
- **`noteId` threading**: `NoteEditorFeynman` now accepts `noteId?: NoteId`; when absent, annotations are local-only (no API calls). The `note-editor-page.tsx` caller passes `noteId` cast from the URL param string.

### Tests (16 total)

- 7 writing-mode tests preserving all existing behaviour.
- 3 mode-toggle tests (switches surfaces both ways).
- 6 review-mode tests: annotation load on mount, margin-note render, severity styling, popover on mouseup, `setAnnotations` called on save, `setAnnotations` payload shape.

### Files changed

- `packages/ui/src/components/note-editor-feynman.tsx` — full rewrite with two-pass design
- `packages/ui/src/components/note-editor-feynman.module.css` — full rewrite with review-mode + margin-note styles
- `packages/ui/src/__tests__/note-editor-feynman.test.tsx` — expanded test suite (7→16 tests)
- `packages/ui/src/routes/workspace/note-editor-page.tsx` — threads `noteId` to feynman; fixes conditional-spread pattern for both cornell and feynman

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `buildSegments` is a plain inner function called every render (not `useMemo`). Fine for typical note lengths; no correctness issue.
- `noteId as unknown as NoteId` cast at line 189 of `note-editor-page.tsx` is slightly inconsistent with the `as any as NoteId` used at line 47 in the same file. Both work identically; worth unifying someday but no urgency.

**Notes**: Two-pass design matches locked variant D (`note-feynman-editor-d-two-pass.html`) — pill-style mode toggle, clean writing surface in pass 1, selection-based margin-note popover in pass 2 with soft (yellow) / load_bearing (red) severity. `buildSegments` sweep handles overlapping annotations gracefully (first wins). `handlePopoverSave` uses optimistic local state update before API call. `exactOptionalPropertyTypes` fix via conditional spread is correct and cleans up a pre-existing regression on the cornell call-site too. `fieldset` with `aria-label` (no `legend`) is valid for Biome's `useSemanticElements` rule. 16 tests pass; all 1307 UI tests pass; lint clean. Pre-existing `notes-list.tsx` typecheck error in `@praxis/desktop` is unrelated to this story (present before this commit and introduced in the catalogue-rebuild story).
