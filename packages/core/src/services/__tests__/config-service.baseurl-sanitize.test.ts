/**
 * Service-layer tests for the baseUrl sanitize-on-load path.
 *
 * The stored schema stays permissive (avoids locking users out of old installs).
 * The read path (`readEngineConfig`) calls `isAllowedExternalUrl` on the stored
 * `baseUrl`, drops the field when the scheme is not allowed, and logs a warning.
 *
 * These tests verify:
 *   1. A stored file:// baseUrl is dropped; engineConfig() returns baseUrl: undefined.
 *   2. The "config.engine_baseurl_dropped" warning is emitted with the right fields.
 *   3. A stored https:// baseUrl passes through unchanged.
 */

import { describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { inMemorySecretStorage, recordingLogger } from "../../../../../tests/helpers/mocks.js";
import { openDb } from "../../db/index.js";
import { configKv } from "../../schema.js";
import { ConfigServiceImpl } from "../config-service.js";
import type { ServiceDeps } from "../types.js";

const dbCtx = useTempDb();

function makeService(overrides: { log?: ReturnType<typeof recordingLogger> } = {}): {
  svc: ConfigServiceImpl;
  db: ReturnType<typeof openDb>["db"];
  log: ReturnType<typeof recordingLogger>;
} {
  const { db } = openDb({ path: dbCtx.dbPath });
  const log = overrides.log ?? recordingLogger();
  const deps = {
    db,
    secretStorage: inMemorySecretStorage(),
    log,
  } as unknown as ServiceDeps;
  return { svc: new ConfigServiceImpl(deps), db, log };
}

/** Inject a raw engine config row, bypassing write-side validation. */
function seedRawEngineConfig(
  db: ReturnType<typeof openDb>["db"],
  value: Record<string, unknown>,
): void {
  db.insert(configKv)
    .values({ key: "engine", valueJson: value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: configKv.key,
      set: { valueJson: value, updatedAt: new Date() },
    })
    .run();
}

describe("ConfigServiceImpl.engineConfig() — baseUrl sanitize-on-load", () => {
  it("drops a stored file:// baseUrl and returns baseUrl: undefined", async () => {
    const { svc, db } = makeService();
    seedRawEngineConfig(db, {
      engineId: "claude-code",
      baseUrl: "file:///etc/passwd",
    });
    const snap = await svc.engineConfig();
    expect(snap.baseUrl).toBeUndefined();
    expect(snap).not.toHaveProperty("baseUrl");
  });

  it("logs config.engine_baseurl_dropped with reason:scheme_not_allowed when dropping a file:// URL", async () => {
    const log = recordingLogger();
    const { svc, db } = makeService({ log });
    seedRawEngineConfig(db, {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      baseUrl: "file:///etc/passwd",
    });
    await svc.engineConfig();
    const entry = log.records.find(
      (r) => r.level === "warn" && r.message === "config.engine_baseurl_dropped",
    );
    expect(entry).toBeDefined();
    expect(entry?.fields?.reason).toBe("scheme_not_allowed");
    expect(entry?.fields?.engineId).toBe("direct.anthropic");
  });

  it("passes through a stored https:// baseUrl unchanged", async () => {
    const { svc, db, log } = makeService();
    seedRawEngineConfig(db, {
      engineId: "claude-code",
      baseUrl: "https://api.example.com",
    });
    const snap = await svc.engineConfig();
    expect(snap.baseUrl).toBe("https://api.example.com");
    // No warning should be emitted for a valid URL.
    const dropped = log.records.find((r) => r.message === "config.engine_baseurl_dropped");
    expect(dropped).toBeUndefined();
  });
});
