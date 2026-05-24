---
id: gate-tests-sessions-fk-cascade-contract
kind: story
stage: review
tags: [testing, db]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: tests
created: 2026-05-23
updated: 2026-05-23
---

# `sessions` FK-cascade contract for `episodic_events` / `tabs` is comment-only — no test

## Priority
High

## Spec reference
Item: `story-configure-cleanup-migration`
Acceptance criterion:
> No FK constraint errors during migration (cascade or explicit child
> deletes handled); no orphaned child rows in dependent tables.

## Gap type
adversarial-spec-silent — the comment in
`drizzle/0025_configure_session_cleanup.sql:7-8` asserts
`ON DELETE CASCADE` for `episodic_events.session_id` and
`tabs.session_id`. If a future schema migration accidentally drops
cascade, the configure-cleanup migration (and any future
session-deletion) breaks silently. Nothing tests the cascade contract.

## Suggested test
```ts
// tests/db/sessions-fk-cascade.test.ts
it("deleting a session cascades to episodic_events and tabs", async () => {
  const { db } = openDb({ path: dbPath });
  // Insert session + child rows in episodic_events and tabs.
  // db.delete(sessions).where(eq(sessions.id, id)).run();
  // Assert dependent rows are gone.
});
```

## Test location (suggested)
`tests/db/sessions-fk-cascade.test.ts` (new)

## Implementation notes

**Stale story body**: The story claimed both `episodic_events.session_id` and `tabs.session_id` cascade on session delete. This was already incorrect when the story was written — migration 0026 (`drizzle/0026_drop_tabs_session_fk.sql`) intentionally dropped the FK from `tabs.session_id` to support the lazy-persist design (a tabs row can be inserted before the sessions row exists). The sibling test in `configure-cleanup-migration.test.ts` (Wave 7) confirmed this reality.

**Actual contract pinned by `tests/db/sessions-fk-cascade.test.ts`** (4 tests, 146 lines):
- `episodic_events.session_id` → CASCADE confirmed: deleting a session removes its episodic events; sibling sessions' events are unaffected.
- `tabs.session_id` → NO FK after migration 0026: tab rows are orphaned (not deleted) when their session is deleted; and a tab row can be inserted with a non-existent `sessionId` without error.

The pre-existing failing test (`empty-session-cleanup-e2e.test.ts`) is unrelated to this story and was failing before this work.
