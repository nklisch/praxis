---
id: story-fix-new-note-button-always-available
kind: story
stage: done
tags: [bug, ui]
parent: feature-workspace-notes-affordance-fixes
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-25
---

# Fix: workspace-notes "new note" button only renders in the empty-state

## Symptom
In the workspace notes surface, the "new note" button is only shown when there are zero notes — it lives in the empty-state. Once at least one ad-hoc note exists, there's no visible affordance to create another, so users are stuck with a single note per workspace until they delete it.

## Expected behavior
The create-note action is always reachable. Promote it into the persistent notes-list chrome — header, toolbar, or trailing `+` row — so it's available whether the list has zero, one, or many notes.

## Affected file
The workspace notes list component in `packages/ui/src/components/` (find exact path during fix; likely a notes-panel or notes-list component). Move the create-note button out of the empty-state-only branch into the always-rendered chrome.

## Entry point
`/agile-workflow:fix`.

## Source idea
`idea-new-note-button-always-available` (parked 2026-05-24).

## Implementation notes (2026-05-25)

Added a persistent `+ New note` button to the `NotesListTab` catalogue header (`packages/ui/src/routes/workspace/notes-list.tsx`). The header now has a `headRow` flex container that aligns the existing kicker (`¶ workspace · the catalogue`) with the new button on the right.

The header button uses the new `.newBtnHead` CSS class (outline style — `border: 1px solid var(--color-accent)`, transparent background) to distinguish it visually from the filled `.newBtn` in the empty-state CTA. Both trigger the same `handleNewNote` handler. The empty-state button is retained so the primary CTA in the zero-notes state remains prominent.

CSS changes in `notes-list.module.css`: added `.headRow` (flex, space-between), `.newBtnHead` (outline button, uppercase mono, accent colour), and moved `.kicker` margin from `margin-bottom` to `margin: 0` (margin now lives on `.headRow`).

Regressions in `notes-list-route.test.tsx`: two new tests assert `getAllByRole("button", { name: /new note/i })` returns at least one button in both the empty-state case and the populated-results case.
