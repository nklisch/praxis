---
id: story-fix-cornell-cue-spawn-seed-session
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

# Fix: Cornell cue-spawn lands in an empty session instead of being seeded with the cue context

## Symptom
Clicking the per-row ▶ "Talk to Praxis about this cue" button in Cornell-format workspace notes spawns a teach session that lands empty — no opening turn, no priming with the cue text. The user sees a blank chat and has to type the cue back in themselves. The handler at `packages/ui/src/routes/workspace/note-editor-page.tsx:93-111` calls `client.session.spawnFromNote({ noteId, cueId })` and opens the new tab, but the session itself starts with zero context.

## Expected behavior
The spawned session is primed with the cue row's text as context — either as a system note injected at start, or as an initial user message that the tutor responds to. The new session should "know what we're talking about" without the user having to re-explain.

## Approach hints
- `SessionService.spawnFromPassage` already exists and seeds passage range context — likely a similar shape applies for cue rows.
- The system-note mechanism (`SessionService.notifySession`) is already wired for parent→child notifications and could be used at spawn time to seed.
- Alternative: have the spawn helper construct an initial user message ("I want to discuss: \"{cueText}\"") and dispatch it as the first turn.

## Affected files
- `packages/ui/src/routes/workspace/note-editor-page.tsx:93-111` — calling site
- `packages/core/src/services/session-service.ts` — `spawnFromNote` implementation (likely needs to accept cue text and route it through system-note or initial-message seeding)

## Entry point
`/agile-workflow:fix`.

## Source idea
`idea-cornell-cue-spawn-button-fixes` sub-issue (3) (parked 2026-05-24).
