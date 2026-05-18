---
id: refactor-session-service-extract-engine-and-episodic
kind: feature
stage: drafting
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Refactor: extract EngineSessionManager + EpisodicEventRecorder from session-service.ts

## Brief

`packages/core/src/services/session-service.ts` is **1084 lines** and the
hot path through which every tutor turn flows. It tangles three concerns:

1. **EngineSession lifecycle** — `activeSessions` map, `openActive`,
   close-and-reopen on engine swap, history loading for restored
   conversations.
2. **Episodic stream persistence** — per-event `appendEpisodic` with error
   isolation (writes are non-fatal per pattern), turn-ordering invariants
   (recordUserMessage → yield user_message → for-await engine events →
   appendEpisodic → yield).
3. **Public service surface** — `list`, `active`, `notifySession`,
   `spawnFromAssignment`, `start`, `end`, `send`.

The `send()` method (lines 130-277, **148 LoC**, 4 levels of nesting) is
the worst offender: it owns engine-swap detection, history load, entry
open, user-message record, the for-await event loop, per-event persist,
abort handling, and post-turn indexer scheduling.

This is **pure refactor** — the `episodic-append-ordering` pattern and the
`engine-session-lifecycle` pattern (both documented at
`.claude/skills/patterns/`) must be preserved exactly. Engine-swap
behavior, history seeding, and indexer scheduling all stay identical.

## Surface area

- `packages/core/src/services/session-service.ts` (1084) →
  - `session/engine-session-manager.ts` — owns `activeSessions` Map,
    `openActive`, engine-swap detection (lines 166-202), close-old +
    reopen-with-history, `priorTurns` loading from
    `packages/core/src/services/_utils/load-prior-turns.ts` (if extracted)
  - `session/episodic-event-recorder.ts` — owns `appendEpisodic`
    orchestration, per-event error isolation, write-failure logging
  - `session-service.ts` itself — facade: `list`, `active`, `start`, `end`,
    `notifySession`, `spawnFromAssignment`, `send` (delegates the loop body
    to the two extracted modules)
- After extraction, the `send()` method should be ~50 LoC and read as
  episodic-append-ordering with delegation, not 148 LoC of inline state
  management

## Why a feature (not a story)

- 3 concerns to separate behind named boundaries
- Engine-swap is subtle and pattern-load-bearing — needs design pass to
  ensure the extracted manager preserves the close-then-reopen behavior
  exactly (including the test injection seam at `ServiceDeps.engineFactory`)
- The composition root (`SessionServiceImpl`) gets called from
  `ipc-server.ts` and the activity registry — careful to preserve all
  public method signatures

## Discovery findings to design against

- `send()` at lines 130-277: 148 LoC, 4 nesting levels, mixes ≥7 concerns
- Engine swap at lines 166-202: 4 levels deep, close-then-reopen with
  priorTurns loading inline
- `recordUserMessage` call at line 205-214 is tightly coupled to internal
  episodic functions — preserve the load-bearing ordering during extract

## Out of scope

- Changing engine-swap semantics
- Changing the FakeEngine test injection seam (`ServiceDeps.engineFactory`)
- Touching the indexer-orchestrator scheduling

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (especially session-service tests and
      `tests/integration/*` end-to-end paths)
- [ ] `wc -l packages/core/src/services/session-service.ts` < 600
- [ ] `send()` method body < 60 LoC
- [ ] Engine-swap and episodic-append-ordering patterns explicitly
      preserved (verified by their existing tests passing unmodified)
- [ ] `EngineSessionManager` and `EpisodicEventRecorder` are exported and
      individually testable

## Risk

**Medium** — hot path through every turn. Strong test coverage; behavior
must not drift. The atomicity here is the ordering invariant
(`recordUserMessage → yield user_message → for-await → appendEpisodic →
yield`) — if the extracted modules reorder anything, replay correctness
breaks.

## Rollback

`git revert <commit>` is clean per extracted module. Recommend landing the
EpisodicEventRecorder first (smaller scope, independently testable), then
EngineSessionManager.
