import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import type { PraxisDb, SqliteDatabase } from "@praxis/core/db";
import { FsEmbeddedImageStore, FsPageImageStore } from "@praxis/core/ingestion";
import type { NodeWorker } from "@praxis/core/runtime";
import { DrizzleDocumentsReader } from "@praxis/core/services";
import { PackImportServiceImpl, SqliteConceptEmbeddingsStore } from "@praxis/curriculum/packs";
import { PedagogyPackServiceImpl } from "@praxis/curriculum/pedagogy";
import { SqliteFtsStore, SqliteVecStore, WorkerEmbeddingService } from "@praxis/tools/runtime";
import { app } from "electron";
import type { MainLogger } from "../logger.js";
import { spawnNodeWorker } from "../runtime/spawn-node-worker.js";

/**
 * Default model + dimension shared between the embeddings worker and its
 * host-side proxy. They MUST match — the worker is configured via env vars
 * derived from these and the proxy reports the same values synchronously to
 * `EmbeddingService` consumers.
 */
const EMBEDDINGS_MODEL_ID = "Xenova/bge-small-en-v1.5";
const EMBEDDINGS_DIMENSION = 384;

/**
 * ESM-friendly equivalent of CommonJS `require`. Used to resolve the absolute
 * filesystem path of worker scripts shipped inside `@praxis/*` packages.
 *
 * Caveat: forked child processes run vanilla Node — they do NOT honor the
 * `praxis-source` export condition that Electron's main process resolves
 * with in dev. So we resolve to each package's `package.json` (always
 * available) and construct the explicit `dist/.../<script>.js` path
 * ourselves. This gives us the SAME path in dev and packaged builds.
 * `pnpm dev` runs `pnpm build` first, so `dist/` is always populated.
 */
const requireFromHere = createRequire(import.meta.url);

function resolveDistPath(packageName: string, distSubpath: string): string {
  const pkgJson = requireFromHere.resolve(`${packageName}/package.json`);
  return join(dirname(pkgJson), distSubpath);
}

export interface EmbeddingsServiceDeps {
  db: PraxisDb;
  sqlite: SqliteDatabase;
  log: MainLogger;
}

export interface EmbeddingsServices {
  vectorStore: SqliteVecStore;
  ftsStore: SqliteFtsStore;
  embeddingsWorker: NodeWorker;
  embeddings: WorkerEmbeddingService;
  pageImageStore: FsPageImageStore;
  embeddedImageStore: FsEmbeddedImageStore;
  documentsReader: DrizzleDocumentsReader;
  conceptEmbeddings: SqliteConceptEmbeddingsStore;
  packImportService: PackImportServiceImpl;
  pedagogyPackService: PedagogyPackServiceImpl;
}

export function buildEmbeddingsServices(deps: EmbeddingsServiceDeps): EmbeddingsServices {
  const { db, sqlite, log } = deps;
  // Phase 5: vectors + FTS + embeddings + page images
  const vectorStore = new SqliteVecStore(sqlite);
  const ftsStore = new SqliteFtsStore(sqlite);
  // Embeddings live in a forked Node-mode child process. onnxruntime-node
  // (the backend used by @huggingface/transformers) trips Electron's V8
  // memory cage with SIGTRAP on inference if loaded into the GUI main
  // process; the child is the same Electron binary launched in
  // ELECTRON_RUN_AS_NODE mode, where the runtime sandbox check is gated on
  // Chromium init paths that the Node-only mode skips. See
  // ./runtime/spawn-node-worker.ts for the full rationale.
  //
  // Cache routing: in packaged builds the @huggingface/transformers default
  // cache (`node_modules/@huggingface/transformers/.cache`) lives inside the
  // read-only app.asar and crashes with ENOTDIR on first model fetch. We
  // hand the worker an explicit cacheDir under userData/.
  const embeddingsWorker = spawnNodeWorker({
    scriptPath: resolveDistPath("@praxis/tools", "dist/runtime/embeddings-worker.js"),
    name: "embeddings",
    log,
    env: {
      PRAXIS_EMBEDDINGS_MODEL_ID: EMBEDDINGS_MODEL_ID,
      PRAXIS_EMBEDDINGS_DIMENSION: String(EMBEDDINGS_DIMENSION),
      ...(app.isPackaged && {
        PRAXIS_EMBEDDINGS_CACHE_DIR: join(app.getPath("userData"), "transformers-cache"),
      }),
    },
  });
  const embeddings = new WorkerEmbeddingService({
    worker: embeddingsWorker,
    modelId: EMBEDDINGS_MODEL_ID,
    dimension: EMBEDDINGS_DIMENSION,
  });
  const pageImageStore = new FsPageImageStore();
  const embeddedImageStore = new FsEmbeddedImageStore();
  const documentsReader = new DrizzleDocumentsReader(db, pageImageStore);

  // Phase 10: concept embeddings + pack import service.
  const conceptEmbeddings = new SqliteConceptEmbeddingsStore(sqlite, log);
  const packImportService = new PackImportServiceImpl({
    db,
    log,
    embeddings, // reuse the same LocalEmbeddingService (bge-small-en-v1.5, 384d)
    conceptEmbeddings,
  });

  // Phase 18: pedagogy pack service — loads the bundled pack JSON at boot.
  // Empty-pack mode when the v1 content file hasn't landed yet (no packPath override needed;
  // the default path resolves to packages/curriculum/pedagogy/v1.json at runtime).
  const pedagogyPackService = new PedagogyPackServiceImpl({ log });

  return {
    vectorStore,
    ftsStore,
    embeddingsWorker,
    embeddings,
    pageImageStore,
    embeddedImageStore,
    documentsReader,
    conceptEmbeddings,
    packImportService,
    pedagogyPackService,
  };
}
