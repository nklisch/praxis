import type { ImportedPackClient, PackSummaryClient, PacksClient } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

/**
 * PacksClientImpl — Phase 10 real implementation.
 * Backed by praxis.packs.* IPC channels.
 *
 * All methods are thin wrappers over the IPC transport.
 */
export class PacksClientImpl implements PacksClient {
  constructor(private readonly transport: ClientTransport) {}

  /** List all available pack JSONs in the packs directory. */
  listAvailable(): Promise<PackSummaryClient[]> {
    return this.transport.invoke<PackSummaryClient[]>("praxis.packs.listAvailable");
  }

  /** List all imported packs for this install. */
  listImported(): Promise<ImportedPackClient[]> {
    return this.transport.invoke<ImportedPackClient[]>("praxis.packs.listImported");
  }

  /**
   * Import a pack by its id. Idempotent — re-importing the same version
   * returns the existing record without re-writing DB rows.
   */
  import(packId: string): Promise<ImportedPackClient> {
    return this.transport.invoke<ImportedPackClient>("praxis.packs.import", packId);
  }
}
