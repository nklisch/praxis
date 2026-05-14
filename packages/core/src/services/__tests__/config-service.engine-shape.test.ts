/**
 * Service-layer tests for ConfigServiceImpl engine-config trust-boundary contract.
 *
 * The trust-boundary invariant tested here is load-bearing for security:
 *   - `engineConfig()` must NEVER expose the decrypted `apiKey` to callers;
 *     it exposes only a presence flag (`hasApiKey: boolean`).
 *   - `revealApiKey()` is the explicit opt-in path, called only on user action.
 *   - `setEngineConfig()` preserve/clear/replace semantics determine what lands
 *     in the encrypted keyring.
 *
 * Schema-layer tests (Zod, raw read/write) live in:
 *   packages/core/src/__tests__/engine-config.test.ts
 */

import { afterEach, describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import {
  inMemorySecretStorage,
  noopLogger,
  unavailableSecretStorage,
} from "../../../../../tests/helpers/mocks.js";
import { openDb } from "../../db/index.js";
import { writeEngineConfig } from "../../config/engine-config.js";
import { ConfigServiceImpl } from "../config-service.js";
import type { ServiceDeps } from "../types.js";

// Each test gets its own isolated, migrated SQLite.
const dbCtx = useTempDb();

afterEach(() => {
  delete process.env.PRAXIS_API_KEY;
});

function makeService(
  overrides: { secretStorage?: ServiceDeps["secretStorage"] } = {},
): { svc: ConfigServiceImpl; db: ReturnType<typeof openDb>["db"] } {
  const { db } = openDb({ path: dbCtx.dbPath });
  // ConfigServiceImpl only reads: deps.db, deps.secretStorage, deps.log.
  // Cast the partial to ServiceDeps so we don't have to wire unused fields.
  const deps = {
    db,
    secretStorage: overrides.secretStorage ?? inMemorySecretStorage(),
    log: noopLogger(),
  } as unknown as ServiceDeps;
  return { svc: new ConfigServiceImpl(deps), db };
}

// ─── engineConfig() — hasApiKey flag ─────────────────────────────────────────

describe("ConfigServiceImpl.engineConfig() — hasApiKey flag", () => {
  it("returns hasApiKey:false when nothing is stored", async () => {
    const { svc } = makeService();
    const snap = await svc.engineConfig();
    expect(snap.hasApiKey).toBe(false);
  });

  it("returns hasApiKey:true when a non-empty encrypted key is stored", async () => {
    const { svc, db } = makeService();
    writeEngineConfig(db, inMemorySecretStorage(), {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "sk-stored",
    });
    const snap = await svc.engineConfig();
    expect(snap.hasApiKey).toBe(true);
  });

  it("returns hasApiKey:true when PRAXIS_API_KEY env override is set (no stored key)", async () => {
    const { svc } = makeService();
    process.env.PRAXIS_API_KEY = "sk-from-env";
    const snap = await svc.engineConfig();
    expect(snap.hasApiKey).toBe(true);
  });

  it("returns hasApiKey:false after stored key is cleared", async () => {
    const { svc, db } = makeService();
    const ss = inMemorySecretStorage();
    // Write then clear.
    writeEngineConfig(db, ss, {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "sk-to-clear",
    });
    writeEngineConfig(db, ss, {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "",
    });
    const snap = await svc.engineConfig();
    expect(snap.hasApiKey).toBe(false);
  });
});

// ─── engineConfig() — trust-boundary shape ───────────────────────────────────

describe("ConfigServiceImpl.engineConfig() — trust-boundary shape", () => {
  it("response object has no 'apiKey' property when no key is stored", async () => {
    const { svc } = makeService();
    const snap = await svc.engineConfig();
    // This is the load-bearing assertion: the decrypted secret must never
    // appear on the snapshot shape, even as `undefined`. A future refactor
    // that re-adds apiKey to the snapshot type would make this fail loudly.
    expect(snap).not.toHaveProperty("apiKey");
  });

  it("response object has no 'apiKey' property even when a key IS stored", async () => {
    const { svc, db } = makeService();
    writeEngineConfig(db, inMemorySecretStorage(), {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "sk-secret-must-not-leak",
    });
    const snap = await svc.engineConfig();
    // The key is stored and hasApiKey is true, but the plaintext must not appear.
    expect(snap.hasApiKey).toBe(true);
    expect(snap).not.toHaveProperty("apiKey");
  });

  it("response object has no 'apiKeyEncrypted' property", async () => {
    const { svc, db } = makeService();
    writeEngineConfig(db, inMemorySecretStorage(), {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "sk-secret",
    });
    const snap = await svc.engineConfig();
    expect(snap).not.toHaveProperty("apiKeyEncrypted");
  });

  it("response object carries only the declared EngineConfigSnapshot keys", async () => {
    const { svc, db } = makeService();
    writeEngineConfig(db, inMemorySecretStorage(), {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "sk-secret",
      baseUrl: "https://api.example.com",
      effort: "high",
    });
    const snap = await svc.engineConfig();
    const actualKeys = new Set(Object.keys(snap));
    // These are the only keys that should ever appear on the snapshot.
    const allowedKeys = new Set(["engineId", "model", "hasApiKey", "baseUrl", "effort"]);
    for (const key of actualKeys) {
      expect(allowedKeys.has(key), `unexpected key '${key}' on EngineConfigSnapshot`).toBe(true);
    }
  });
});

// ─── revealApiKey() ───────────────────────────────────────────────────────────

describe("ConfigServiceImpl.revealApiKey()", () => {
  it("returns { apiKey: null } when no key is stored", async () => {
    const { svc } = makeService();
    const result = await svc.revealApiKey();
    expect(result).toEqual({ apiKey: null });
  });

  it("returns the decrypted key when one is stored", async () => {
    const { svc, db } = makeService();
    writeEngineConfig(db, inMemorySecretStorage(), {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "sk-revealed",
    });
    const result = await svc.revealApiKey();
    expect(result).toEqual({ apiKey: "sk-revealed" });
  });

  it("returns { apiKey: null } when storage is unavailable (decrypt returns null)", async () => {
    const { db } = openDb({ path: dbCtx.dbPath });
    // Seed an encrypted blob via working storage first, then read with
    // unavailable storage (simulates keyring rotation / inaccessible keychain).
    writeEngineConfig(db, inMemorySecretStorage(), {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "sk-unreachable",
    });

    // Now read through a service whose storage cannot decrypt.
    const deps = {
      db,
      secretStorage: unavailableSecretStorage(),
      log: noopLogger(),
    } as unknown as ServiceDeps;
    const svc = new ConfigServiceImpl(deps);
    const result = await svc.revealApiKey();
    // decrypt() returns null → cfg.apiKey is undefined → revealApiKey returns null.
    expect(result).toEqual({ apiKey: null });
  });

  it("returns { apiKey: null } after the key has been cleared", async () => {
    const { svc, db } = makeService();
    const ss = inMemorySecretStorage();
    writeEngineConfig(db, ss, {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "sk-will-be-cleared",
    });
    writeEngineConfig(db, ss, {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "",
    });
    const result = await svc.revealApiKey();
    expect(result).toEqual({ apiKey: null });
  });
});

// ─── setEngineConfig() — preserve / clear / replace semantics ─────────────────

describe("ConfigServiceImpl.setEngineConfig() — preserve / clear / replace", () => {
  it("apiKey: undefined preserves the stored key", async () => {
    const { svc, db } = makeService();
    // Prime: store a key.
    writeEngineConfig(db, inMemorySecretStorage(), {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "sk-preserved",
    });

    // setEngineConfig with no apiKey field (undefined) — must preserve.
    const snap = await svc.engineConfig();
    await svc.setEngineConfig({ ...snap });

    // revealApiKey must still return the original value.
    const revealed = await svc.revealApiKey();
    expect(revealed.apiKey).toBe("sk-preserved");
    // hasApiKey must still be true.
    const snapAfter = await svc.engineConfig();
    expect(snapAfter.hasApiKey).toBe(true);
  });

  it("apiKey: '' clears the stored key", async () => {
    const { svc, db } = makeService();
    writeEngineConfig(db, inMemorySecretStorage(), {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "sk-to-clear",
    });

    const snap = await svc.engineConfig();
    await svc.setEngineConfig({ ...snap, apiKey: "" });

    const revealed = await svc.revealApiKey();
    expect(revealed.apiKey).toBeNull();
    const snapAfter = await svc.engineConfig();
    expect(snapAfter.hasApiKey).toBe(false);
  });

  it("apiKey: 'new-key' replaces the stored key (re-encrypted)", async () => {
    const { svc, db } = makeService();
    writeEngineConfig(db, inMemorySecretStorage(), {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "sk-old",
    });

    const snap = await svc.engineConfig();
    await svc.setEngineConfig({ ...snap, apiKey: "sk-new" });

    const revealed = await svc.revealApiKey();
    expect(revealed.apiKey).toBe("sk-new");
    const snapAfter = await svc.engineConfig();
    expect(snapAfter.hasApiKey).toBe(true);
  });

  it("apiKey: undefined preserves when nothing was stored (still no key after)", async () => {
    const { svc } = makeService();
    // No key stored. setEngineConfig with undefined should leave it absent.
    const snap = await svc.engineConfig();
    expect(snap.hasApiKey).toBe(false);
    await svc.setEngineConfig({ ...snap });

    const snapAfter = await svc.engineConfig();
    expect(snapAfter.hasApiKey).toBe(false);
    const revealed = await svc.revealApiKey();
    expect(revealed.apiKey).toBeNull();
  });

  it("non-apiKey fields (engineId, model) are updated independently of key", async () => {
    const { svc, db } = makeService();
    writeEngineConfig(db, inMemorySecretStorage(), {
      engineId: "direct.anthropic",
      model: "claude-sonnet-4-5",
      apiKey: "sk-stays",
    });

    const snap = await svc.engineConfig();
    // Update only model — key must survive.
    await svc.setEngineConfig({ ...snap, model: "claude-3-7-sonnet-latest" });

    const snapAfter = await svc.engineConfig();
    expect(snapAfter.engineId).toBe("direct.anthropic");
    expect(snapAfter.model).toBe("claude-3-7-sonnet-latest");
    expect(snapAfter.hasApiKey).toBe(true);

    const revealed = await svc.revealApiKey();
    expect(revealed.apiKey).toBe("sk-stays");
  });
});
