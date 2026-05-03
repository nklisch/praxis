import type { NodeWorker } from "@praxis/core/runtime";
import type { EmbeddingService } from "@praxis/core/types";

/**
 * `WorkerEmbeddingService` — host-side proxy implementing `EmbeddingService`
 * by delegating to a forked Node-mode worker. Construct one per worker.
 *
 * This is a drop-in replacement for `LocalEmbeddingService` in environments
 * where loading onnxruntime-node directly would crash (Electron). Tests and
 * CLI scripts continue to use `LocalEmbeddingService` in-process.
 *
 * `modelId` and `dimension` are passed at construction so the proxy can
 * answer the synchronous-looking fields of `EmbeddingService` without an
 * extra IPC roundtrip — they're already known by the caller (it's the same
 * env vars the worker reads).
 */
export interface WorkerEmbeddingServiceOptions {
  /** Worker handle returned by `spawnNodeWorker()`. */
  worker: NodeWorker;
  /** Mirror of the model id the worker is configured with. */
  modelId: string;
  /** Mirror of the embedding dimension the worker is configured with. */
  dimension: number;
}

export class WorkerEmbeddingService implements EmbeddingService {
  readonly modelId: string;
  readonly dimension: number;

  constructor(private readonly opts: WorkerEmbeddingServiceOptions) {
    this.modelId = opts.modelId;
    this.dimension = opts.dimension;
  }

  preload(): Promise<void> {
    return this.opts.worker.request<void>("preload", {});
  }

  embed(text: string): Promise<number[]> {
    return this.opts.worker.request<number[]>("embed", { text });
  }

  embedQuery(query: string): Promise<number[]> {
    return this.opts.worker.request<number[]>("embedQuery", { query });
  }

  embedBatch(texts: string[]): Promise<number[][]> {
    return this.opts.worker.request<number[][]>("embedBatch", { texts });
  }
}
