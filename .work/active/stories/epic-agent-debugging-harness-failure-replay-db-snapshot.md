---
id: epic-agent-debugging-harness-failure-replay-db-snapshot
kind: story
stage: implementing
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

- [ ] Snapshot includes session and episodic rows for a session-scoped capture.
- [ ] Snapshot includes document/document-scope relationship presence for
      course-create and persistence failures.
- [ ] Restore inserts rows into a temp DB in FK-safe order.
- [ ] Snapshot and restore tests use `useTempDb()` and never touch
      `.praxis/dev.db`.
- [ ] Omitted large tables are represented as relationship summaries, not silent
      gaps.
