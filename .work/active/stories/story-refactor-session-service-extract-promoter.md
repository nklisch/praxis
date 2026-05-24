---
id: story-refactor-session-service-extract-promoter
kind: story
stage: implementing
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-23
---

# Extract `SessionPromoter` from `SessionService.send()`

## Brief
`packages/core/src/services/session-service.ts` is 879 lines, and its `send()`
generator is 147 lines (lines 163–309) handling multiple distinct control paths:
- Promotion (course-create-session → real-course session)
- Normal turn orchestration (recordUserMessage → yield → for-await engine events →
  appendEpisodic)
- Error / abort handling

The promotion path is a discrete concern that doesn't belong in the turn-orchestration
generator. Extracting it makes both halves easier to reason about and test.

## Target
Extract a `SessionPromoter` helper (in
`packages/core/src/services/session/session-promoter.ts` or similar) owning:
- Promotion eligibility detection
- The promotion transaction (session-scoped docs → course-scoped, draft → real course,
  etc.)
- Re-pointing the engine session if needed

`SessionService.send()` checks `promoter.shouldPromote(...)` once and delegates if so,
then proceeds with normal turn orchestration as a clean linear path.

## Constraints
- The async-generator event-stream pattern (per
  `.claude/skills/patterns/async-generator-event-stream.md`) must be preserved —
  events are yielded as they arrive, not buffered.
- The episodic-append-ordering pattern (per
  `.claude/skills/patterns/episodic-append-ordering.md`) must be preserved bit-for-bit.
- The `notifySession` (parent-child session) wiring must keep working.

## Acceptance
- `pnpm typecheck && pnpm lint && pnpm test` green
- `SessionService.send()` measurably shorter (target: <100 lines)
- `SessionPromoter` is a discrete unit with its own tests
- All existing session-service tests pass without modification
- No change to event ordering or external behavior

## Risk: Medium
This touches the session loop — the hot path. Run the full session-service test suite
and the engine-conformance suite. Verify with a manual `pnpm dev` session boot.
