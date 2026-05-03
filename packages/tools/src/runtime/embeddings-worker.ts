/**
 * Embeddings worker — runs in a forked Node-mode child process.
 *
 * Why a worker: Electron 21+'s V8 memory cage rejects the external
 * ArrayBuffers that onnxruntime-node (the backend used by
 * @huggingface/transformers) hands V8 during inference. In the GUI main
 * process this triggers SIGTRAP on first embed call and kills the app. The
 * exact same code runs cleanly when the Electron binary is launched in
 * `ELECTRON_RUN_AS_NODE` mode — same V8 build, but the runtime sandbox check
 * that triggers the trap is gated on Chromium init paths that this mode
 * skips.
 *
 * This script is the worker entrypoint: it constructs a singleton
 * `LocalEmbeddingService` and exposes its public methods over the
 * `runWorkerHost` RPC. The host-side proxy
 * (`./embeddings-worker-client.ts`) implements the same `EmbeddingService`
 * interface and delegates to this worker.
 *
 * Configuration via env (set by the host on `fork()`):
 *   PRAXIS_EMBEDDINGS_MODEL_ID    Override the default Xenova/bge-small model.
 *   PRAXIS_EMBEDDINGS_DIMENSION   Override the default 384.
 *   PRAXIS_EMBEDDINGS_CACHE_DIR   Where transformers.js writes its model cache.
 *                                 Required in packaged builds (the default
 *                                 lives inside the read-only asar).
 */
import { runWorkerHost } from "@praxis/core/runtime";
import { LocalEmbeddingService } from "./embeddings.js";

const svc = new LocalEmbeddingService({
  ...(process.env.PRAXIS_EMBEDDINGS_MODEL_ID && {
    modelId: process.env.PRAXIS_EMBEDDINGS_MODEL_ID,
  }),
  ...(process.env.PRAXIS_EMBEDDINGS_DIMENSION && {
    dimension: Number(process.env.PRAXIS_EMBEDDINGS_DIMENSION),
  }),
  ...(process.env.PRAXIS_EMBEDDINGS_CACHE_DIR && {
    cacheDir: process.env.PRAXIS_EMBEDDINGS_CACHE_DIR,
  }),
});

runWorkerHost({
  /** Eagerly load the model. Returns when the pipeline is ready. */
  preload: () => svc.preload(),
  /** Encode a single passage. */
  embed: (args: { text: string }) => svc.embed(args.text),
  /** Encode a query (with the bge-small instruction prefix applied). */
  embedQuery: (args: { query: string }) => svc.embedQuery(args.query),
  /** Batch passage encoding. */
  embedBatch: (args: { texts: string[] }) => svc.embedBatch(args.texts),
});
