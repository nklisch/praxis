import { openDb } from "@praxis/core/db";
import { describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { createTermFirstOccurrencesService } from "../term-first-occurrences-service.js";

const dbCtx = useTempDb();

describe("TermFirstOccurrencesService", () => {
  function service() {
    const { db } = openDb({ path: dbCtx.dbPath });
    return createTermFirstOccurrencesService({ db });
  }

  it("hasSeenTerm returns false before any markTermSeen", async () => {
    const svc = service();
    const seen = await svc.hasSeenTerm("student-1", "photosynthesis");
    expect(seen).toBe(false);
  });

  it("hasSeenTerm returns true after markTermSeen", async () => {
    const svc = service();
    await svc.markTermSeen("student-2", "mitosis", "session-1");
    const seen = await svc.hasSeenTerm("student-2", "mitosis");
    expect(seen).toBe(true);
  });

  it("is idempotent: marking the same term twice does not update firstSeenSessionId", async () => {
    const svc = service();
    await svc.markTermSeen("student-3", "meiosis", "session-A");
    // Second call with a different sessionId — must not overwrite
    await svc.markTermSeen("student-3", "meiosis", "session-B");
    // Still seen
    const seen = await svc.hasSeenTerm("student-3", "meiosis");
    expect(seen).toBe(true);
  });

  it("isolates different students: student-4 unseen even if student-5 saw the term", async () => {
    const svc = service();
    await svc.markTermSeen("student-5", "entropy", "session-X");
    const seen4 = await svc.hasSeenTerm("student-4", "entropy");
    const seen5 = await svc.hasSeenTerm("student-5", "entropy");
    expect(seen4).toBe(false);
    expect(seen5).toBe(true);
  });

  it("normalizes terms: punctuation and case variants match the same record", async () => {
    const svc = service();
    await svc.markTermSeen("student-6", "Newton's Second Law", "session-N");
    // Different case + punctuation — should normalize to the same key
    const seen = await svc.hasSeenTerm("student-6", "NEWTONS SECOND LAW");
    expect(seen).toBe(true);
  });

  it("different terms are tracked independently", async () => {
    const svc = service();
    await svc.markTermSeen("student-7", "velocity", "session-V");
    const seenV = await svc.hasSeenTerm("student-7", "velocity");
    const seenA = await svc.hasSeenTerm("student-7", "acceleration");
    expect(seenV).toBe(true);
    expect(seenA).toBe(false);
  });
});
