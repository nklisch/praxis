---
id: feature-workspace-notes-affordance-fixes
kind: feature
stage: implementing
tags: [ui, bug]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Workspace-notes affordance fixes (Cornell cue-spawn + new-note button)

## Brief
Four small bug-fixes on workspace-notes affordances surfaced during dogfooding. All are `/agile-workflow:fix`-shaped — single verified bug each, clear desired behavior, scoped to one component. Three on the Cornell cue-spawn ▶ button (`packages/ui/src/components/note-editor-cornell.tsx`), one on the notes-list "new note" affordance.

## Children (all kind:story, tags:[bug], /agile-workflow:fix entry point)
1. **`story-fix-cornell-cue-spawn-opaque-affordance`** — the per-row ▶ button has no visible label or tooltip clarity; users don't know it spawns a tutor session. Affordance / labeling fix.
2. **`story-fix-cornell-cue-spawn-empty-row-guard`** — the ▶ button renders on empty cue rows where there's nothing meaningful to spawn from. Conditional-render guard on non-empty cue content.
3. **`story-fix-cornell-cue-spawn-seed-session`** — clicking ▶ spawns a teach session that lands empty rather than opening with the cue text seeded as context. Seed the session via the existing `spawnFromNote` / system-note path.
4. **`story-fix-new-note-button-always-available`** — the workspace-notes "new note" button only renders in the empty-state, so once one note exists there's no visible affordance to create another. Promote into persistent notes-list chrome.

Children are independent — `depends_on: []` each.

## Source ideas absorbed
- `idea-cornell-cue-spawn-button-fixes` (3 sub-issues) → 3 bug child stories
- `idea-new-note-button-always-available` → bug child story
