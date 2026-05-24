---
id: feature-refactor-buildservices-decomposition-step-4-embeddings
kind: story
stage: implementing
tags: [refactor]
parent: feature-refactor-buildservices-decomposition
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Step 4: Extract `buildEmbeddingsServices()`

## Brief

Extract the vector/FTS stores, embeddings worker, image stores, documents reader,
concept embeddings store, pack import service, and pedagogy pack service into
`packages/desktop/electron/main/services/build-embeddings-services.ts`.

These services share a common characteristic: they are all about data retrieval and
ingestion infrastructure (vectors, FTS, semantic embeddings, image storage) and form
the upstream input for both the indexer pipeline and the ingestion service.

## Services covered

From `packages/desktop/electron/main/services.ts` lines 229–277:

```ts
const vectorStore = new SqliteVecStore(sqlite);
const ftsStore = new SqliteFtsStore(sqlite);
const embeddingsWorker = spawnNodeWorker({ ... });
const embeddings = new WorkerEmbeddingService({ ... });
const pageImageStore = new FsPageImageStore();
const embeddedImageStore = new FsEmbeddedImageStore();
const documentsReader = new DrizzleDocumentsReader(db, pageImageStore);
const conceptEmbeddings = new SqliteConceptEmbeddingsStore(sqlite, log);
const packImportService = new PackImportServiceImpl({ db, log, embeddings, conceptEmbeddings });
const pedagogyPackService = new PedagogyPackServiceImpl({ log });
```

Plus the module-level constants `EMBEDDINGS_MODEL_ID`, `EMBEDDINGS_DIMENSION`,
`resolveDistPath()`, and `requireFromHere` — move them into the new file since they are
only used for embeddings worker construction.

## Target state

New file `packages/desktop/electron/main/services/build-embeddings-services.ts`:

```ts
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { FsEmbeddedImageStore, FsPageImageStore } from "@praxis/core/ingestion";
import { DrizzleDocumentsReader } from "@praxis/core/services";
import type { NodeWorker } from "@praxis/core/runtime";
import { SqliteConceptEmbeddingsStore } from "@praxis/curriculum/packs";
import { PackImportServiceImpl } from "@praxis/curriculum/packs";
import { PedagogyPackServiceImpl } from "@praxis/curriculum/pedagogy";
import {
  SqliteFtsStore,
  SqliteVecStore,
  WorkerEmbeddingService,
} from "@praxis/tools/runtime";
import { app } from "electron";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { Database } from "better-sqlite3";
import type { PackImportService } from "@praxis/core/types";
import type { MainLogger } from "../logger.js";
import { spawnNodeWorker } from "../runtime/spawn-node-worker.js";

const EMBEDDINGS_MODEL_ID = "Xenova/bge-small-en-v1.5";
const EMBEDDINGS_DIMENSION = 384;

const requireFromHere = createRequire(import.meta.url);

function resolveDistPath(packageName: string, distSubpath: string): string {
  const pkgJson = requireFromHere.resolve(`${packageName}/package.json`);
  return join(dirname(pkgJson), distSubpath);
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

export function buildEmbeddingsServices(
  db: BetterSQLite3Database,
  sqlite: Database,
  log: MainLogger,
): EmbeddingsServices { ... }
```

`services.ts` removes the module-level `EMBEDDINGS_MODEL_ID`, `EMBEDDINGS_DIMENSION`,
`requireFromHere`, and `resolveDistPath` — they move wholesale into the new file.

## Implementation notes

- The `app.isPackaged` and `app.getPath("userData")` calls for the transformer cache dir
  stay inside the factory — Electron's `app` is importable there too.
- `documentsReader` is typed as `DrizzleDocumentsReader` (the concrete class) in the
  returned slice; consumers that need the abstract interface use `import type` accordingly.
- `packImportService` is returned as `PackImportServiceImpl` (concrete) so that the
  `Services.packs` field (typed `PackImportService`) is assignable without a cast.
- `embeddingsWorker` (a `NodeWorker`) must be on the returned `Services.workers.embeddings`
  field — wire it through the top-level return.

## Acceptance criteria

- `pnpm typecheck && pnpm lint && pnpm test` green.
- `services.ts` imports no symbols from `node:module`, `node:path`, or `./runtime/spawn-node-worker.js`
  (those move to the factory).
- `EMBEDDINGS_MODEL_ID`, `EMBEDDINGS_DIMENSION`, `requireFromHere`, `resolveDistPath` are
  gone from `services.ts`.
- Worker lifecycle (shutdown on app exit) unchanged — `workers.embeddings` still holds the
  `NodeWorker` handle.

## Risk

Medium — embeddings worker construction involves Electron-specific env vars and path
resolution. The path-resolution logic (`resolveDistPath`) is being moved, not changed;
verify the packaged-build path still resolves by confirming `pnpm --filter @praxis/desktop dist:dir`
produces an unpackaged `.app` that includes the embeddings worker script.

Rollback: revert the new file, restore the module-level constants and inline blocks in `services.ts`.
