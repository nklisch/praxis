import type { EmbeddingService } from "@praxis/core/types";

const DEFAULT_MODEL = "Xenova/bge-small-en-v1.5";
const DEFAULT_DIMENSION = 384;

/**
 * bge-small-en-v1.5 query instruction prefix (recommended by model card).
 * Using the prefix for queries (not passages) raises retrieval quality ~5-10%
 * on standard benchmarks with no additional compute cost for passage encoding.
 */
const QUERY_PREFIX = "Represent this question for searching relevant textbook passages: ";

/**
 * Local embedding service backed by `@huggingface/transformers` (v4).
 *
 * Model: Xenova/bge-small-en-v1.5 (384-dimensional).
 *
 * Asymmetric encoding:
 * - `embed(text)` / `embedBatch(texts)` — passage encoding (no prefix). Used
 *   for document chunks during ingestion.
 * - `embedQuery(query)` — query encoding (QUERY_PREFIX prepended). Used for
 *   retrieval. The prefix is the model card's recommended instruction for
 *   asymmetric retrieval and adds ~5-10% quality on standard benchmarks.
 *
 * The HuggingFace pipeline is lazy-loaded and shared across calls (singleton
 * promise). Calling `preload()` at app startup avoids the first-query latency.
 */
export class LocalEmbeddingService implements EmbeddingService {
  readonly modelId: string;
  readonly dimension: number;
  /**
   * Where transformers.js stores downloaded model files. Must be a writable
   * directory — in a packaged Electron app this needs to be set explicitly to
   * something like `app.getPath("userData")/transformers-cache`, otherwise
   * transformers.js defaults to `node_modules/@huggingface/transformers/.cache`
   * which lives inside the read-only `app.asar` and crashes with ENOTDIR on
   * the first model fetch.
   */
  readonly cacheDir: string | undefined;

  private pipelinePromise: Promise<unknown> | null = null;

  constructor(opts: { modelId?: string; dimension?: number; cacheDir?: string } = {}) {
    this.modelId = opts.modelId ?? DEFAULT_MODEL;
    this.dimension = opts.dimension ?? DEFAULT_DIMENSION;
    this.cacheDir = opts.cacheDir;
  }

  /**
   * Eagerly load the model pipeline. Call this at app startup to avoid
   * first-query latency. Safe to call multiple times (idempotent).
   */
  async preload(): Promise<void> {
    await this.getPipeline();
  }

  /** Encode a passage / chunk for storage. */
  async embed(text: string): Promise<number[]> {
    const [vec] = await this.embedBatch([text]);
    if (!vec) throw new Error("LocalEmbeddingService.embed returned no vectors");
    return vec;
  }

  /**
   * Encode a query (with model-specific instruction prefix for ~5-10%
   * retrieval gain over symmetric encoding).
   */
  async embedQuery(query: string): Promise<number[]> {
    return this.embed(`${QUERY_PREFIX}${query}`);
  }

  /** Batch passage encoding. */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const pipeline = (await this.getPipeline()) as (
      input: string | string[],
      opts: { pooling: "mean"; normalize: true },
    ) => Promise<{ data: Float32Array; dims: number[] }>;

    const out = await pipeline(texts, { pooling: "mean", normalize: true });

    const result: number[][] = [];
    for (let i = 0; i < texts.length; i++) {
      const start = i * this.dimension;
      const slice = out.data.slice(start, start + this.dimension);
      result.push(Array.from(slice));
    }
    return result;
  }

  private async getPipeline(): Promise<unknown> {
    if (!this.pipelinePromise) {
      // Lazy import — @huggingface/transformers downloads the model on first
      // call. The singleton promise ensures the model is only downloaded once
      // even under concurrent calls.
      this.pipelinePromise = (async () => {
        const tx = await import("@huggingface/transformers");
        if (this.cacheDir) {
          tx.env.cacheDir = this.cacheDir;
        }
        return tx.pipeline("feature-extraction", this.modelId);
      })();
    }
    return this.pipelinePromise;
  }
}
