---
id: story-fix-cornell-cue-spawn-opaque-affordance
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

# Fix: Cornell cue-spawn ▶ button has no obvious indicator of what it does

## Symptom
The per-row ▶ "Talk to Praxis about this cue" button in Cornell-format workspace notes (`packages/ui/src/components/note-editor-cornell.tsx:149-158`) is a bare play glyph with no visible label. Users don't know it spawns a tutor session about that row — the aria-label and tooltip alone aren't enough.

## Expected behavior
The affordance is self-explanatory at a glance. Add a visible label, a clearer icon (or icon-plus-mini-label), or a hover-revealed label so users understand the action before clicking. Keep the chrome quiet — it's per-row chrome that shouldn't dominate.

## Affected file
`packages/ui/src/components/note-editor-cornell.tsx:149-158` and its `.spawnBtn` styles in the sibling `.module.css` (lines ~310-326).

## Entry point
`/agile-workflow:fix`.

## Source idea
`idea-cornell-cue-spawn-button-fixes` sub-issue (1) (parked 2026-05-24).
