---
id: story-fix-cornell-cue-spawn-seed-session
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

## Implementation discovery (2026-05-25)

**Root cause**: `SessionSpawner.spawnFromNote` already seeds the session from the DB — it reads the saved note body and injects an opening message with `<note-cue>` tags. The session IS seeded after save. The real bug is that the UI passes only the `cueId` (row index), so when the user hasn't saved yet the server reads the stale DB snapshot and misses unsaved edits.

**Fix chosen**: extend `spawnFromNote` with an optional `seedText` field that bypasses the DB body parse when present. This is minimal and backwards-compatible.

**Changes**:
- `packages/core/src/types/session-client.ts` — added `seedText?: string` to `SessionService.spawnFromNote` interface.
- `packages/core/src/services/session/session-spawner.ts` — when `input.seedText` is non-empty, skip the DB parse and use it directly as `cueText`.
- `packages/core/src/services/session-service.ts` — thread `seedText` through to spawner.
- `packages/desktop/electron/main/session-channel.ts` — add `seedText` to `SpawnFromNoteSchema` and pass it through.
- `packages/client/src/services/session-client.ts` — add `seedText` to `spawnFromNote` input type.
- `NoteEditorCornellProps.onSpawnFromCue` and `NoteEditorFeynmanProps.onSpawnFromCue` — signatures updated from `(cueId: string) => void` to `(cueId: string, cueText: string) => void`.
- `note-editor-page.tsx:handleSpawnFromCue` — now receives `cueText` as a second argument and passes it as `seedText` to `spawnFromNote`.

Regression: `note-editor-cornell.test.tsx` asserts `onSpawnFromCue` is called with `("0", "Q1")` — both the index and the live text.
