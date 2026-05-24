---
id: story-fix-new-note-button-always-available
kind: story
stage: implementing
tags: [bug, ui]
parent: feature-workspace-notes-affordance-fixes
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
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
