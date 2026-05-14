import type { IngestionClient, IngestionEvent, IngestionRequest } from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
import type { ClientTransport } from "../transport/types.js";

const C = {
  pickFile: "praxis.ingest.pickFile",
  pickPaths: "praxis.ingest.pickPaths",
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

  async pickFile(): Promise<string | null> {
    const result = await this.transport.invoke<IpcEnvelope<string | null> | string | null>(
      C.pickFile,
    );
    return unwrapEnvelope(result);
  }

  async pickPaths(opts: { mode: "files" | "folder" }): Promise<string[]> {
    const result = await this.transport.invoke<IpcEnvelope<string[]> | string[]>(C.pickPaths, opts);
    return unwrapEnvelope(result);
  }

  isAvailable(): boolean {
    // In the Electron context the channel is always available.
    // Non-Electron transports (WebSocket) return false via this stub.
    return true;
  }

  start(req: IngestionRequest): AsyncIterable<IngestionEvent> {
    return this.transport.stream<IngestionEvent>(C.streamBase, req);
  }

  async candidatesFor(payload: {
    mimeType: string;
    filename: string;
  }): Promise<Array<{ id: string; label: string }>> {
    const result = await this.transport.invoke<
      IpcEnvelope<Array<{ id: string; label: string }>> | Array<{ id: string; label: string }>
    >(C.candidatesFor, payload);
    return unwrapEnvelope(result);
  }
}
