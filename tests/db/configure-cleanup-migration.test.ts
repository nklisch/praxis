/**
 * Tests for migration 0025: configure session cleanup.
 *
 * Acceptance criterion: migration deletes `sessions` rows with
 * `mode_id = 'configure'` while leaving other sessions intact, cascades
 * episodic_events (FK ON DELETE CASCADE), and is idempotent (running the SQL
 * a second time on the same DB is a no-op that does not throw).
 *
 * Strategy: useTempDb() applies all migrations (including 0025). We then
 * insert fresh rows and re-execute migration 0025's SQL directly via
 * better-sqlite3 to verify the cleanup contract and idempotency. This is the
 * canonical way to test "is this migration's SQL correct and idempotent?" when
 * Drizzle's tracker prevents re-running the same migration file.
 */

import { openDb } from "@praxis/core/db";
import { episodicEvents, sessions, tabs } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "../helpers/db-setup.js";

// Migration 0025 SQL — verbatim from drizzle/0025_configure_session_cleanup.sql.
// Kept inline so a future edit to the file must consciously re-check this test.
const MIGRATION_0025_SQL = "DELETE FROM sessions WHERE mode_id = 'configure'";

const dbCtx = useTempDb();

function openTestDb() {
  return openDb({ path: dbCtx.dbPath });
}

// Minimal sessions row values; engineId and startedAt are the only non-nullable
// non-defaulted columns beyond id, studentId, and modeId.
function makeSessionRow(overrides: { id?: string; modeId: string }) {
  return {
    id: overrides.id ?? uuidv7(),
    studentId: "student-test",
    modeId: overrides.modeId,
    engineId: "direct.anthropic",
    startedAt: new Date(),
  };
}

describe("migration 0025 — configure session cleanup", () => {
  let db: ReturnType<typeof openTestDb>["db"];
  let sqlite: ReturnType<typeof openTestDb>["sqlite"];

  beforeEach(() => {
    const opened = openTestDb();
    db = opened.db;
    sqlite = opened.sqlite;
  });

  it("deletes configure sessions and leaves teach sessions intact", () => {
    const configureId = uuidv7();
    const teachId = uuidv7();

    db.insert(sessions).values(makeSessionRow({ id: configureId, modeId: "configure" })).run();
    db.insert(sessions).values(makeSessionRow({ id: teachId, modeId: "teach" })).run();

    // Verify both rows exist before applying the migration SQL.
    const before = db.select().from(sessions).all();
    expect(before.map((r) => r.id)).toContain(configureId);
    expect(before.map((r) => r.id)).toContain(teachId);

    // Execute migration 0025's SQL.
    sqlite.prepare(MIGRATION_0025_SQL).run();

    const after = db.select().from(sessions).all();

    // Configure session must be gone.
    expect(after.find((r) => r.id === configureId)).toBeUndefined();
    // Teach session must survive.
    expect(after.find((r) => r.id === teachId)).toBeDefined();
  });

  it("cascades episodic_events for deleted configure sessions (FK ON DELETE CASCADE)", () => {
    const configureId = uuidv7();
    const teachId = uuidv7();
    const configureEventId = uuidv7();
    const teachEventId = uuidv7();

    db.insert(sessions).values(makeSessionRow({ id: configureId, modeId: "configure" })).run();
    db.insert(sessions).values(makeSessionRow({ id: teachId, modeId: "teach" })).run();

    // Insert episodic_events for both sessions.
    db.insert(episodicEvents)
      .values({
        id: configureEventId,
        sessionId: configureId,
        studentId: "student-test",
        ts: new Date(),
        engineId: "direct.anthropic",
        modeId: "configure",
        turnIndex: 0,
        eventJson: { type: "model_message", content: "hi", partial: false },
      })
      .run();

    db.insert(episodicEvents)
      .values({
        id: teachEventId,
        sessionId: teachId,
        studentId: "student-test",
        ts: new Date(),
        engineId: "direct.anthropic",
        modeId: "teach",
        turnIndex: 0,
        eventJson: { type: "model_message", content: "hello", partial: false },
      })
      .run();

    // Execute migration 0025's SQL.
    sqlite.prepare(MIGRATION_0025_SQL).run();

    // Configure session's episodic_event must be cascaded away.
    const configureEvent = db
      .select()
      .from(episodicEvents)
      .where(eq(episodicEvents.id, configureEventId))
      .get();
    expect(configureEvent).toBeUndefined();

    // Teach session's episodic_event must survive.
    const teachEvent = db
      .select()
      .from(episodicEvents)
      .where(eq(episodicEvents.id, teachEventId))
      .get();
    expect(teachEvent).toBeDefined();
  });

  it("tabs rows referencing configure sessions are orphaned (no FK after migration 0026)", () => {
    // Migration 0026 drops the FK from tabs.session_id → sessions.id, so tabs
    // rows are NOT cascaded when a session is deleted. They become orphan rows
    // (per the lazy-persist design). This test documents that contract: the
    // tab row survives the DELETE, which is the expected behavior post-0026.
    const configureId = uuidv7();
    const tabId = uuidv7();

    db.insert(sessions).values(makeSessionRow({ id: configureId, modeId: "configure" })).run();
    db.insert(tabs)
      .values({
        id: tabId,
        studentId: "student-test",
        kind: "session",
        sessionId: configureId,
        title: "configure tab",
        sortOrder: 0,
        openedAt: new Date(),
        lastSeenAt: new Date(),
      })
      .run();

    // Execute migration 0025's SQL.
    sqlite.prepare(MIGRATION_0025_SQL).run();

    // Session is gone.
    expect(db.select().from(sessions).where(eq(sessions.id, configureId)).get()).toBeUndefined();

    // Tab row is orphaned but still present — no FK cascade after migration 0026.
    const orphanTab = db.select().from(tabs).where(eq(tabs.id, tabId)).get();
    expect(orphanTab).toBeDefined();
    expect(orphanTab?.sessionId).toBe(configureId);
  });

  it("is idempotent — re-executing the SQL a second time does not throw", () => {
    const configureId = uuidv7();
    const teachId = uuidv7();

    db.insert(sessions).values(makeSessionRow({ id: configureId, modeId: "configure" })).run();
    db.insert(sessions).values(makeSessionRow({ id: teachId, modeId: "teach" })).run();

    const stmt = sqlite.prepare(MIGRATION_0025_SQL);

    // First run — deletes configure sessions.
    expect(() => stmt.run()).not.toThrow();

    // Second run — no rows match the WHERE clause; must be a no-op, not an error.
    expect(() => stmt.run()).not.toThrow();

    // Teach session must still be present after both runs.
    const remaining = db.select().from(sessions).all();
    expect(remaining.map((r) => r.id)).toContain(teachId);
    // No configure sessions remain.
    expect(remaining.filter((r) => r.modeId === "configure")).toHaveLength(0);
  });
});
