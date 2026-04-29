import type { ConfigService, EngineConfigSnapshot } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const CHANNEL = "praxis.config";

export class ConfigClient implements ConfigService {
  constructor(private readonly transport: ClientTransport) {}

  isLocked(): Promise<boolean> {
    return this.transport.invoke<boolean>(`${CHANNEL}.isLocked`);
  }

  setLockCode(code: string): Promise<void> {
    return this.transport.invoke<void>(`${CHANNEL}.setLockCode`, code);
  }

  unlock(code: string): Promise<{ ok: boolean }> {
    return this.transport.invoke<{ ok: boolean }>(`${CHANNEL}.unlock`, code);
  }

  selectedEngine(): Promise<string> {
    return this.transport.invoke<string>(`${CHANNEL}.selectedEngine`);
  }

  setSelectedEngine(engineId: string): Promise<void> {
    return this.transport.invoke<void>(`${CHANNEL}.setSelectedEngine`, engineId);
  }

  engineConfig(): Promise<EngineConfigSnapshot> {
    return this.transport.invoke<EngineConfigSnapshot>(`${CHANNEL}.engineConfig`);
  }

  setEngineConfig(config: EngineConfigSnapshot): Promise<void> {
    return this.transport.invoke<void>(`${CHANNEL}.setEngineConfig`, config);
  }
}
