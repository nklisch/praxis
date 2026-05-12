import type { SqliteDatabase } from "@praxis/core/db";
import { openDb } from "@praxis/core/db";
import { runMigrations } from "@praxis/core/db/migrate";
import { listTables } from "@praxis/core/db/show";
import { describe, expect, it } from "vitest";
import { useTempDb } from "./helpers/db-setup.js";

describe("foundation: migration + schema discovery", () => {
  // Disable auto-migrate — tests below want to control when migrations run
  const db = useTempDb({ migrate: false });

  it("opens a fresh database and applies migrations", () => {
    const result = runMigrations({ path: db.dbPath });
    expect(result.path).toBe(db.dbPath);
  });

  it("lists every expected table after migration", () => {
    runMigrations({ path: db.dbPath });
    const tables = listTables({ path: db.dbPath })
      .map((t) => t.name)
      .sort();

    // Spot-check a representative subset from each domain
    expect(tables).toContain("courses");
    expect(tables).toContain("lessons");
    expect(tables).toContain("gates");
    expect(tables).toContain("episodic_events");
    expect(tables).toContain("student_mastery");
    expect(tables).toContain("misconceptions");
    expect(tables).toContain("concept_graphs");
    expect(tables).toContain("concepts");
    expect(tables).toContain("prerequisite_edges");
    expect(tables).toContain("config_kv");
    expect(tables).toContain("lock_state");
  });

  it("enables WAL mode and foreign keys", () => {
    runMigrations({ path: db.dbPath });
    const { db: client } = openDb({ path: db.dbPath });
    const sqlite = (client as unknown as { $client: SqliteDatabase }).$client;
    // biome-ignore lint/style/noNonNullAssertion: pragma always returns at least one row
    expect(
      (sqlite.pragma("journal_mode") as Array<{ journal_mode: string }>)[0]!.journal_mode,
    ).toBe("wal");
    // biome-ignore lint/style/noNonNullAssertion: pragma always returns at least one row
    expect(
      (sqlite.pragma("foreign_keys") as Array<{ foreign_keys: number }>)[0]!.foreign_keys,
    ).toBe(1);
  });

  it("cascades episodic delete when a session is deleted", async () => {
    runMigrations({ path: db.dbPath });
    const { db: client } = openDb({ path: db.dbPath });
    const { sessions, episodicEvents } = await import("@praxis/memory/schema");
    const { eq } = await import("drizzle-orm");

    const sessionId = "test-session";
    const now = new Date();

    client
      .insert(sessions)
      .values({
        id: sessionId,
        studentId: "test-student",
        modeId: "teach",
        engineId: "direct",
        startedAt: now,
      })
      .run();

    client
      .insert(episodicEvents)
      .values({
        id: "test-event",
        sessionId,
        studentId: "test-student",
        ts: now,
        engineId: "direct",
        modeId: "teach",
        turnIndex: 0,
        eventJson: { type: "final", usage: { inputTokens: 0, outputTokens: 0 } },
      })
      .run();

    client.delete(sessions).where(eq(sessions.id, sessionId)).run();

    const remaining = client
      .select()
      .from(episodicEvents)
      .where(eq(episodicEvents.sessionId, sessionId))
      .all();
    expect(remaining).toHaveLength(0);
  });
});
