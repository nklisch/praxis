---
id: epic-agent-debugging-harness-failure-replay-db-snapshot
kind: story
stage: done
tags: []
parent: epic-agent-debugging-harness-failure-replay
depends_on: [epic-agent-debugging-harness-failure-replay-capture-slices]
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Focused DB snapshot and restore plan

## Scope

Add targeted row-level JSON snapshots for the DB state needed to explain and
replay failures without dumping the full local database.

## Files

- `packages/core/src/services/debug/debug-db-snapshot.ts`
- `packages/core/src/services/debug/__tests__/debug-db-snapshot.test.ts`
- `packages/core/src/services/debug/debug-bundle-capture-service.ts`

## Acceptance criteria

- [x] Snapshot includes session and episodic rows for a session-scoped capture.
- [x] Snapshot includes document/document-scope relationship presence for
      course-create and persistence failures.
- [x] Restore inserts rows into a temp DB in FK-safe order.
- [x] Snapshot and restore tests use `useTempDb()` and never touch
      `.praxis/dev.db`.
- [x] Omitted large tables are represented as relationship summaries, not silent
      gaps.

## Implementation Notes

- Added `DebugDbSnapshotterImpl` for focused row-level snapshots covering
  `sessions`, `episodic_events`, `document_scopes`, `documents`, `drafts`,
  `courses`, `assignments`, and `assignment_responses`.
- Snapshot capture resolves session scope directly from `sessionId` or from
  matching episodic `callId` payloads, then includes course, assignment,
  document, and draft rows related to that session.
- Restore inserts rows in FK-safe order into a supplied `PraxisDb` and uses
  conflict-ignore semantics so replay setup can be idempotent in temp DBs.
- Relationship summaries mark present or missing linked rows, including
  intentionally omitted `document_chunks` when a captured document has chunks.
- `DebugBundleCaptureServiceImpl` now writes `db-snapshot.json` into bundles
  when focused DB evidence is available.

## Verification

- `pnpm vitest run packages/core/src/services/debug/__tests__/debug-db-snapshot.test.ts packages/core/src/services/debug/__tests__/debug-bundle-capture-service.test.ts packages/core/src/services/debug/__tests__/debug-bundle-writer.test.ts packages/core/src/services/debug/__tests__/debug-trace-registry.test.ts`
- `pnpm --filter @praxis/core typecheck`
- `pnpm exec biome check packages/core/src/services/debug/debug-db-snapshot.ts packages/core/src/services/debug/debug-bundle-capture-service.ts packages/core/src/services/debug/index.ts packages/core/src/services/index.ts packages/core/src/services/debug/__tests__/debug-db-snapshot.test.ts packages/core/src/services/debug/__tests__/debug-bundle-capture-service.test.ts`
- `git diff --check`

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Fast-lane story review. Implementation notes include green focused
tests, core typecheck, focused Biome, and whitespace checks; item advanced to
`stage: done`.
