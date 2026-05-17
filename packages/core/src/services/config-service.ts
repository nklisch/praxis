import {
  type BootstrapConfig,
  BootstrapConfigSchema,
  type EngineConfig,
  EngineConfigSchema,
  markFirstRunComplete,
  readBootstrapConfig,
  readEngineConfig,
  readOnboardingConfig,
  writeBootstrapConfig,
  writeEngineConfig,
} from "../config/index.js";
import type {
  BootstrapConfigSnapshot,
  ConfigService,
  EngineConfigSnapshot,
} from "../types/index.js";
import type { ServiceDeps } from "./types.js";

/**
 * Concrete implementation of ConfigService backed by the core config module.
 * Lock-code functionality is a stub — to be implemented in Phase 11.
 */
export class ConfigServiceImpl implements ConfigService {
  constructor(private readonly deps: ServiceDeps) {}

  async isLocked(): Promise<boolean> {
    return false;
  }

  async setLockCode(_code: string): Promise<void> {
    throw new Error("Lock code not implemented in Phase 3");
  }

  async unlock(_code: string): Promise<{ ok: boolean }> {
    return { ok: true };
  }

  async selectedEngine(): Promise<string> {
    return readEngineConfig(this.deps.db, this.deps.secretStorage, this.deps.log).engineId;
  }

  async setSelectedEngine(engineId: string): Promise<void> {
    const current = readEngineConfig(this.deps.db, this.deps.secretStorage, this.deps.log);
    const next = EngineConfigSchema.parse({ ...current, engineId });
    writeEngineConfig(this.deps.db, this.deps.secretStorage, next, this.deps.log);
  }

  async engineConfig(): Promise<EngineConfigSnapshot> {
    return toSnapshot(readEngineConfig(this.deps.db, this.deps.secretStorage, this.deps.log));
  }

  async revealApiKey(): Promise<{ apiKey: string | null }> {
    const cfg = readEngineConfig(this.deps.db, this.deps.secretStorage, this.deps.log);
    if (cfg.apiKey !== undefined && cfg.apiKey.length > 0) {
      return { apiKey: cfg.apiKey };
    }
    return { apiKey: null };
  }

  async setEngineConfig(snapshot: EngineConfigSnapshot & { apiKey?: string }): Promise<void> {
    // The renderer-facing snapshot includes a presence-only `hasApiKey` flag
    // — drop it before validating against the public engine schema.
    const { hasApiKey: _hasApiKey, apiKey, ...rest } = snapshot;

    // Preserve-on-undefined semantics: if `apiKey === undefined`, keep the
    // existing stored value; if `apiKey === ""`, clear; otherwise replace.
    let nextApiKey: string | undefined;
    if (apiKey === undefined) {
      const current = readEngineConfig(this.deps.db, this.deps.secretStorage, this.deps.log);
      nextApiKey = current.apiKey;
    } else if (apiKey === "") {
      nextApiKey = undefined;
    } else {
      nextApiKey = apiKey;
    }

    const merged: EngineConfig = EngineConfigSchema.parse({
      ...rest,
      ...(nextApiKey !== undefined ? { apiKey: nextApiKey } : {}),
    });

    writeEngineConfig(this.deps.db, this.deps.secretStorage, merged, this.deps.log);
  }

  async bootstrapConfig(): Promise<BootstrapConfigSnapshot> {
    return toBootstrapSnapshot(readBootstrapConfig(this.deps.db));
  }

  async setBootstrapConfig(snapshot: BootstrapConfigSnapshot): Promise<void> {
    const validated = BootstrapConfigSchema.parse(snapshot);
    writeBootstrapConfig(this.deps.db, validated);
  }

  async firstRunCompleted(): Promise<boolean> {
    return readOnboardingConfig(this.deps.db).firstRunCompletedAt !== null;
  }

  async markFirstRunComplete(): Promise<void> {
    markFirstRunComplete(this.deps.db);
  }
}

function toBootstrapSnapshot(cfg: BootstrapConfig): BootstrapConfigSnapshot {
  return { maxSteps: cfg.maxSteps };
}

function toSnapshot(cfg: EngineConfig): EngineConfigSnapshot {
  return {
    engineId: cfg.engineId,
    hasApiKey: cfg.apiKey !== undefined && cfg.apiKey.length > 0,
    ...(cfg.model !== undefined && { model: cfg.model }),
    ...(cfg.baseUrl !== undefined && { baseUrl: cfg.baseUrl }),
    ...(cfg.effort !== undefined && { effort: cfg.effort }),
  };
}
