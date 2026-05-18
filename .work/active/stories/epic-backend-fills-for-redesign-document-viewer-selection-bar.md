---
id: epic-backend-fills-for-redesign-document-viewer-selection-bar
kind: story
stage: implementing
tags: [ui]
parent: epic-backend-fills-for-redesign-document-viewer
depends_on: [epic-backend-fills-for-redesign-document-viewer-citations-and-spawn]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Selection action bar — `+ note · ↗ ask Praxis · + cite · + flashcard`

## Scope

Unit 2 of the parent feature. Floating action bar that appears when
the student selects text in a document. Four actions, each delegating
to an existing or Story-1-built service.

Depends on `-citations-and-spawn` for `citationsService.record` and
`spawnFromPassage`.

## Implementation steps

1. New `packages/ui/src/components/selection-action-bar.{tsx,module.css}`:
   - Renders four buttons (`+ note`, `↗ ask Praxis`, `+ cite`,
     `+ flashcard`) horizontally; positioned via fixed offset from
     the selection's bounding rect.
   - Hide on `mousedown` outside; show on a non-empty selection inside
     the host element.

2. Edit `packages/ui/src/components/document-tab-body.tsx`:
   - Subscribe to text selection on the document content pane (use
     a `selectionchange` listener on the relevant DOM root, debounced).
   - When the selection is inside the document text and non-empty,
     compute the text-offset range (mapping DOM range → linear offset
     against the rendered text).
   - Render `<SelectionActionBar>` with the resolved range and
     handlers.

3. Action handlers:
   - `+ note` → `praxisClient.notes.create({ body: selectedText, context: { documentId, range } })`.
   - `↗ ask Praxis` → `praxisClient.sessions.spawnFromPassage({ documentId, range })` then
     navigate to the new session tab via the
     `session-tab-open-flow` pattern.
   - `+ cite` → `praxisClient.citations.record({ documentId, citingSessionId: currentSession, startOffset, endOffset, citedText })`.
   - `+ flashcard` → prompt for the front text via a simple inline
     input or modal, then
     `praxisClient.flashcards.create({ front: input, back: selectedText, source: { documentId, range } })`.

4. Tests:
   - `selection-action-bar.test.tsx` covering render + button clicks.
   - `document-tab-body` integration test simulating a selection
     (fire `selectionchange`) → assert bar appears with correct
     handlers wired.

5. Quality checks green.

## Acceptance criteria

- [ ] Selection action bar appears on non-empty text selection within
      the document content pane.
- [ ] All four actions complete end-to-end against fake client
      methods in tests.
- [ ] Bar hides on selection clear / outside click.
- [ ] All quality checks green.

## Out of scope

- Per-block / paragraph-anchored selections — v1 uses linear text
  offsets.
- Custom selection styling within the document body — relies on
  default browser selection.
