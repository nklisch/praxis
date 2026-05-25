---
id: story-fix-cornell-cue-spawn-empty-row-guard
kind: story
stage: review
tags: [bug, ui]
parent: feature-workspace-notes-affordance-fixes
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-25
---

# Fix: Cornell cue-spawn ▶ button renders on empty cue rows

## Symptom
The per-row ▶ "Talk to Praxis about this cue" button in Cornell-format workspace notes renders on every cue row, including empty ones where there's no cue text to spawn from. Clicking on an empty row produces a meaningless empty spawned session.

## Expected behavior
The ▶ button only renders when the cue row has non-empty content (after trim). Empty rows show no spawn affordance.

## Affected file
`packages/ui/src/components/note-editor-cornell.tsx:149-158` — wrap the spawn-button render in a non-empty-cue guard.

## Entry point
`/agile-workflow:fix`.

## Source idea
`idea-cornell-cue-spawn-button-fixes` sub-issue (2) (parked 2026-05-24).

## Implementation notes (2026-05-25)

Added a `(localBody.questions[i] ?? "").trim().length > 0` guard in `NoteEditorCornell` before rendering the spawn button. Applied the equivalent `q.trim().length > 0` guard to `NoteEditorFeynman`'s follow-up spawn button for consistency. Empty rows now render no affordance.

Regressions in `note-editor-cornell.test.tsx`: two new tests — one for empty cue rows, one for whitespace-only cues — assert no button is rendered.
