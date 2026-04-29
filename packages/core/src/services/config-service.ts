import {
  type EngineConfig,
  EngineConfigSchema,
  readEngineConfig,
  writeEngineConfig,
} from "../config/index.js";
import type { ConfigService, EngineConfigSnapshot } from "../types/index.js";
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
    return readEngineConfig(this.deps.db).engineId;
  }

  async setSelectedEngine(engineId: string): Promise<void> {
    const current = readEngineConfig(this.deps.db);
    const next = EngineConfigSchema.parse({ ...current, engineId });
    writeEngineConfig(this.deps.db, next);
  }

  async engineConfig(): Promise<EngineConfigSnapshot> {
    return toSnapshot(readEngineConfig(this.deps.db));
  }

  async setEngineConfig(snapshot: EngineConfigSnapshot): Promise<void> {
    const validated = EngineConfigSchema.parse(snapshot);
    writeEngineConfig(this.deps.db, validated);
  }
}

function toSnapshot(cfg: EngineConfig): EngineConfigSnapshot {
  return {
    engineId: cfg.engineId,
    ...(cfg.model !== undefined && { model: cfg.model }),
    ...(cfg.apiKey !== undefined && { apiKey: cfg.apiKey }),
    ...(cfg.baseUrl !== undefined && { baseUrl: cfg.baseUrl }),
    ...(cfg.effort !== undefined && { effort: cfg.effort }),
  };
}
