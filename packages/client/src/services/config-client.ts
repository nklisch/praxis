import type {
  ConfigService,
  CourseCreateConfigSnapshot,
  EngineConfigSnapshot,
} from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
import type { ClientTransport } from "../transport/types.js";

const CHANNEL = "praxis.config";

export class ConfigClient implements ConfigService {
  constructor(private readonly transport: ClientTransport) {}

  async isLocked(): Promise<boolean> {
    const result = await this.transport.invoke<IpcEnvelope<boolean> | boolean>(
      `${CHANNEL}.isLocked`,
    );
    return unwrapEnvelope(result);
  }

  async setLockCode(code: string): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(
      `${CHANNEL}.setLockCode`,
      code,
    );
    unwrapEnvelope(result);
  }

  async unlock(code: string): Promise<{ ok: boolean }> {
    const result = await this.transport.invoke<IpcEnvelope<{ ok: boolean }> | { ok: boolean }>(
      `${CHANNEL}.unlock`,
      code,
    );
    return unwrapEnvelope(result);
  }

  async selectedEngine(): Promise<string> {
    const result = await this.transport.invoke<IpcEnvelope<string> | string>(
      `${CHANNEL}.selectedEngine`,
    );
    return unwrapEnvelope(result);
  }

  async setSelectedEngine(engineId: string): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(
      `${CHANNEL}.setSelectedEngine`,
      engineId,
    );
    unwrapEnvelope(result);
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

  async setEngineConfig(config: EngineConfigSnapshot & { apiKey?: string }): Promise<void> {
    const { hasApiKey: _hasApiKey, ...wire } = config;
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(
      `${CHANNEL}.setEngineConfig`,
      wire,
    );
    unwrapEnvelope(result);
  }

  async courseCreateConfig(): Promise<CourseCreateConfigSnapshot> {
    const result = await this.transport.invoke<
      IpcEnvelope<CourseCreateConfigSnapshot> | CourseCreateConfigSnapshot
    >(`${CHANNEL}.courseCreateConfig`);
    return unwrapEnvelope(result);
  }

  async setCourseCreateConfig(config: CourseCreateConfigSnapshot): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(
      `${CHANNEL}.setCourseCreateConfig`,
      config,
    );
    unwrapEnvelope(result);
  }

  async firstRunCompleted(): Promise<boolean> {
    const result = await this.transport.invoke<IpcEnvelope<boolean> | boolean>(
      `${CHANNEL}.firstRunCompleted`,
    );
    return unwrapEnvelope(result);
  }

  async markFirstRunComplete(): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(
      `${CHANNEL}.markFirstRunComplete`,
    );
    unwrapEnvelope(result);
  }
}
