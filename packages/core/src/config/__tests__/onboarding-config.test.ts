import { describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { openDb } from "../../db/index.js";
import { markFirstRunComplete, readOnboardingConfig } from "../onboarding-config.js";

const dbCtx = useTempDb();

function makeDb() {
  return openDb({ path: dbCtx.dbPath }).db;
}

describe("readOnboardingConfig", () => {
  it("returns { firstRunCompletedAt: null } for a fresh database", () => {
    const db = makeDb();
    const cfg = readOnboardingConfig(db);
    expect(cfg).toEqual({ firstRunCompletedAt: null });
  });
});

describe("markFirstRunComplete", () => {
  it("writes a valid ISO timestamp on first call", () => {
    const db = makeDb();
    const before = Date.now();
    markFirstRunComplete(db);
    const after = Date.now();
    const cfg = readOnboardingConfig(db);
    expect(typeof cfg.firstRunCompletedAt).toBe("string");
    const ts = new Date(cfg.firstRunCompletedAt!).getTime();
    expect(Number.isNaN(ts)).toBe(false);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("updates the timestamp on a second call (idempotent upsert)", () => {
    const db = makeDb();
    markFirstRunComplete(db);
    const first = readOnboardingConfig(db).firstRunCompletedAt;
    markFirstRunComplete(db);
    const second = readOnboardingConfig(db).firstRunCompletedAt;
    expect(typeof first).toBe("string");
    expect(typeof second).toBe("string");
    // Both reads returned timestamps — the upsert path kept the row intact
    expect(new Date(second!).getTime()).toBeGreaterThanOrEqual(new Date(first!).getTime());
  });

  it("the second timestamp is strictly newer than the first", async () => {
    const db = makeDb();
    markFirstRunComplete(db);
    const first = readOnboardingConfig(db).firstRunCompletedAt!;
    // Advance the clock by at least 1ms so the two toISOString() values differ
    await new Promise((resolve) => setTimeout(resolve, 2));
    markFirstRunComplete(db);
    const second = readOnboardingConfig(db).firstRunCompletedAt!;
    expect(new Date(second).getTime()).toBeGreaterThan(new Date(first).getTime());
  });
});
