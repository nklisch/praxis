---
id: feature-refactor-session-service-spawn-extraction
kind: feature
stage: review
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Extract spawn-from-* paths + parent-session coordination from `SessionService`

## Brief
`packages/core/src/services/session-service.ts` (~876 lines after the
SessionPromoter extract earlier this session) still bundles:
- (a) Core session lifecycle (start, send, end)
- (b) Active session map + engine swap detection
- (c) Three `spawnFrom*` variants — `spawnFromAssignment`, `spawnFromNote`,
  `spawnFromPassage` — with 60–90 lines each of validation + parent linking
- (d) `notifySession` (live synthetic turns for parent-child session linkage)

## Design

### Option chosen: Option A — `SessionSpawner` utility

**Rationale for A over B:**

`notifySession` was examined carefully. It:
- Uses `engineManager.get()` and drives a synthetic engine turn (fire-and-forget).
- Its coupling to spawn is *semantic* (both involve parent-child sessions) but not
  *structural* — it shares no code with any `spawnFrom*` method.
- It has no parent-validation logic; it accepts any live session id.
- It is wired via a port closure in `services.ts` that calls
  `sessionService.notifySession(...)` — the call site is in assignment-service,
  not spawner code.

`notifySession` belongs next to `_driveEngineTurn` and `send()` — it's engine-turn
machinery, not spawn coordination. Extracting it into a `ParentSessionCoordinator`
(Option B) would leave the actual engine-driving work split across two files with
no clean seam.

By contrast, the three `spawnFrom*` methods share a clear pattern:
1. Resolve `studentId` (falls back to default)
2. Validate the target entity exists and belongs to student
3. Call `this.start({ ..., _persistImmediately: true })`
4. Optionally inject an opening turn via `this.send()`
5. Optionally set `parentSessionId` on the session row
6. Return the `SessionHandle`

This structural pattern is the extraction unit.

### New file: `session/session-spawner.ts`

Follows `session/session-promoter.ts` exactly as the reference pattern:
- Separate `SessionSpawnerDeps` interface (ports only, no direct `ServiceDeps` ref)
- Two ports into `SessionServiceImpl`:
  - `startSession` — closure over `this.start()`
  - `sendMessage` — closure over `this.send()`
- `documentScopes` service ref (passage attachment)
- `db` and `log` for DB queries and warn logging
- Module-local constant: `MAX_PASSAGE_LENGTH = 100_000`

`SessionServiceImpl`:
- Constructs `SessionSpawner` in constructor (same as `SessionPromoter`)
- Each `spawnFrom*` method becomes a one-line delegate

### What stays in `SessionServiceImpl`
- `notifySession` — engine-turn machinery; no structural commonality with spawners
- `start`, `send`, `_driveEngineTurn`, `end`, `active`, `list`, `shutdown`
- `discardIfUnpromoted`

### Preserved invariants
- Public `SessionService` interface unchanged (all three methods still exist;
  delegate signatures match).
- Parent-validation logic in `spawnFromAssignment` preserved verbatim.
- Offset-clamping + `MAX_PASSAGE_LENGTH` cap in `spawnFromPassage` preserved verbatim.
- `_persistImmediately: true` flag on all spawn calls preserved.
- `notifySession` wiring through the port closure in `services.ts` unchanged.

## Implementation order

4 sequential stories (each depends on the previous):

| # | Story id | Risk | Description |
|---|----------|------|-------------|
| 1 | `...-step-1-spawner-skeleton` | Low | Create `session-spawner.ts` with deps interface + empty class; wire into `SessionServiceImpl` constructor |
| 2 | `...-step-2-spawn-from-assignment` | Low | Move `spawnFromAssignment`; one-line delegate |
| 3 | `...-step-3-spawn-from-note` | Medium | Move `spawnFromNote`; validates `sendMessage` port + note-body parse logic |
| 4 | `...-step-4-spawn-from-passage` | Medium | Move `spawnFromPassage`; validates `documentScopes` port + tidy unused imports |

Each step: `pnpm typecheck && pnpm lint && pnpm test` must be green before next.

## Child stories
- `.work/active/stories/feature-refactor-session-service-spawn-extraction-step-1-spawner-skeleton.md`
- `.work/active/stories/feature-refactor-session-service-spawn-extraction-step-2-spawn-from-assignment.md`
- `.work/active/stories/feature-refactor-session-service-spawn-extraction-step-3-spawn-from-note.md`
- `.work/active/stories/feature-refactor-session-service-spawn-extraction-step-4-spawn-from-passage.md`

## Discovery evidence
- File length: 876 lines after SessionPromoter extract
- 3 spawnFrom* variants × ~70 lines each = ~210 lines of extractable logic
- Discovered by autopilot refactor cadence

## Implementation summary

Option A chosen: `SessionSpawner` utility class, mirroring `session-promoter.ts` exactly.

4 sequential stories all complete:
1. `step-1-spawner-skeleton` (commit `46ac20b`) — skeleton + wiring
2. `step-2-spawn-from-assignment` (commit `44129ce`) — first method moved
3. `step-3-spawn-from-note` (commit `9999af2`) — second method moved; `sendMessage` port validated
4. `step-4-spawn-from-passage` (commit `5961c9e`) — third method moved; `documentScopes` port validated; imports cleaned

Before: `session-service.ts` ~876 lines (post-promoter-extract baseline).
After: `session-service.ts` 665 lines; `session-spawner.ts` 329 lines.
Net reduction: ~211 lines from `session-service.ts`; all 1164 core tests pass; typecheck + lint green across all 10 workspace packages.

All preserved invariants confirmed: parent-validation logic verbatim, offset-clamping + `MAX_PASSAGE_LENGTH` cap verbatim, `_persistImmediately: true` on all spawn calls, public `SessionService` interface unchanged, `notifySession` stays in `SessionServiceImpl`.
