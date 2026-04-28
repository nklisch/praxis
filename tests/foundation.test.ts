import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDb, openDb } from "@praxis/core/db";
import { runMigrations } from "@praxis/core/db/migrate";
import { listTables } from "@praxis/core/db/show";
import type { Database } from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "praxis-test-"));
  dbPath = join(tmpDir, "test.db");
  process.env.PRAXIS_DB_PATH = dbPath;
});

afterEach(() => {
  closeDb();
  delete process.env.PRAXIS_DB_PATH;
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("foundation: migration + schema discovery", () => {
  it("opens a fresh database and applies migrations", () => {
    const result = runMigrations({ path: dbPath });
    expect(result.path).toBe(dbPath);
  });

  it("lists every expected table after migration", () => {
    runMigrations({ path: dbPath });
    const tables = listTables({ path: dbPath })
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
    const { db } = openDb({ path: dbPath });
    const sqlite = (db as unknown as { $client: Database }).$client;
    expect((sqlite.pragma("journal_mode") as Array<{ journal_mode: string }>)[0].journal_mode).toBe(
      "wal",
    );
    expect((sqlite.pragma("foreign_keys") as Array<{ foreign_keys: number }>)[0].foreign_keys).toBe(
      1,
    );
  });

  it("cascades episodic delete when a session is deleted", async () => {
    runMigrations({ path: dbPath });
    const { db } = openDb({ path: dbPath });
    const { sessions, episodicEvents } = await import("@praxis/memory/schema");
    const { eq } = await import("drizzle-orm");

    const sessionId = "test-session";
    const now = new Date();

    db.insert(sessions)
      .values({
        id: sessionId,
        studentId: "test-student",
        modeId: "teach",
        engineId: "direct",
        startedAt: now,
      })
      .run();

    db.insert(episodicEvents)
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

    db.delete(sessions).where(eq(sessions.id, sessionId)).run();

    const remaining = db
      .select()
      .from(episodicEvents)
      .where(eq(episodicEvents.sessionId, sessionId))
      .all();
    expect(remaining).toHaveLength(0);
  });
});
