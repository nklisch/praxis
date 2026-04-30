import type { LockClient } from "@praxis/core/types";
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

  isSet(): Promise<boolean> {
    return this.transport.invoke<boolean>(`${C}.isSet`);
  }

  isUnlocked(): Promise<boolean> {
    return this.transport.invoke<boolean>(`${C}.isUnlocked`);
  }

  setLockCode(code: string): Promise<void> {
    return this.transport.invoke<void>(`${C}.setLockCode`, code);
  }

  unlock(code: string): Promise<{ ok: boolean }> {
    return this.transport.invoke<{ ok: boolean }>(`${C}.unlock`, code);
  }

  lock(): Promise<void> {
    return this.transport.invoke<void>(`${C}.lock`);
  }

  clearLock(currentCode: string): Promise<void> {
    return this.transport.invoke<void>(`${C}.clearLock`, currentCode);
  }
}
