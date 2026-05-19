---
id: epic-backend-fills-for-redesign-document-viewer-selection-bar
kind: story
stage: done
tags: [ui]
parent: epic-backend-fills-for-redesign-document-viewer
depends_on: [epic-backend-fills-for-redesign-document-viewer-citations-and-spawn]
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
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

## Implementation notes

Landed as two files:
- `packages/ui/src/components/selection-action-bar.tsx` — pure
  presentational component; floats via `createPortal` into `document.body`
  at `position: fixed` above the selection rect. Four buttons, Escape +
  outside-mousedown dismiss, pending state while any async handler
  is in-flight.
- `packages/ui/src/components/selection-action-bar.module.css` — mono
  button pills on a `--color-bg-primary` card with accent hover.

`DocumentTabBody` extended with:
- `currentSessionId?: SessionId` and `onSpawnedSession?` props.
- `selectionchange` listener on `document` (debounced 100ms); checks
  that selection is inside `bodyRef.current` before showing the bar.
- `computeRangeOffset(root, rangeNode, rangeOffset)` helper maps DOM
  range anchors to linear character offsets.
- Four action handlers wired to `notes.create`, `session.spawnFromPassage`,
  `citations.record`, and `flashcards.create`.
- `+ cite` falls back to empty string for `citingSessionId` when no
  `currentSessionId` prop is provided (v1 limitation, tolerated).
- `+ flashcard` uses `window.prompt` for the front text (v1 per spec).

Citation dagger click now delegates to `onSpawnedSession` when set (was
a no-op TODO in the previous story).

Tests: 17 new tests in `selection-action-bar.test.tsx` + 6 new
integration tests appended to `document-tab-body.test.tsx` (38 total
in the two files; all green). The integration tests patch
`window.getSelection()` to return a fake selection and assert that each
handler is called with the correct arguments against a fake client.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `citingSessionId: (currentSessionId ?? "") as SessionId` is a documented v1 limitation. The empty-string cast bypasses the type contract (`SessionId` is required by the API). Fine as a v1 placeholder, but the comment in the code makes the intent clear. A follow-up could gate the `+ cite` button on `currentSessionId` being present rather than sending an invalid sentinel.
- Position estimation for `centredLeft`/`aboveTop` uses hardcoded ballpark constants (`BAR_W = 280`, `BAR_H = 32`). Acceptable for v1 per the comment; a `useLayoutEffect` resize observer would be a polish item.
- `void onSpawnedSession(sessionId as SessionId)` in the citation dagger click path (line 339) — the `void` is intentional (fire-and-forget from a sync callback), but `sessionId` is cast from `string` to `SessionId`. No semantic risk here since it came from the DB as a `SessionId`; cast is fine.

**Notes**: Well-structured delivery. `SelectionActionBar` is a clean presentational component — portal positioning, Escape/outside-mousedown dismiss, pending-state disabled buttons all implemented correctly. `computeRangeOffset` uses the standard `TreeWalker` pattern with the biome-ignore comment for `noAssignInExpressions` (justified). The `selectionchange` debounce fires at 100ms which matches the spec. Citation dagger click delegation to `onSpawnedSession` (previously a no-op TODO) is properly wired. Test coverage covers all four action handlers, both dismiss triggers, the outside-selection guard, and the portal visibility states. No foundation-doc drift.
