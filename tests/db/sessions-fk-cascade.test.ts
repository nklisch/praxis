/**
 * FK-cascade contract tests for sessions → episodic_events and sessions → tabs.
 *
 * This test pins the ACTUAL schema contract as of migrations 0025+0026:
 *   - episodic_events.session_id → sessions.id   ON DELETE CASCADE  (cascade confirmed)
 *   - tabs.session_id  → (no FK after migration 0026; FK intentionally dropped)
 *
 * The story body claimed both cascaded; that was stale.  Migration 0026
 * dropped the tabs FK to support the lazy-persist design (tabs row can be
 * inserted before the sessions row exists).  The sibling test in
 * configure-cleanup-migration.test.ts covers the migration-0025 path; this
 * file covers the general FK contract for ANY session deletion so that a
 * future migration that accidentally re-adds or removes a cascade is caught.
 */

import { openDb } from "@praxis/core/db";
import { episodicEvents, sessions, tabs } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, it } from "vitest";
import { useTempDb } from "../helpers/db-setup.js";

const dbCtx = useTempDb();

function openTestDb() {
  return openDb({ path: dbCtx.dbPath });
}

/** Minimal valid sessions row. */
function makeSession(overrides: { id?: string; modeId?: string } = {}) {
  return {
    id: overrides.id ?? uuidv7(),
    studentId: "student-cascade-test",
    modeId: overrides.modeId ?? "teach",
    engineId: "direct.anthropic",
    startedAt: new Date(),
  };
}

/** Minimal valid episodic_events row tied to a session. */
function makeEpisodicEvent(sessionId: string, modeId = "teach") {
  return {
    id: uuidv7(),
    sessionId,
    studentId: "student-cascade-test",
    ts: new Date(),
    engineId: "direct.anthropic",
    modeId,
    turnIndex: 0,
    eventJson: { type: "model_message", content: "hello", partial: false },
  };
}

/** Minimal valid tabs row tied to a session. */
function makeTab(sessionId: string) {
  return {
    id: uuidv7(),
    studentId: "student-cascade-test",
    kind: "session" as const,
    sessionId,
    title: "Test Tab",
    sortOrder: 0,
    openedAt: new Date(),
    lastSeenAt: new Date(),
  };
}

describe("sessions FK cascade contract", () => {
  let db: ReturnType<typeof openTestDb>["db"];

  beforeEach(() => {
    ({ db } = openTestDb());
  });

  // ---------------------------------------------------------------------------
  // episodic_events.session_id — ON DELETE CASCADE
  // ---------------------------------------------------------------------------

  it("deleting a session cascades to episodic_events (ON DELETE CASCADE)", () => {
    const sessionId = uuidv7();

    db.insert(sessions).values(makeSession({ id: sessionId })).run();

    const eventRow = makeEpisodicEvent(sessionId);
    db.insert(episodicEvents).values(eventRow).run();

    // Confirm row exists before delete.
    expect(
      db.select().from(episodicEvents).where(eq(episodicEvents.id, eventRow.id)).get(),
    ).toBeDefined();

    // Delete the parent session.
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();

    // The episodic_event must be gone — cascade was applied.
    expect(
      db.select().from(episodicEvents).where(eq(episodicEvents.id, eventRow.id)).get(),
    ).toBeUndefined();
  });

  it("cascading a session delete does not affect episodic_events of other sessions", () => {
    const deletedId = uuidv7();
    const survivingId = uuidv7();

    db.insert(sessions).values(makeSession({ id: deletedId })).run();
    db.insert(sessions).values(makeSession({ id: survivingId })).run();

    const deletedEvent = makeEpisodicEvent(deletedId);
    const survivingEvent = makeEpisodicEvent(survivingId);

    db.insert(episodicEvents).values(deletedEvent).run();
    db.insert(episodicEvents).values(survivingEvent).run();

    // Delete only the first session.
    db.delete(sessions).where(eq(sessions.id, deletedId)).run();

    // Deleted session's event must be gone.
    expect(
      db.select().from(episodicEvents).where(eq(episodicEvents.id, deletedEvent.id)).get(),
    ).toBeUndefined();

    // Surviving session's event must be intact.
    expect(
      db.select().from(episodicEvents).where(eq(episodicEvents.id, survivingEvent.id)).get(),
    ).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // tabs.session_id — NO FK after migration 0026 (tab row becomes orphaned)
  // ---------------------------------------------------------------------------

  it("deleting a session does NOT cascade to tabs — tab row is orphaned (no FK after migration 0026)", () => {
    const sessionId = uuidv7();

    db.insert(sessions).values(makeSession({ id: sessionId })).run();

    const tabRow = makeTab(sessionId);
    db.insert(tabs).values(tabRow).run();

    // Confirm tab exists before delete.
    expect(db.select().from(tabs).where(eq(tabs.id, tabRow.id)).get()).toBeDefined();

    // Delete the parent session — no FK means no cascade.
    db.delete(sessions).where(eq(sessions.id, sessionId)).run();

    // Session is gone.
    expect(db.select().from(sessions).where(eq(sessions.id, sessionId)).get()).toBeUndefined();

    // Tab row is still present — it is an orphan.  This is the expected
    // contract post-0026; orphan cleanup is the sweep job's responsibility.
    const orphan = db.select().from(tabs).where(eq(tabs.id, tabRow.id)).get();
    expect(orphan).toBeDefined();
    // The session_id still points at the now-deleted session row.
    expect(orphan?.sessionId).toBe(sessionId);
  });

  it("inserting a tab row whose session_id does not yet exist succeeds (no FK after migration 0026)", () => {
    // This is the key motivation for dropping the FK: tabs rows are created
    // before the sessions row exists in the lazy-persist design.
    const futureSessionId = uuidv7(); // session row NOT inserted
    const tabRow = makeTab(futureSessionId);

    // Must not throw a FK constraint error.
    expect(() => db.insert(tabs).values(tabRow).run()).not.toThrow();

    // Tab row is present even though the referenced session doesn't exist.
    expect(db.select().from(tabs).where(eq(tabs.id, tabRow.id)).get()).toBeDefined();
  });
});
