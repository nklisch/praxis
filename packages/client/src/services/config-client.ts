import type {
  BootstrapConfigSnapshot,
  ConfigService,
  EngineConfigSnapshot,
} from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
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

  async engineConfig(): Promise<EngineConfigSnapshot> {
    const result = await this.transport.invoke<
      IpcEnvelope<EngineConfigSnapshot> | EngineConfigSnapshot
    >(`${CHANNEL}.engineConfig`);
    return unwrapEnvelope(result);
  }

  /**
   * Fetch the decrypted apiKey for the edit flow. Renderer calls this only
   * when the user explicitly clicks "edit" — steady-state reads use
   * `engineConfig()` which returns `hasApiKey: boolean`. Returns
   * `{ apiKey: null }` when nothing is stored.
   */
  async revealApiKey(): Promise<{ apiKey: string | null }> {
    const result = await this.transport.invoke<
      IpcEnvelope<{ apiKey: string | null }> | { apiKey: string | null }
    >(`${CHANNEL}.engineConfig.reveal`);
    return unwrapEnvelope(result);
  }

  async setEngineConfig(
    config: EngineConfigSnapshot & { apiKey?: string },
  ): Promise<void> {
    const { hasApiKey: _hasApiKey, ...wire } = config;
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(
      `${CHANNEL}.setEngineConfig`,
      wire,
    );
    unwrapEnvelope(result);
  }

  bootstrapConfig(): Promise<BootstrapConfigSnapshot> {
    return this.transport.invoke<BootstrapConfigSnapshot>(`${CHANNEL}.bootstrapConfig`);
  }

  setBootstrapConfig(config: BootstrapConfigSnapshot): Promise<void> {
    return this.transport.invoke<void>(`${CHANNEL}.setBootstrapConfig`, config);
  }

  firstRunCompleted(): Promise<boolean> {
    return this.transport.invoke<boolean>(`${CHANNEL}.firstRunCompleted`);
  }

  markFirstRunComplete(): Promise<void> {
    return this.transport.invoke<void>(`${CHANNEL}.markFirstRunComplete`);
  }
}
