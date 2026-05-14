import type { LockClient } from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
import type { ClientTransport } from "../transport/types.js";

const C = "praxis.lock" as const;

/**
 * LockClient — Phase 11 real implementation.
 *
 * Thin IPC wrapper over the `praxis.lock.*` channels registered in ipc-server.ts.
 * Methods control the process-scoped lock state on the main process.
 *
 * Channel convention: praxis.lock.{action}
 */
export class LockClientImpl implements LockClient {
  constructor(private readonly transport: ClientTransport) {}

  async isSet(): Promise<boolean> {
    const result = await this.transport.invoke<IpcEnvelope<boolean> | boolean>(`${C}.isSet`);
    return unwrapEnvelope(result);
  }

  async isUnlocked(): Promise<boolean> {
    const result = await this.transport.invoke<IpcEnvelope<boolean> | boolean>(`${C}.isUnlocked`);
    return unwrapEnvelope(result);
  }

  async setLockCode(code: string): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(`${C}.setLockCode`, code);
    unwrapEnvelope(result);
  }

  async unlock(code: string): Promise<{ ok: boolean }> {
    const result = await this.transport.invoke<IpcEnvelope<{ ok: boolean }> | { ok: boolean }>(
      `${C}.unlock`,
      code,
    );
    return unwrapEnvelope(result);
  }

  async lock(): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(`${C}.lock`);
    unwrapEnvelope(result);
  }

  async clearLock(currentCode: string): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(
      `${C}.clearLock`,
      currentCode,
    );
    unwrapEnvelope(result);
  }
}
