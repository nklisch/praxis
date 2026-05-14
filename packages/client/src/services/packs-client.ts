import type { ImportedPackClient, PackSummaryClient, PacksClient } from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
import type { ClientTransport } from "../transport/types.js";

/** Canonical channel names for the packs IPC surface. */
const C = {
  listAvailable: "praxis.packs.listAvailable",
  listImported: "praxis.packs.listImported",
  import: "praxis.packs.import",
} as const;

/**
 * PacksClientImpl — Phase 10 real implementation.
 * Backed by praxis.packs.* IPC channels.
 *
 * All methods are thin wrappers over the IPC transport.
 */
export class PacksClientImpl implements PacksClient {
  constructor(private readonly transport: ClientTransport) {}

  /** List all available pack JSONs in the packs directory. */
  async listAvailable(): Promise<PackSummaryClient[]> {
    const result = await this.transport.invoke<
      IpcEnvelope<PackSummaryClient[]> | PackSummaryClient[]
    >(C.listAvailable);
    return unwrapEnvelope(result);
  }

  /** List all imported packs for this install. */
  async listImported(): Promise<ImportedPackClient[]> {
    const result = await this.transport.invoke<
      IpcEnvelope<ImportedPackClient[]> | ImportedPackClient[]
    >(C.listImported);
    return unwrapEnvelope(result);
  }

  /**
   * Import a pack by its id. Idempotent — re-importing the same version
   * returns the existing record without re-writing DB rows.
   */
  async import(packId: string): Promise<ImportedPackClient> {
    const result = await this.transport.invoke<
      IpcEnvelope<ImportedPackClient> | ImportedPackClient
    >(C.import, packId);
    return unwrapEnvelope(result);
  }
}
