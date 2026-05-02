import type { IngestionClient, IngestionEvent, IngestionRequest } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = {
  pickFile: "praxis.ingest.pickFile",
  isAvailable: "praxis.ingest.isAvailable",
  /**
   * Stream BASE channel — the transport's stream() expands this into the
   * three concrete channels below. Do NOT use this with invoke() directly;
   * the actual server-side invoke handler is `${streamBase}.start`.
   */
  streamBase: "praxis.ingest",
  candidatesFor: "praxis.ingest.candidatesFor",
} as const;

/**
 * IngestionClient — typed client for the ingestion IPC channel.
 *
 * `start` uses the transport's stream() method which maps `streamBase` into:
 *   invoke:  praxis.ingest.start
 *   events:  praxis.ingest.events.<streamId>
 *   cancel:  praxis.ingest.cancel
 */
export class IngestClient implements IngestionClient {
  constructor(private readonly transport: ClientTransport) {}

  pickFile(): Promise<string | null> {
    return this.transport.invoke<string | null>(C.pickFile);
  }

  isAvailable(): boolean {
    // In the Electron context the channel is always available.
    // Non-Electron transports (WebSocket) return false via this stub.
    return true;
  }

  start(req: IngestionRequest): AsyncIterable<IngestionEvent> {
    return this.transport.stream<IngestionEvent>(C.streamBase, req);
  }

  candidatesFor(payload: {
    mimeType: string;
    filename: string;
  }): Promise<Array<{ id: string; label: string }>> {
    return this.transport.invoke<Array<{ id: string; label: string }>>(C.candidatesFor, payload);
  }
}
