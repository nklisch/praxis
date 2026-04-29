# Design: Phase 5 — Textbook RAG + Ingestion Sidecar

## Overview

Phase 5 lets a student drop a PDF into Praxis and then ask questions about it. The tutor calls `retrieve_from_textbook`, gets ranked chunks back, and answers with citations the student can click to inspect. After Phase 5, all the framework's grounding plumbing is in place: deterministic computation (Phase 4), code execution (Phase 4), and now textbook retrieval — three of the five tiers of the graded grounding hierarchy.

This phase introduces three structural firsts:

1. **The Python sidecar boundary** as an actual subprocess, not just a designed seam. `python/praxis-cli/` is the first uv-installable Python package, wrapping Marker for PDF parsing.
2. **The `VectorStore` port + `sqlite-vec` adapter**, plus a `document_embeddings` virtual table programmatically created when the DB opens (drizzle doesn't model virtual tables).
3. **Local embedding inference** via `@huggingface/transformers` v4 — no API key, ~33MB model download on first ingestion.

After Phase 5: `pnpm dev` → upload a PDF → watch parsing + embedding progress → ask "what does chapter 3 say about respiration?" → tutor calls `retrieve_from_textbook`, returns chunks → assistant answers with `[1]`, `[2]` chips that scroll to source cards below the message.

**What ships:**

- Type contract additions: `VectorStore`, `EmbeddingService`, `Citation`, `IngestionEvent`, `DocumentChunk` types in `@praxis/core/types`
- `python/praxis-cli/` Python package (`uv tool install praxis-cli`) with `ingest <file>` subcommand wrapping Marker; outputs structured JSON to stdout
- `@praxis/tools/runtime/embeddings.ts` — `LocalEmbeddingService` (HF transformers v4, bge-small-en-v1.5 384d)
- `@praxis/tools/runtime/sqlite-vec-store.ts` — `SqliteVecStore` (raw better-sqlite3 access; metadata-filtered cosine search)
- `@praxis/core/db` extension — `initVectorStore(sqlite)` loads the extension and creates the `document_embeddings` virtual table
- `@praxis/core/ingestion/` — `IngestionService` orchestrates subprocess + parsing + storage + embedding with progress streaming
- `@praxis/tools/retrieval/retrieve-from-textbook.ts` — the new `retrieve_from_textbook` tool (tier: `"grounded"`)
- `@praxis/core/services/documents-service.ts` — read-only document listing; ingestion exposed via `IngestionService`
- IPC additions: `praxis.ingest.start/.events.<streamId>/.cancel`, `praxis.documents.list`, `praxis.documents.delete`
- Client additions: `client.ingest`, `client.documents`
- Desktop: file picker integration, `dialog.showOpenDialog`, drag-drop optional
- UI: `<AddDocumentButton>`, `<IngestionProgressModal>`, `<DocumentList>`, `<CitationChip>`, `<SourceCard>`
- `teach` mode update: add `"retrieve_from_textbook"` to `toolNames`; tools fragment teaches the agent to emit `[1]`, `[2]` style citations

**What does not ship (deferred):**

- Cloud embedding providers (OpenAI/Voyage via Vercel AI SDK) — interface ready; impls land later
- PDF page rendering — citation cards show extracted text + page number, not a rendered page image (Phase 13 pdf.js / vision integration)
- Multi-format ingestion (EPUB, .docx) — Marker supports them; Phase 5 wires only PDF
- Document re-ingestion / update — delete + re-upload is the workflow
- Concept extraction from documents (draft course bootstrap) — Phase 6
- pgvector adapter for hosted deployment — Phase 15
- Any handling of OCR for image-only PDFs beyond what Marker does internally

## Scope and assumptions

- **Local-only embeddings.** `@huggingface/transformers` v4 with `Xenova/bge-small-en-v1.5` (384-dim). Lazy-loaded singleton (`LocalEmbeddingService`) like `PyodideHost`. Preloaded at app startup so the first ingestion doesn't pay the cold-start cost.
- **Whole-document Marker batch + synthetic progress.** `praxis-cli ingest <file>` runs Marker on the entire PDF (one black-box step) and emits the structured JSON. Phase 5 reports progress as: (1) "parsing" indeterminate while subprocess runs, (2) "embedding chunk N/total" once chunks land. Per-page streaming via `marker_server` is deferred to a future polish pass.
- **`praxis-cli` is the Python package name.** Multiple subcommands as the framework grows. Phase 5 ships only `ingest`. Distributed via `uv tool install praxis-cli` (recommended) or `pip install praxis-cli`. Lives at `python/praxis-cli/` in the monorepo for dev.
- **GPL boundary preserved.** Marker (GPL-3.0 code + commercial-restricted weights) runs as a subprocess. The Praxis Electron app is not "linked" to GPL code. Local-first v1 is below Datalab's $2M commercial threshold; the threshold check resurfaces if/when Praxis is sold commercially.
- **First-run model downloads.** Marker's models (~2 GB combined Surya + Texify weights) and the embedding model (~33 MB) download on first use. The desktop should surface "first-time setup, this may take a few minutes" UI; we don't bundle weights.
- **`sqlite-vec` virtual table created programmatically.** Drizzle doesn't model virtual tables; `initVectorStore(sqlite)` is called by `openDb` (or by the desktop service builder) right after Drizzle migrations apply. The extension itself is ABI-independent — no `electron-rebuild` for it.
- **Citation format**: assistant emits `[1]`, `[2]`, `[3]` style references in its text. The UI parses these from the assistant's `model_message` content and renders as clickable chips. Each chip targets a source card rendered below the message, populated from the `tool_result` event's chunks.
- **Ingestion is per-student.** Documents are scoped to the singleton default student (Phase 3). Multi-student is later.
- **Detection of `praxis-cli`.** Desktop checks for the binary on PATH at startup (one-shot `which`/`where` call). If missing, the "Add document" UI surfaces an install hint instead of opening the file picker.
- **Test gating**: real Marker tests are gated behind `PRAXIS_RUN_SLOW_TESTS=1` (joins Phase 4's Pyodide gating). Real embedding model load is also gated. Fast-lane tests mock both.

## Dependency direction (Phase 5 additions, no violations)

```
@praxis/core/services
  ├─ existing (Phase 3 exception): @praxis/engines, @praxis/tools
  └─ Phase 5 NEW: spawns praxis-cli subprocess via child_process (no @praxis/* dep)

@praxis/core/db
  └─ Phase 5 NEW: optional sqlite-vec init; types still pure

@praxis/tools
  ├─ runtime additions: sqlite-vec, @huggingface/transformers
  └─ type-only: @praxis/core/types  (existing)

python/praxis-cli/                       (NEW; standalone Python package)
  ├─ pyproject.toml (uv-managed)
  ├─ deps: marker-pdf, click
  └─ Distributed independently via PyPI; subprocess from @praxis/core/ingestion

document_embeddings (sqlite-vec virtual table)
  └─ created at openDb time via raw SQL after extension load
```

Per CLAUDE.md, the `@praxis/core/services` exception covers the Phase 5 imports of `@praxis/engines` and `@praxis/tools`. The Python subprocess is invoked via `node:child_process`; no @praxis/* package crosses to Python.

---

## Implementation Units

### Unit 1: Type contract additions

**File**: `packages/core/src/types/tool.ts` (modified — `vectorStore` and embedding become concrete)
**File**: `packages/core/src/types/citation.ts` (new — `Citation`, `RetrievalResult`)
**File**: `packages/core/src/types/ingestion.ts` (new — `IngestionEvent`, `IngestionRequest`)

**`packages/core/src/types/tool.ts`** changes (additions, not replacements of unrelated fields):

```typescript
export interface ToolServices {
  memory: unknown;       // → Phase 7
  artifacts: unknown;    // → Phase 6
  vectorStore: VectorStore;          // ← Phase 5 (was unknown)
  sandbox: CodeSandbox;
  sympy: SymPyService;
  embeddings: EmbeddingService;      // ← Phase 5 NEW field on ToolServices
  pedagogyPack: unknown; // → Phase 14
}

// ─── EmbeddingService ────────────────────────────────────────────────────────

export interface EmbeddingService {
  /** Single-text embedding. */
  embed(text: string): Promise<number[]>;
  /** Batch embedding — implementations should batch internally for throughput. */
  embedBatch(texts: string[]): Promise<number[][]>;
  /** Vector dimension (e.g. 384 for bge-small-en-v1.5). Used to size virtual tables. */
  readonly dimension: number;
  /** Identifier for diagnostics (e.g. "Xenova/bge-small-en-v1.5"). */
  readonly modelId: string;
}

// ─── VectorStore ─────────────────────────────────────────────────────────────

export interface VectorStore {
  /** Insert or replace a single vector. Replaces if `chunkId` already exists. */
  upsert(input: VectorUpsertInput): Promise<void>;
  /** Batch insert/replace. Implementations should use a single transaction. */
  upsertBatch(items: ReadonlyArray<VectorUpsertInput>): Promise<void>;
  /** Cosine-similarity nearest-neighbor search. Returns up to `topK`. */
  search(input: VectorSearchInput): Promise<VectorSearchResult[]>;
  /** Delete all vectors for a given document. Used when a document is removed. */
  deleteByDocumentId(documentId: string): Promise<void>;
}

export interface VectorUpsertInput {
  chunkId: string;
  documentId: string;
  embedding: number[];
  chunkText: string;
  page?: number;
  section?: string;
}

export interface VectorSearchInput {
  embedding: number[];
  topK: number;
  /** Restrict search to chunks from these documents. Empty/undefined = all documents. */
  documentIds?: ReadonlyArray<string>;
}

export interface VectorSearchResult {
  chunkId: string;
  documentId: string;
  chunkText: string;
  page?: number;
  section?: string;
  /** Cosine distance from sqlite-vec; smaller = more similar. */
  distance: number;
}
```

**`packages/core/src/types/citation.ts`** (new):

```typescript
/** A single chunk reference returned by retrieve_from_textbook. */
export interface Citation {
  /** Index used by the model to reference this citation in text (e.g. "[1]"). */
  index: number;
  documentId: string;
  documentTitle: string;
  chunkId: string;
  chunkText: string;
  page?: number;
  section?: string;
  /** Cosine distance from the query; informational, not used for sorting in UI. */
  distance: number;
}

export interface RetrievalResult {
  query: string;
  citations: Citation[];
}
```

**`packages/core/src/types/ingestion.ts`** (new):

```typescript
export type IngestionEvent =
  | { type: "start"; documentId: string; filename: string }
  | { type: "parsing"; message: string }
  | { type: "parsed"; chunkCount: number }
  | { type: "embedding"; chunksProcessed: number; totalChunks: number }
  | { type: "done"; documentId: string; chunkCount: number }
  | { type: "error"; error: { code: string; message: string; recoverable: boolean } };

export interface IngestionRequest {
  /** Absolute path to the file. */
  filePath: string;
  /** User-friendly filename (display only; persisted on the Document row). */
  filename: string;
  /** Mime type, e.g. "application/pdf". */
  mimeType: string;
  /** Owner. */
  studentId: string;
}
```

**`packages/core/src/types/index.ts`** — add re-exports:

```typescript
export type * from "./citation.js";
export type * from "./ingestion.js";
```

**`packages/core/src/types/client.ts`** additions for new services:

```typescript
import type { IngestionEvent, IngestionRequest } from "./ingestion.js";

export interface PraxisClient {
  session: SessionService;
  artifacts: ArtifactsService;
  author: AuthoringService;
  memory: MemoryService;
  config: ConfigService;
  ingest: IngestionClient;       // ← NEW Phase 5
  documents: DocumentsClient;    // ← NEW Phase 5
}

export interface IngestionClient {
  /** Pick a file via the host's native file picker. Returns null if the user cancels. */
  pickFile(): Promise<{ filePath: string; filename: string; mimeType: string } | null>;
  /** Start ingestion. Yields IngestionEvent stream until done or error. */
  start(req: Pick<IngestionRequest, "filePath" | "filename" | "mimeType">): AsyncIterable<IngestionEvent>;
  /** Whether the praxis-cli sidecar is installed. Surfaced in the UI when false. */
  isAvailable(): Promise<{ available: boolean; installHint?: string }>;
}

export interface DocumentsClient {
  list(): Promise<DocumentSummary[]>;
  delete(documentId: string): Promise<void>;
}

export interface DocumentSummary {
  id: string;
  filename: string;
  mimeType: string;
  ingestedAt: number;
  chunkCount: number;
  /** Document title from manifest if present; falls back to filename. */
  title: string;
}
```

**Acceptance Criteria**:
- [ ] All new interfaces compile; `ToolServices.vectorStore` and `.embeddings` are concrete.
- [ ] `EngineEvent`, existing `Citation`-related types in `artifacts.ts` (if any) are not broken.
- [ ] `PraxisClient` includes `ingest` and `documents` keys.
- [ ] Existing tests pass with mocked impls of the new services.

---

### Unit 2: `python/praxis-cli/` — Python sidecar package

**Files**:
- `python/praxis-cli/pyproject.toml`
- `python/praxis-cli/src/praxis_cli/__init__.py`
- `python/praxis-cli/src/praxis_cli/cli.py`
- `python/praxis-cli/src/praxis_cli/ingest.py`
- `python/praxis-cli/README.md`
- `python/praxis-cli/tests/test_ingest.py`
- `.gitignore` (add `python/**/.venv`, `python/**/__pycache__`, `python/**/*.egg-info`)

**`python/praxis-cli/pyproject.toml`**:

```toml
[project]
name = "praxis-cli"
version = "0.1.0"
description = "Praxis sidecar CLI: PDF ingestion via Marker (Phase 5); future subcommands TBD."
requires-python = ">=3.10"
dependencies = [
  "marker-pdf>=1.10,<2",
  "click>=8.1",
]
license = { text = "GPL-3.0-or-later" }
authors = [{ name = "Praxis Contributors" }]

[project.scripts]
praxis-cli = "praxis_cli.cli:main"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/praxis_cli"]
```

> Note: `license = "GPL-3.0-or-later"` because we depend on `marker-pdf` (GPL-3.0). The Praxis app proper stays MIT/Apache-friendly because the CLI is invoked as a subprocess (no linking).

**`python/praxis-cli/src/praxis_cli/cli.py`**:

```python
"""Praxis sidecar CLI entry point. Subcommands are routed via Click groups."""
from __future__ import annotations
import sys
import click

from praxis_cli.ingest import ingest_command


@click.group()
@click.version_option()
def main() -> None:
    """Praxis sidecar CLI."""


main.add_command(ingest_command, name="ingest")


if __name__ == "__main__":
    main()
```

**`python/praxis-cli/src/praxis_cli/ingest.py`**:

```python
"""`praxis-cli ingest <file>` subcommand.

Output contract:
- stdout: a single JSON object representing the parsed document, terminated by a newline.
  Schema:
  {
    "schema_version": "1",
    "document": {
      "title": str | null,
      "page_count": int,
      "chunks": [
        {
          "chunk_index": int,
          "text": str,
          "page": int | null,
          "section": str | null,
          "block_type": str
        },
        ...
      ]
    }
  }
- stderr: progress lines (free-form text, ignored by the Node consumer in v0.5).
  Marker's own log output also goes to stderr.
- Exit code: 0 on success; non-zero on failure with error JSON to stderr.
"""
from __future__ import annotations
import json
import sys
import traceback
from pathlib import Path
from typing import Any

import click


@click.command()
@click.argument("file_path", type=click.Path(exists=True, dir_okay=False, resolve_path=True))
@click.option("--max-chars", type=int, default=2000, help="Approximate chars per chunk.")
def ingest_command(file_path: str, max_chars: int) -> None:
    """Parse a PDF (or other Marker-supported format) and emit structured JSON."""
    try:
        result = run_ingest(Path(file_path), max_chars=max_chars)
    except Exception as exc:  # noqa: BLE001  — top-level CLI guard
        err: dict[str, Any] = {
            "schema_version": "1",
            "error": {
                "code": "ingest.failed",
                "message": str(exc),
                "traceback": traceback.format_exc(),
            },
        }
        sys.stderr.write(json.dumps(err) + "\n")
        sys.exit(1)
    sys.stdout.write(json.dumps(result) + "\n")
    sys.stdout.flush()


def run_ingest(file_path: Path, max_chars: int) -> dict[str, Any]:
    """Run Marker on file_path and project the output to the Praxis chunk schema."""
    # Lazy import — Marker import is slow (~3-5s)
    from marker.converters.pdf import PdfConverter
    from marker.models import create_model_dict
    from marker.output import text_from_rendered

    converter = PdfConverter(artifact_dict=create_model_dict())
    rendered = converter(str(file_path))

    full_text, _meta, _images = text_from_rendered(rendered)
    chunks = chunk_markdown(full_text, max_chars=max_chars)

    return {
        "schema_version": "1",
        "document": {
            "title": _meta.get("title") if isinstance(_meta, dict) else None,
            "page_count": _meta.get("page_count") if isinstance(_meta, dict) else None,
            "chunks": [
                {
                    "chunk_index": idx,
                    "text": chunk["text"],
                    "page": chunk.get("page"),
                    "section": chunk.get("section"),
                    "block_type": chunk.get("block_type", "Text"),
                }
                for idx, chunk in enumerate(chunks)
            ],
        },
    }


def chunk_markdown(markdown: str, *, max_chars: int) -> list[dict[str, Any]]:
    """Split markdown by paragraph, accumulate up to max_chars per chunk.

    Tracks the current section heading by parsing `# `, `## `, `### ` lines.
    Page numbers are not reliably preserved by Marker's markdown output (they're
    in the JSON tree which would require a parallel parse); Phase 5 ships without
    page-level locators for chunks, only section. A future iteration can switch
    to Marker's JSON output to preserve page indices per chunk.
    """
    chunks: list[dict[str, Any]] = []
    current_section: str | None = None
    buffer: list[str] = []
    buffer_len = 0
    for paragraph in markdown.split("\n\n"):
        stripped = paragraph.strip()
        if not stripped:
            continue
        if stripped.startswith("#"):
            # Flush before a new section header
            if buffer:
                chunks.append({"text": "\n\n".join(buffer), "section": current_section})
                buffer, buffer_len = [], 0
            # Update current section
            heading = stripped.lstrip("#").strip()
            current_section = heading
            chunks.append({"text": stripped, "section": current_section, "block_type": "SectionHeader"})
            continue
        if buffer_len + len(stripped) > max_chars and buffer:
            chunks.append({"text": "\n\n".join(buffer), "section": current_section})
            buffer, buffer_len = [], 0
        buffer.append(stripped)
        buffer_len += len(stripped)
    if buffer:
        chunks.append({"text": "\n\n".join(buffer), "section": current_section})
    return chunks
```

**`python/praxis-cli/src/praxis_cli/__init__.py`**:

```python
__version__ = "0.1.0"
```

**`python/praxis-cli/tests/test_ingest.py`**:

```python
"""Smoke tests for the chunker (Marker integration is too heavy for CI)."""
from praxis_cli.ingest import chunk_markdown


def test_chunk_markdown_groups_paragraphs():
    md = "# Chapter 1\n\npara one.\n\npara two.\n\n## Section 1.1\n\npara three."
    chunks = chunk_markdown(md, max_chars=2000)
    sections = [c.get("section") for c in chunks]
    assert "Chapter 1" in sections
    assert "Section 1.1" in sections


def test_chunk_markdown_splits_at_max_chars():
    md = "# T\n\n" + ("\n\n".join(["x" * 100] * 50))
    chunks = chunk_markdown(md, max_chars=500)
    assert len(chunks) > 2
```

**Implementation Notes**:
- The CLI's stdout is the *result*; stderr is *progress + Marker logs*. Phase 5 doesn't try to parse stderr for progress; the Node side just shows "parsing..." until the subprocess exits.
- `text_from_rendered` returns markdown + metadata + images. We use markdown for chunking; images are dropped in Phase 5 (no figure handling yet). The Marker JSON tree route is a future refinement for per-page locators.
- Lazy import of `marker.*` keeps `--help` fast.
- The `chunk_markdown` function is intentionally simple: paragraph boundaries + section tracking + soft size limit. More sophisticated chunking (semantic boundaries via embeddings) is a future polish.
- The `tests/test_ingest.py` covers only the chunker — Marker integration tests would need real model downloads and PyTorch.

**Acceptance Criteria**:
- [ ] `uv tool install -e python/praxis-cli` (from repo root) installs the CLI.
- [ ] `praxis-cli --version` prints `0.1.0`.
- [ ] `praxis-cli ingest --help` shows the `ingest` command.
- [ ] `praxis-cli ingest /path/to/sample.pdf` writes a single JSON line to stdout matching the schema; first stderr line is whatever Marker logs.
- [ ] On malformed input, exit code is non-zero and stderr contains a JSON error object.
- [ ] `pytest python/praxis-cli/tests/` passes (chunker smoke tests).

---

### Unit 3: `LocalEmbeddingService`

**Files**:
- `packages/tools/src/runtime/embeddings.ts` (new)
- `packages/tools/src/runtime/__tests__/embeddings.test.ts` (new — fast unit + slow integration)
- `packages/tools/package.json` (add `@huggingface/transformers ^4`)
- `packages/tools/src/runtime/index.ts` (re-export)

```typescript
import type { EmbeddingService } from "@praxis/core/types";

export interface LocalEmbeddingServiceOptions {
  /** Override the default model (Xenova/bge-small-en-v1.5). */
  modelId?: string;
  /**
   * Override the model dimension if changing modelId. Default 384 for bge-small.
   * Must match the vec0 virtual table dimension or upserts will fail.
   */
  dimension?: number;
}

const DEFAULT_MODEL = "Xenova/bge-small-en-v1.5";
const DEFAULT_DIMENSION = 384;

/**
 * Local embedding inference via @huggingface/transformers v4. Singleton
 * lazy-loaded — first call triggers model download (~33MB for bge-small).
 * Subsequent calls reuse the in-memory pipeline. Designed to run as a
 * service singleton in the Electron main process.
 */
export class LocalEmbeddingService implements EmbeddingService {
  readonly modelId: string;
  readonly dimension: number;
  private pipelinePromise: Promise<unknown> | null = null;

  constructor(opts: LocalEmbeddingServiceOptions = {}) {
    this.modelId = opts.modelId ?? DEFAULT_MODEL;
    this.dimension = opts.dimension ?? DEFAULT_DIMENSION;
  }

  /** Eagerly load. Call from desktop's app.whenReady so first ingestion is snappy. */
  async preload(): Promise<void> {
    await this.getPipeline();
  }

  async embed(text: string): Promise<number[]> {
    const [vec] = await this.embedBatch([text]);
    if (!vec) throw new Error("LocalEmbeddingService.embed returned no vectors");
    return vec;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const pipeline = (await this.getPipeline()) as (
      input: string | string[],
      opts: { pooling: "mean"; normalize: true },
    ) => Promise<{ data: Float32Array; dims: number[] }>;
    const out = await pipeline(texts, { pooling: "mean", normalize: true });
    // out.data is a Float32Array of shape [batch, dim]; reshape per row.
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
      this.pipelinePromise = (async () => {
        const tx = await import("@huggingface/transformers");
        return tx.pipeline("feature-extraction", this.modelId);
      })();
    }
    return this.pipelinePromise;
  }
}
```

**Implementation Notes**:
- Mirrors `PyodideHost`'s lazy-load + preload pattern exactly. See `pyodide-host.ts` for prior art.
- The transformers.js v4 pipeline returns `{ data: Float32Array, dims: number[] }`. We reshape per-row using the known `dimension`.
- `pooling: "mean", normalize: true` — standard for BGE models, matches sqlite-vec's cosine distance.
- `embedBatch` takes the raw `texts.length` count and assumes the runtime will batch internally; HF transformers handles batches via dynamic padding.
- The `unknown` cast on the pipeline avoids dragging the full HF transformers type tree into the public surface.

**Acceptance Criteria**:
- [ ] `new LocalEmbeddingService()` doesn't load — `pipelinePromise` is null.
- [ ] `service.embed("hello")` returns a `number[]` of length 384 (slow, gated).
- [ ] `service.embedBatch(["a", "b", "c"])` returns 3 vectors of length 384 each (slow, gated).
- [ ] Concurrent `service.embed()` calls share one load promise (no duplicate downloads).
- [ ] `service.preload()` returns a Promise that resolves when ready.
- [ ] Unit tests with `vi.mock("@huggingface/transformers")` cover lazy-load, batching, dimension reshape (fast lane).

---

### Unit 4: `SqliteVecStore` + `initVectorStore`

**Files**:
- `packages/tools/src/runtime/sqlite-vec-store.ts` (new)
- `packages/core/src/db/vector-init.ts` (new — `initVectorStore` helper)
- `packages/core/src/db/index.ts` (modified — call vector init on openDb)
- `packages/tools/package.json` (add `sqlite-vec ^0.1.9`)
- `packages/tools/src/runtime/__tests__/sqlite-vec-store.test.ts` (new)

**`packages/core/src/db/vector-init.ts`** (new):

```typescript
import type Database from "better-sqlite3";

const EMBEDDING_DIMENSION = 384;

/**
 * Load the sqlite-vec extension and create the `document_embeddings` virtual
 * table if it doesn't exist. Idempotent. Called by openDb after Drizzle
 * migrations have run.
 *
 * If sqlite-vec is unavailable (e.g., test environment without the extension),
 * this throws a clear error so callers can decide how to handle it.
 */
export function initVectorStore(sqlite: Database.Database, dimension: number = EMBEDDING_DIMENSION): void {
  loadSqliteVec(sqlite);
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS document_embeddings USING vec0(
      chunk_id TEXT PRIMARY KEY,
      document_id TEXT,
      embedding FLOAT[${dimension}],
      +chunk_text TEXT,
      +page INTEGER,
      +section TEXT
    );
  `);
}

function loadSqliteVec(sqlite: Database.Database): void {
  // Dynamic require to keep sqlite-vec out of the type-checker's hot path
  // and avoid eager native binary load in tests that mock the extension.
  // biome-ignore lint/suspicious/noExplicitAny: sqlite-vec is loaded dynamically
  const sqliteVec = require("sqlite-vec") as { load: (db: Database.Database) => void };
  sqliteVec.load(sqlite);
}
```

**`packages/core/src/db/index.ts`** (modified — add optional vector init):

```typescript
export interface OpenDbOptions {
  path?: string;
  readonly?: boolean;
  /** Initialize sqlite-vec + document_embeddings virtual table. Default: true. */
  initVectors?: boolean;
}

export function openDb(opts: OpenDbOptions = {}): { db: PraxisDb; path: string } {
  if (cached && !opts.path) return { db: cached.db, path: cached.path };

  const path = opts.path ?? resolveDbPath();
  mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path, { readonly: opts.readonly ?? false });
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  if (opts.initVectors !== false && !opts.readonly) {
    initVectorStore(sqlite);
  }

  const db = drizzle(sqlite, { schema });
  if (!opts.path) cached = { sqlite, db, path };
  return { db, path };
}
```

**`packages/tools/src/runtime/sqlite-vec-store.ts`** (new):

```typescript
import type Database from "better-sqlite3";
import type { VectorSearchInput, VectorSearchResult, VectorStore, VectorUpsertInput } from "@praxis/core/types";

/**
 * sqlite-vec backed VectorStore. Holds a reference to the underlying
 * better-sqlite3 instance for raw SQL access (Drizzle doesn't model virtual
 * tables). Constructed by buildServices alongside SqliteVecStore.
 */
export class SqliteVecStore implements VectorStore {
  private readonly upsertStmt: Database.Statement;
  private readonly deleteByDocStmt: Database.Statement;

  constructor(private readonly sqlite: Database.Database) {
    // Prepared statements at construction time so they persist for the process lifetime.
    this.upsertStmt = sqlite.prepare(`
      INSERT INTO document_embeddings (chunk_id, document_id, embedding, chunk_text, page, section)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(chunk_id) DO UPDATE SET
        document_id = excluded.document_id,
        embedding = excluded.embedding,
        chunk_text = excluded.chunk_text,
        page = excluded.page,
        section = excluded.section;
    `);
    this.deleteByDocStmt = sqlite.prepare(
      "DELETE FROM document_embeddings WHERE document_id = ?",
    );
  }

  async upsert(input: VectorUpsertInput): Promise<void> {
    this.upsertStmt.run(
      input.chunkId,
      input.documentId,
      vectorToBlob(input.embedding),
      input.chunkText,
      input.page ?? null,
      input.section ?? null,
    );
  }

  async upsertBatch(items: ReadonlyArray<VectorUpsertInput>): Promise<void> {
    const txn = this.sqlite.transaction((rows: ReadonlyArray<VectorUpsertInput>) => {
      for (const row of rows) {
        this.upsertStmt.run(
          row.chunkId,
          row.documentId,
          vectorToBlob(row.embedding),
          row.chunkText,
          row.page ?? null,
          row.section ?? null,
        );
      }
    });
    txn(items);
  }

  async search(input: VectorSearchInput): Promise<VectorSearchResult[]> {
    // Build the WHERE clause dynamically for optional documentIds filter.
    // We use SQL placeholders for safety; metadata filtering happens server-side
    // in the virtual table (sqlite-vec supports `=` and `IN` on metadata columns).
    const docIds = input.documentIds ?? [];
    const hasFilter = docIds.length > 0;
    const sql = `
      SELECT chunk_id, document_id, chunk_text, page, section, distance
      FROM document_embeddings
      WHERE embedding MATCH ?
        AND k = ?
        ${hasFilter ? `AND document_id IN (${docIds.map(() => "?").join(",")})` : ""}
      ORDER BY distance;
    `;
    const stmt = this.sqlite.prepare(sql);
    const params: (Buffer | number | string)[] = [
      vectorToBlob(input.embedding),
      input.topK,
      ...docIds,
    ];
    const rows = stmt.all(...params) as Array<{
      chunk_id: string;
      document_id: string;
      chunk_text: string;
      page: number | null;
      section: string | null;
      distance: number;
    }>;
    return rows.map((r) => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      chunkText: r.chunk_text,
      ...(r.page !== null && { page: r.page }),
      ...(r.section !== null && { section: r.section }),
      distance: r.distance,
    }));
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    this.deleteByDocStmt.run(documentId);
  }
}

/** Float32 encoded as little-endian bytes — sqlite-vec's wire format for FLOAT[N]. */
function vectorToBlob(vector: number[]): Buffer {
  const buf = Buffer.alloc(vector.length * 4);
  for (let i = 0; i < vector.length; i++) {
    buf.writeFloatLE(vector[i] ?? 0, i * 4);
  }
  return buf;
}
```

**Implementation Notes**:
- Prepared statements at construction time are reused across calls — important for upsertBatch which can run thousands of inserts during a textbook ingestion.
- `vectorToBlob` converts `number[]` to little-endian Float32 bytes — sqlite-vec's wire format. Verified against sqlite-vec docs.
- The `WHERE embedding MATCH ?` syntax is sqlite-vec's KNN search; `k = ?` sets `topK`. Metadata filters (`document_id IN (...)`) live in the same WHERE clause.
- `upsertBatch` wraps in a `transaction` for ~10× throughput vs individual inserts.
- The store does NOT load the extension itself — that's `initVectorStore`'s job, called once at openDb time. The store assumes the table exists.

**Acceptance Criteria**:
- [ ] `initVectorStore(sqlite)` creates the `document_embeddings` virtual table; idempotent (running twice doesn't error).
- [ ] After `openDb()`, the `document_embeddings` table exists (verify via `SELECT name FROM sqlite_master WHERE type='table'`).
- [ ] `store.upsert(input)` inserts a row; immediate `store.search(input.embedding, 1)` returns it.
- [ ] `store.upsertBatch([...100 items])` runs in a single transaction (fast: <100ms for 100 items).
- [ ] `store.search` with `documentIds: ["doc1"]` returns only chunks from doc1.
- [ ] `store.deleteByDocumentId("doc1")` removes all doc1 chunks; subsequent search returns nothing for doc1.
- [ ] Tests use real sqlite-vec (it's prebuilt, fast, no rebuild needed); mark `.skipIf` only if the extension fails to load.

---

### Unit 5: `IngestionService`

**Files**:
- `packages/core/src/ingestion/service.ts` (new)
- `packages/core/src/ingestion/sidecar.ts` (new — subprocess management)
- `packages/core/src/ingestion/index.ts` (new — exports)
- `packages/core/package.json` (add `./ingestion` export)
- `packages/core/src/__tests__/ingestion-service.test.ts` (new)

**`packages/core/src/ingestion/sidecar.ts`** (new):

```typescript
import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { exec } from "node:child_process";

const execAsync = promisify(exec);

export interface SidecarParseResult {
  schema_version: "1";
  document: {
    title: string | null;
    page_count: number | null;
    chunks: Array<{
      chunk_index: number;
      text: string;
      page: number | null;
      section: string | null;
      block_type: string;
    }>;
  };
}

export interface SidecarErrorResult {
  schema_version: "1";
  error: { code: string; message: string; traceback?: string };
}

/**
 * Spawn the praxis-cli subprocess to parse a file. Resolves with the parsed
 * JSON. Throws if the subprocess exits non-zero or output is malformed.
 *
 * NOTE: this is a long-running call (Marker may take 1-5 minutes for a
 * textbook). Caller should run it as part of an async iterable that
 * surfaces "parsing..." progress UI.
 */
export async function runSidecarIngest(filePath: string, opts: { signal?: AbortSignal } = {}): Promise<SidecarParseResult> {
  const child = spawn("praxis-cli", ["ingest", filePath], {
    stdio: ["ignore", "pipe", "pipe"],
    ...(opts.signal !== undefined && { signal: opts.signal }),
  });

  let stdoutBuf = "";
  let stderrBuf = "";
  child.stdout?.on("data", (chunk: Buffer) => { stdoutBuf += chunk.toString("utf-8"); });
  child.stderr?.on("data", (chunk: Buffer) => { stderrBuf += chunk.toString("utf-8"); });

  const exitCode: number = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    // Try to parse the structured error from stderr; fall back to raw stderr text.
    const lastLine = stderrBuf.trim().split("\n").pop() ?? "";
    let parsed: SidecarErrorResult | null = null;
    try {
      const candidate = JSON.parse(lastLine) as SidecarErrorResult;
      if (candidate.schema_version === "1" && candidate.error) parsed = candidate;
    } catch {
      /* ignore */
    }
    if (parsed) {
      throw new SidecarError(parsed.error.code, parsed.error.message, parsed.error.traceback);
    }
    throw new SidecarError("ingest.exit_nonzero", `praxis-cli exited with code ${exitCode}`, stderrBuf);
  }

  const lastStdoutLine = stdoutBuf.trim().split("\n").pop() ?? "";
  try {
    return JSON.parse(lastStdoutLine) as SidecarParseResult;
  } catch (cause) {
    throw new SidecarError(
      "ingest.invalid_output",
      `praxis-cli produced unparseable output: ${lastStdoutLine.slice(0, 200)}`,
      cause instanceof Error ? cause.message : String(cause),
    );
  }
}

export class SidecarError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "SidecarError";
  }
}

/** Check whether `praxis-cli` is on PATH. Returns false on any error. */
export async function isPraxisCliAvailable(): Promise<boolean> {
  try {
    await execAsync(process.platform === "win32" ? "where praxis-cli" : "which praxis-cli");
    return true;
  } catch {
    return false;
  }
}

/** Install hint shown in UI when isPraxisCliAvailable() returns false. */
export const PRAXIS_CLI_INSTALL_HINT =
  "Install: `uv tool install praxis-cli` (or `pipx install praxis-cli`). Requires Python 3.10+.";
```

**`packages/core/src/ingestion/service.ts`** (new):

```typescript
import { v7 as uuidv7 } from "uuid";
import { documentChunks, documents } from "@praxis/artifacts/schema";
import type { PraxisDb } from "../db/index.js";
import type { EmbeddingService, IngestionEvent, IngestionRequest, Logger, VectorStore } from "../types/index.js";
import { runSidecarIngest, SidecarError } from "./sidecar.js";

export interface IngestionServiceDeps {
  db: PraxisDb;
  log: Logger;
  vectorStore: VectorStore;
  embeddings: EmbeddingService;
}

const EMBED_BATCH_SIZE = 32;

export class IngestionService {
  constructor(private readonly deps: IngestionServiceDeps) {}

  async *ingest(req: IngestionRequest, signal?: AbortSignal): AsyncIterable<IngestionEvent> {
    const documentId = uuidv7();
    yield { type: "start", documentId, filename: req.filename };

    // Phase 1: parse via subprocess (slow — show indeterminate progress).
    yield { type: "parsing", message: `Parsing ${req.filename}...` };
    let parsed: Awaited<ReturnType<typeof runSidecarIngest>>;
    try {
      parsed = await runSidecarIngest(req.filePath, { ...(signal !== undefined && { signal }) });
    } catch (cause) {
      const code = cause instanceof SidecarError ? cause.code : "ingest.subprocess_failed";
      const message = cause instanceof Error ? cause.message : String(cause);
      yield { type: "error", error: { code, message, recoverable: false } };
      return;
    }

    const chunks = parsed.document.chunks;
    yield { type: "parsed", chunkCount: chunks.length };

    // Phase 2: persist document + chunks; embed in batches.
    const ingestedAt = new Date();
    this.deps.db.insert(documents)
      .values({
        id: documentId,
        studentId: req.studentId,
        filename: req.filename,
        mimeType: req.mimeType,
        ingestedAt,
        manifestJson: { title: parsed.document.title, pageCount: parsed.document.page_count },
        chunkCount: chunks.length,
      })
      .run();

    const chunkRows = chunks.map((c) => ({
      id: uuidv7(),
      documentId,
      chunkIndex: c.chunk_index,
      text: c.text,
      locatorJson: { page: c.page, section: c.section, blockType: c.block_type },
    }));

    // Insert chunks in a single transaction
    if (chunkRows.length > 0) {
      this.deps.db.insert(documentChunks).values(chunkRows).run();
    }

    // Embed in batches; stream progress
    let processed = 0;
    for (let start = 0; start < chunks.length; start += EMBED_BATCH_SIZE) {
      if (signal?.aborted) {
        yield { type: "error", error: { code: "ingest.cancelled", message: "Cancelled by user", recoverable: false } };
        return;
      }
      const batch = chunks.slice(start, start + EMBED_BATCH_SIZE);
      const texts = batch.map((c) => c.text);
      const vectors = await this.deps.embeddings.embedBatch(texts);
      const upserts = batch.map((c, i) => {
        const row = chunkRows[start + i];
        if (!row) throw new Error(`chunk row index out of range: ${start + i}`);
        const vec = vectors[i];
        if (!vec) throw new Error(`embedding missing for chunk ${start + i}`);
        return {
          chunkId: row.id,
          documentId,
          embedding: vec,
          chunkText: c.text,
          ...(c.page !== null && { page: c.page }),
          ...(c.section !== null && { section: c.section }),
        };
      });
      await this.deps.vectorStore.upsertBatch(upserts);
      processed += batch.length;
      yield { type: "embedding", chunksProcessed: processed, totalChunks: chunks.length };
    }

    yield { type: "done", documentId, chunkCount: chunks.length };
  }
}
```

**`packages/core/src/ingestion/index.ts`**:

```typescript
export { IngestionService, type IngestionServiceDeps } from "./service.js";
export { runSidecarIngest, isPraxisCliAvailable, PRAXIS_CLI_INSTALL_HINT, SidecarError } from "./sidecar.js";
```

**Implementation Notes**:
- Subprocess is run via `child_process.spawn` with the abort signal threaded through — Node 18+ supports `AbortSignal` on spawn natively.
- Stdout is collected in full because Marker emits one big JSON; we don't try to parse incrementally.
- Cancellation between batches uses `signal?.aborted` checks. Once Marker is running we can't easily mid-flight cancel it (it's CPU-bound in the subprocess), but the embedding loop checks per batch.
- Episodic ordering doesn't apply here — IngestionEvent is its own stream, not engine events.
- `EMBED_BATCH_SIZE = 32` is a tradeoff: larger batches = fewer pipeline calls, but more memory; HF transformers handles batching internally.

**Acceptance Criteria**:
- [ ] `IngestionService.ingest(req)` yields events in order: `start` → `parsing` → `parsed` → `embedding` (multiple) → `done`.
- [ ] On parse failure (sidecar error), yields `error` and stops; no partial document row inserted... actually, this requires careful ordering: the document row should be inserted only AFTER successful parsing. The current design inserts after parsing succeeds — verify in tests.
- [ ] `documents` table has the new row after success; `document_chunks` has N rows; `document_embeddings` has N vectors.
- [ ] Cancellation via AbortSignal stops the embedding loop between batches.
- [ ] Tests with mocked `runSidecarIngest` (return canned parse results) and mocked `EmbeddingService` (return canned vectors) verify the event sequence.

---

### Unit 6: `retrieve_from_textbook` tool

**Files**:
- `packages/tools/src/retrieval/retrieve-from-textbook.ts` (new)
- `packages/tools/src/retrieval/index.ts` (new — re-export)
- `packages/tools/package.json` (add `./retrieval` subpath export)
- `packages/tools/src/retrieval/__tests__/retrieve-from-textbook.test.ts` (new)

```typescript
import { eq, inArray } from "drizzle-orm";
import { documents } from "@praxis/artifacts/schema";
import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

export const retrieveFromTextbookInput = z.object({
  query: z.string().min(1).describe(
    "A natural-language question or topic to search the student's textbooks for.",
  ),
  topK: z.number().int().min(1).max(20).default(5).describe(
    "How many chunks to return. Default 5; rarely need more than 10.",
  ),
  documentIds: z.array(z.string()).optional().describe(
    "Restrict search to specific document IDs. Default: search all of the student's documents.",
  ),
});

export const retrieveFromTextbookOutput = z.object({
  query: z.string(),
  citations: z.array(
    z.object({
      index: z.number().int(),
      documentId: z.string(),
      documentTitle: z.string(),
      chunkId: z.string(),
      chunkText: z.string(),
      page: z.number().int().optional(),
      section: z.string().optional(),
      distance: z.number(),
    }),
  ),
});

export const retrieveFromTextbookTool: ToolDefinition<
  typeof retrieveFromTextbookInput,
  typeof retrieveFromTextbookOutput
> = {
  name: "retrieve_from_textbook",
  description: `Search the student's uploaded textbooks for relevant passages and return ranked citations.

Use this for ANY claim that should be grounded in the student's course material — definitions, examples, derivations, formulas, historical facts, etc. Always cite from this tool when the student asks "what does the textbook say about X" or similar.

In your response, refer to citations as [1], [2], etc. matching the order they appear in the result. The student's UI will render these as clickable chips that show the source chunk.

If the citations don't actually answer the question, say so explicitly — don't invent connections. Recommend the student upload more material if relevant.`,
  input: retrieveFromTextbookInput,
  output: retrieveFromTextbookOutput,
  tier: "grounded",
  effects: ["external.code-exec"], // embedding inference
  async handler(args, ctx: ToolContext) {
    const embeddings = ctx.services.embeddings;
    const vectorStore = ctx.services.vectorStore;
    const queryVec = await embeddings.embed(args.query);

    const results = await vectorStore.search({
      embedding: queryVec,
      topK: args.topK,
      ...(args.documentIds !== undefined && { documentIds: args.documentIds }),
    });

    if (results.length === 0) {
      return { query: args.query, citations: [] };
    }

    // Hydrate document titles from the documents table — sqlite-vec stores
    // the document_id but not the human-readable title.
    const distinctDocIds = [...new Set(results.map((r) => r.documentId))];
    // ctx provides db indirectly via... wait — ctx doesn't include a db handle.
    // We need access to the documents table. Two options:
    //  (a) pass `db` through ToolServices (new field).
    //  (b) cache title alongside document_id in the vec0 auxiliary column.
    // Going with (a) — cleaner and forward-compatible; see Unit 1 update.
    const dbAccessor = (ctx.services as unknown as { db?: { /* PraxisDb */ } }).db;
    // For Phase 5, we expand ToolServices to include a `db` accessor.
    // (See Unit 1 amendment below.)
    throw new Error("UNIT 6 STUB — SEE UNIT 1 AMENDMENT BELOW");
  },
};
```

> **Amendment to Unit 1**: add `db: DocumentsReadonly` (a narrow read-only interface) to `ToolServices`, OR expose document title lookup via a small `DocumentsReader` interface added to `ToolServices`. Cleaner option: add a tiny `DocumentsReader` interface focused on the read needs of tools.

**Revised Unit 1 addition** — append to `packages/core/src/types/tool.ts`:

```typescript
export interface DocumentsReader {
  /** Read the document title for a set of IDs. Returns a Map keyed by document_id. */
  titlesByIds(ids: ReadonlyArray<string>): Promise<Map<string, string>>;
}

export interface ToolServices {
  // ... existing ...
  documents: DocumentsReader;        // ← Phase 5 NEW field
}
```

**Revised handler** for Unit 6:

```typescript
async handler(args, ctx: ToolContext) {
  const queryVec = await ctx.services.embeddings.embed(args.query);
  const results = await ctx.services.vectorStore.search({
    embedding: queryVec,
    topK: args.topK,
    ...(args.documentIds !== undefined && { documentIds: args.documentIds }),
  });
  if (results.length === 0) return { query: args.query, citations: [] };

  const docIds = [...new Set(results.map((r) => r.documentId))];
  const titles = await ctx.services.documents.titlesByIds(docIds);

  return {
    query: args.query,
    citations: results.map((r, i) => ({
      index: i + 1,
      documentId: r.documentId,
      documentTitle: titles.get(r.documentId) ?? "(unknown)",
      chunkId: r.chunkId,
      chunkText: r.chunkText,
      ...(r.page !== undefined && { page: r.page }),
      ...(r.section !== undefined && { section: r.section }),
      distance: r.distance,
    })),
  };
}
```

**Implementation Notes**:
- Citation indices are 1-based for human readability (`[1]`, `[2]`, ...).
- The tool description explicitly teaches the agent the citation convention. The teach mode's tools fragment will reinforce it.
- `tier: "grounded"` per the verification principle — retrieval is the second tier of authority.
- The agent receives a structured array; the UI parses both the `tool_result` event (for citation cards) and the assistant text (for inline chips).

**Acceptance Criteria**:
- [ ] `retrieveFromTextbookTool.handler({ query: "..." }, ctx)` calls `ctx.services.embeddings.embed`, `ctx.services.vectorStore.search`, and `ctx.services.documents.titlesByIds` in that order.
- [ ] Returned citations have 1-based indices in the order returned by vector search.
- [ ] Empty search returns `{ query, citations: [] }` (not an error).
- [ ] Optional `page`/`section` fields are omitted when undefined.
- [ ] Zod input validation rejects empty `query` and `topK > 20`.

---

### Unit 7: `DocumentsService` + `DocumentsReader` impl

**Files**:
- `packages/core/src/services/documents-service.ts` (new — implements `DocumentsClient` server-side)
- `packages/core/src/services/documents-reader-impl.ts` (new — implements `DocumentsReader`)
- `packages/core/src/services/index.ts` (re-export)

**`packages/core/src/services/documents-reader-impl.ts`** (new):

```typescript
import { inArray } from "drizzle-orm";
import { documents } from "@praxis/artifacts/schema";
import type { DocumentsReader } from "../types/tool.js";
import type { PraxisDb } from "../db/index.js";

export class DrizzleDocumentsReader implements DocumentsReader {
  constructor(private readonly db: PraxisDb) {}

  async titlesByIds(ids: ReadonlyArray<string>): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = this.db.select({
      id: documents.id,
      filename: documents.filename,
      manifestJson: documents.manifestJson,
    }).from(documents).where(inArray(documents.id, [...ids])).all();
    const out = new Map<string, string>();
    for (const row of rows) {
      const manifest = row.manifestJson as { title?: string | null } | null;
      out.set(row.id, manifest?.title ?? row.filename);
    }
    return out;
  }
}
```

**`packages/core/src/services/documents-service.ts`** (new):

```typescript
import { desc, eq } from "drizzle-orm";
import { documents } from "@praxis/artifacts/schema";
import type { DocumentsClient, DocumentSummary, VectorStore } from "../types/index.js";
import type { ServiceDeps } from "./types.js";

export class DocumentsServiceImpl implements DocumentsClient {
  constructor(private readonly deps: ServiceDeps & { vectorStore: VectorStore }) {}

  async list(): Promise<DocumentSummary[]> {
    const studentId = this.requireStudent();
    const rows = this.deps.db
      .select()
      .from(documents)
      .where(eq(documents.studentId, studentId))
      .orderBy(desc(documents.ingestedAt))
      .all();
    return rows.map((r) => {
      const manifest = r.manifestJson as { title?: string | null } | null;
      return {
        id: r.id,
        filename: r.filename,
        mimeType: r.mimeType,
        ingestedAt: r.ingestedAt.getTime(),
        chunkCount: r.chunkCount,
        title: manifest?.title ?? r.filename,
      };
    });
  }

  async delete(documentId: string): Promise<void> {
    // Cascade delete: vectors first, then chunks (FK cascade), then document.
    await this.deps.vectorStore.deleteByDocumentId(documentId);
    this.deps.db.delete(documents).where(eq(documents.id, documentId)).run();
  }

  private requireStudent(): string {
    // Phase 5: reuse the default-student singleton from Phase 3.
    const { getOrCreateDefaultStudentId } = require("./student.js") as typeof import("./student.js");
    return getOrCreateDefaultStudentId(this.deps.db);
  }
}
```

**Implementation Notes**:
- `delete` first removes vectors (sqlite-vec virtual table is independent of FK cascade), then the document row (which cascades to `document_chunks` via FK).
- `documents.delete` in `ServiceDeps` uses synchronous `require("./student.js")` because we're inside an async method and want to avoid a circular import at top-level. A future refinement: pass `studentId` resolver via `ServiceDeps`.
- `list()` uses `ingestedAt DESC` so newest documents appear first.

**Acceptance Criteria**:
- [ ] `documentsService.list()` returns `DocumentSummary[]` ordered newest-first.
- [ ] `title` falls back to `filename` when manifest has no title.
- [ ] `documentsService.delete(id)` removes vectors + document row + cascades chunks.
- [ ] After delete, `list()` no longer includes the deleted doc.

---

### Unit 8: ServiceDeps + buildServices wiring

**Files**:
- `packages/core/src/services/types.ts` (modified)
- `packages/core/src/services/session-service.ts` (modified — populate new ToolServices fields)
- `packages/desktop/electron/main/services.ts` (modified)

**`packages/core/src/services/types.ts`** modifications:

```typescript
import type { DocumentsReader, EmbeddingService, VectorStore, ... } from "../types/index.js";

export interface ServiceDeps {
  db: PraxisDb;
  log: Logger;
  modes: ReadonlyMap<string, Mode>;
  toolDefinitions: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
  toolServices: {
    sympy: SymPyService;
    sandbox: CodeSandbox;
    vectorStore: VectorStore;        // ← Phase 5
    embeddings: EmbeddingService;    // ← Phase 5
    documents: DocumentsReader;      // ← Phase 5
  };
  engineFactory?: (config: EngineConfig, deps: { log: Logger }) => Engine;
}
```

**`SessionServiceImpl.openActive`** populates the new fields:

```typescript
const toolContext: ToolContext = {
  studentId: args.studentId as ToolContext["studentId"],
  sessionId: args.sessionId as ToolContext["sessionId"],
  services: {
    memory: null,
    artifacts: null,
    vectorStore: this.deps.toolServices.vectorStore,   // ← Phase 5
    sandbox: this.deps.toolServices.sandbox,
    sympy: this.deps.toolServices.sympy,
    embeddings: this.deps.toolServices.embeddings,     // ← Phase 5
    documents: this.deps.toolServices.documents,       // ← Phase 5
    pedagogyPack: null,
  },
  log: this.deps.log,
};
```

**`packages/desktop/electron/main/services.ts`** rewritten section:

```typescript
import { openDb } from "@praxis/core/db";
import { IngestionService } from "@praxis/core/ingestion";
import { ConfigServiceImpl, SessionServiceImpl, DrizzleDocumentsReader, DocumentsServiceImpl } from "@praxis/core/services";
import { teachMode } from "@praxis/curriculum/modes";
import { codeSandboxTool, gradeMathTool, retrieveFromTextbookTool, ... } from "@praxis/tools";
import { LocalCodeSandbox, LocalEmbeddingService, PyodideHost, PyodideSymPyService, SqliteVecStore, ... } from "@praxis/tools/runtime";

export interface Services {
  session: SessionServiceImpl;
  config: ConfigServiceImpl;
  ingestion: IngestionService;
  documents: DocumentsServiceImpl;
  pyodide: PyodideHost;
  embeddings: LocalEmbeddingService;
}

export function buildServices(dbPath: string): Services {
  const { db } = openDb({ path: dbPath });  // ← initVectorStore runs inside openDb
  const sqlite = (db as unknown as { $client: import("better-sqlite3").Database }).$client;

  const log = consoleLogger();

  // Pyodide (Phase 4)
  const pyodide = new PyodideHost({ packages: ["sympy"] });
  const sympy = new PyodideSymPyService(pyodide);
  const sandbox = new LocalCodeSandbox(new IsolatedVmHost(), pyodide);

  // Phase 5: vectors + embeddings
  const vectorStore = new SqliteVecStore(sqlite);
  const embeddings = new LocalEmbeddingService();
  const documentsReader = new DrizzleDocumentsReader(db);

  const modes = new Map([[teachMode.id, teachMode]]);
  const toolDefinitions = [gradeMathTool, codeSandboxTool, retrieveFromTextbookTool];

  const deps: ServiceDeps = {
    db,
    log,
    modes,
    toolDefinitions,
    toolServices: { sympy, sandbox, vectorStore, embeddings, documents: documentsReader },
  };

  const ingestion = new IngestionService({ db, log, vectorStore, embeddings });
  const documentsService = new DocumentsServiceImpl({ ...deps, vectorStore });

  return {
    session: new SessionServiceImpl(deps),
    config: new ConfigServiceImpl(deps),
    ingestion,
    documents: documentsService,
    pyodide,
    embeddings,
  };
}
```

**Desktop main** (`packages/desktop/electron/main/index.ts`) preload additions:

```typescript
app.whenReady().then(async () => {
  // ... existing setup ...
  services.pyodide.preload().catch((err) => log.warn("pyodide preload failed", err));
  services.embeddings.preload().catch((err) => log.warn("embeddings preload failed", err));
  // ...
});
```

**Acceptance Criteria**:
- [ ] `buildServices(dbPath)` constructs all Phase 5 services without error.
- [ ] `services.embeddings.preload()` runs without blocking app startup.
- [ ] `ToolContext.services.vectorStore`, `.embeddings`, `.documents` are populated for every session's tools.
- [ ] All Phase 1-4 tests pass with the new ServiceDeps shape (after updating `toolServices` literals in tests).

---

### Unit 9: IPC server + client additions

**Files**:
- `packages/desktop/electron/main/ipc-server.ts` (modified — add ingest + documents channels)
- `packages/desktop/electron/main/ingest-channel.ts` (new — file picker + stream wiring)
- `packages/client/src/services/ingest-client.ts` (new)
- `packages/client/src/services/documents-client.ts` (new)
- `packages/client/src/client.ts` (modified — wire new clients)
- `packages/client/src/index.ts` (re-export)

**`packages/desktop/electron/main/ingest-channel.ts`** (new):

```typescript
import { dialog, ipcMain, type BrowserWindow } from "electron";
import { isPraxisCliAvailable, PRAXIS_CLI_INSTALL_HINT } from "@praxis/core/ingestion";
import type { IngestionEvent } from "@praxis/core/types";
import type { Services } from "./services.js";

export function registerIngestHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
): () => void {
  const teardowns: Array<() => void> = [];

  ipcMain.handle("praxis.ingest.pickFile", async () => {
    const window = webContentsGetter()?.hostWebContents ? null : null;  // simplified
    const result = await dialog.showOpenDialog({
      title: "Add document",
      filters: [{ name: "PDF", extensions: ["pdf"] }],
      properties: ["openFile"],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    if (!filePath) return null;
    return {
      filePath,
      filename: filePath.split(/[\\/]/).pop() ?? filePath,
      mimeType: "application/pdf",
    };
  });

  ipcMain.handle("praxis.ingest.isAvailable", async () => {
    const available = await isPraxisCliAvailable();
    return available ? { available: true } : { available: false, installHint: PRAXIS_CLI_INSTALL_HINT };
  });

  // Streamed: praxis.ingest.start (invoke with streamId + req)
  const activeAborts = new Map<string, AbortController>();
  ipcMain.handle("praxis.ingest.start", async (_e, payload: { streamId: string; req: { filePath: string; filename: string; mimeType: string } }) => {
    const eventsChannel = `praxis.ingest.events.${payload.streamId}`;
    const ctrl = new AbortController();
    activeAborts.set(payload.streamId, ctrl);

    void (async () => {
      try {
        const studentId = require("@praxis/core/services").getOrCreateDefaultStudentId(/* db */) as string;
        // (In real impl, pass `db` through; abbreviated here for brevity)
        for await (const event of services.ingestion.ingest({ ...payload.req, studentId }, ctrl.signal)) {
          if (ctrl.signal.aborted) break;
          webContentsGetter()?.send(eventsChannel, { kind: "event", value: event });
        }
        webContentsGetter()?.send(eventsChannel, { kind: "done" });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        webContentsGetter()?.send(eventsChannel, { kind: "error", error: { code: "ingest.failed", message } });
      } finally {
        activeAborts.delete(payload.streamId);
      }
    })();
  });

  ipcMain.on("praxis.ingest.cancel", (_e, streamId: string) => {
    activeAborts.get(streamId)?.abort();
    activeAborts.delete(streamId);
  });

  // Documents
  ipcMain.handle("praxis.documents.list", async () => services.documents.list());
  ipcMain.handle("praxis.documents.delete", async (_e, documentId: string) => services.documents.delete(documentId));

  teardowns.push(() => {
    for (const channel of [
      "praxis.ingest.pickFile", "praxis.ingest.isAvailable", "praxis.ingest.start",
      "praxis.documents.list", "praxis.documents.delete",
    ]) {
      ipcMain.removeHandler(channel);
    }
    for (const ctrl of activeAborts.values()) ctrl.abort();
  });
  return () => { for (const t of teardowns) t(); };
}
```

**`packages/client/src/services/ingest-client.ts`** (new):

```typescript
import type { IngestionClient, IngestionEvent } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = {
  pickFile: "praxis.ingest.pickFile",
  isAvailable: "praxis.ingest.isAvailable",
  start: "praxis.ingest.start",  // streamed: .start / .events.<id> / .cancel
} as const;

export function createIngestClient(transport: ClientTransport): IngestionClient {
  return {
    pickFile: () => transport.invoke<{ filePath: string; filename: string; mimeType: string } | null>(C.pickFile),
    isAvailable: () => transport.invoke<{ available: boolean; installHint?: string }>(C.isAvailable),
    start: (req) => transport.stream<IngestionEvent>(C.start, { req }),
  };
}
```

**`packages/client/src/services/documents-client.ts`** (new):

```typescript
import type { DocumentsClient, DocumentSummary } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = {
  list: "praxis.documents.list",
  delete: "praxis.documents.delete",
} as const;

export function createDocumentsClient(transport: ClientTransport): DocumentsClient {
  return {
    list: () => transport.invoke<DocumentSummary[]>(C.list),
    delete: (id) => transport.invoke<void>(C.delete, id),
  };
}
```

**`packages/client/src/client.ts`** modifications:

```typescript
export function createPraxisClient(transport: ClientTransport): PraxisClient {
  return {
    session: createSessionClient(transport),
    config: createConfigClient(transport),
    artifacts: createArtifactsClient(transport),
    author: createAuthoringClient(transport),
    memory: createMemoryClient(transport),
    ingest: createIngestClient(transport),       // ← NEW
    documents: createDocumentsClient(transport), // ← NEW
  };
}
```

**Acceptance Criteria**:
- [ ] `client.ingest.pickFile()` opens the native file picker; returns null on cancel.
- [ ] `client.ingest.isAvailable()` returns `{ available: false, installHint }` when `praxis-cli` is not on PATH.
- [ ] `client.ingest.start(req)` returns an AsyncIterable that yields IngestionEvents in order.
- [ ] `client.documents.list()` returns documents for the default student.
- [ ] `client.documents.delete(id)` removes the document.
- [ ] IPC handlers register/unregister cleanly (test via `ipc-server.test.ts` extension).

---

### Unit 10: UI — file picker, progress modal, document list

**Files**:
- `packages/ui/src/routes/chat.tsx` (modified — add document panel)
- `packages/ui/src/components/document-list.tsx` (new) + `.module.css`
- `packages/ui/src/components/add-document-button.tsx` (new) + `.module.css`
- `packages/ui/src/components/ingestion-progress.tsx` (new) + `.module.css`
- `packages/ui/src/hooks/use-documents.ts` (new)
- `packages/ui/src/hooks/use-ingestion.ts` (new)

**`packages/ui/src/hooks/use-ingestion.ts`** (new):

```typescript
import { useCallback, useState } from "react";
import type { IngestionEvent } from "@praxis/core/types";
import { usePraxisClient } from "../context/client-context.js";

export interface UseIngestionResult {
  state: "idle" | "checking" | "picking" | "ingesting" | "done" | "error";
  message: string;
  progress?: { processed: number; total: number };
  start: () => Promise<void>;
  reset: () => void;
}

export function useIngestion(onComplete: () => void): UseIngestionResult {
  const client = usePraxisClient();
  const [state, setState] = useState<UseIngestionResult["state"]>("idle");
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<{ processed: number; total: number } | undefined>(undefined);

  const start = useCallback(async () => {
    setState("checking");
    setMessage("Checking sidecar...");
    const avail = await client.ingest.isAvailable();
    if (!avail.available) {
      setState("error");
      setMessage(avail.installHint ?? "praxis-cli is not installed.");
      return;
    }
    setState("picking");
    setMessage("Pick a file...");
    const file = await client.ingest.pickFile();
    if (!file) {
      setState("idle");
      setMessage("");
      return;
    }
    setState("ingesting");
    setMessage(`Starting ingest of ${file.filename}...`);
    setProgress(undefined);
    try {
      for await (const event of client.ingest.start(file)) {
        applyEvent(event, { setMessage, setProgress });
        if (event.type === "done") {
          setState("done");
          onComplete();
        } else if (event.type === "error") {
          setState("error");
          setMessage(`${event.error.code}: ${event.error.message}`);
        }
      }
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : String(err));
    }
  }, [client, onComplete]);

  const reset = useCallback(() => {
    setState("idle");
    setMessage("");
    setProgress(undefined);
  }, []);

  return { state, message, ...(progress !== undefined && { progress }), start, reset };
}

function applyEvent(
  event: IngestionEvent,
  setters: { setMessage: (s: string) => void; setProgress: (p: { processed: number; total: number } | undefined) => void },
): void {
  switch (event.type) {
    case "start": setters.setMessage(`Ingesting ${event.filename}...`); break;
    case "parsing": setters.setMessage(event.message); break;
    case "parsed": setters.setMessage(`Parsed: ${event.chunkCount} chunks`); break;
    case "embedding":
      setters.setMessage(`Embedding chunks...`);
      setters.setProgress({ processed: event.chunksProcessed, total: event.totalChunks });
      break;
    case "done": setters.setMessage(`Done! ${event.chunkCount} chunks indexed.`); break;
    case "error": setters.setMessage(`${event.error.code}: ${event.error.message}`); break;
  }
}
```

**`packages/ui/src/components/ingestion-progress.tsx`** (new) — modal showing the progress:

```typescript
import styles from "./ingestion-progress.module.css";

export function IngestionProgress(props: {
  state: "idle" | "checking" | "picking" | "ingesting" | "done" | "error";
  message: string;
  progress?: { processed: number; total: number };
  onClose: () => void;
}) {
  if (props.state === "idle" || props.state === "picking") return null;
  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <h2>{props.state === "error" ? "Ingestion failed" : props.state === "done" ? "Done" : "Adding document..."}</h2>
        <p className={styles.message}>{props.message}</p>
        {props.progress && (
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${(props.progress.processed / props.progress.total) * 100}%` }} />
            <span className={styles.progressLabel}>{props.progress.processed} / {props.progress.total}</span>
          </div>
        )}
        {(props.state === "done" || props.state === "error") && (
          <button type="button" onClick={props.onClose}>Close</button>
        )}
      </div>
    </div>
  );
}
```

**`packages/ui/src/components/add-document-button.tsx`** (new):

```typescript
import { useIngestion } from "../hooks/use-ingestion.js";
import { IngestionProgress } from "./ingestion-progress.js";
import styles from "./add-document-button.module.css";

export function AddDocumentButton(props: { onComplete: () => void }) {
  const ingestion = useIngestion(props.onComplete);
  return (
    <>
      <button
        type="button"
        className={styles.btn}
        onClick={() => void ingestion.start()}
        disabled={ingestion.state === "ingesting" || ingestion.state === "checking"}
      >
        + Add document
      </button>
      <IngestionProgress
        state={ingestion.state}
        message={ingestion.message}
        {...(ingestion.progress !== undefined && { progress: ingestion.progress })}
        onClose={ingestion.reset}
      />
    </>
  );
}
```

**`packages/ui/src/components/document-list.tsx`** (new):

```typescript
import { useDocuments } from "../hooks/use-documents.js";
import styles from "./document-list.module.css";

export function DocumentList() {
  const { documents, refresh, deleteDoc } = useDocuments();
  return (
    <div className={styles.list}>
      <header>
        <h3>Documents</h3>
        <button type="button" onClick={refresh}>↻</button>
      </header>
      {documents.length === 0 && <p className={styles.empty}>No documents yet. Add one to get started.</p>}
      <ul>
        {documents.map((doc) => (
          <li key={doc.id} className={styles.item}>
            <div className={styles.title}>{doc.title}</div>
            <div className={styles.meta}>{doc.chunkCount} chunks · {new Date(doc.ingestedAt).toLocaleDateString()}</div>
            <button type="button" className={styles.deleteBtn} onClick={() => void deleteDoc(doc.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

**`packages/ui/src/hooks/use-documents.ts`** (new):

```typescript
import { useCallback, useEffect, useState } from "react";
import type { DocumentSummary } from "@praxis/core/types";
import { usePraxisClient } from "../context/client-context.js";

export function useDocuments() {
  const client = usePraxisClient();
  const [documents, setDocuments] = useState<DocumentSummary[]>([]);
  const refresh = useCallback(async () => {
    setDocuments(await client.documents.list());
  }, [client]);
  const deleteDoc = useCallback(async (id: string) => {
    await client.documents.delete(id);
    await refresh();
  }, [client, refresh]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { documents, refresh, deleteDoc };
}
```

**`packages/ui/src/routes/chat.tsx`** modifications:

```typescript
// ChatRoute layout grows: [DocumentList sidebar] [Chat main]
return (
  <div className={styles.chatRoot}>
    <aside className={styles.sidebar}>
      <AddDocumentButton onComplete={() => void documentsRef.current?.refresh()} />
      <DocumentList ref={documentsRef} />
    </aside>
    <div className={styles.main}>
      {/* existing chat header + messages + composer */}
    </div>
  </div>
);
```

**Acceptance Criteria**:
- [ ] Add document button is disabled while ingesting.
- [ ] Ingestion progress modal shows parsing message, then embedding progress bar.
- [ ] On error, modal shows error message + Close button.
- [ ] Document list refreshes after successful ingestion.
- [ ] Document delete confirms (browser `confirm()`) and removes from list.
- [ ] Component tests with mocked client cover happy path + error path + cancel.

---

### Unit 11: UI — citation chips + source cards in chat

**Files**:
- `packages/ui/src/components/citation-chip.tsx` (new) + `.module.css`
- `packages/ui/src/components/source-card.tsx` (new) + `.module.css`
- `packages/ui/src/components/message.tsx` (modified — parse citations from text)
- `packages/ui/src/hooks/use-streamed-send.ts` (modified — accumulate citations from tool_result)

**`packages/ui/src/hooks/use-streamed-send.ts`** modifications:

```typescript
export interface ChatBubble {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming: boolean;
  /** Citations from any retrieve_from_textbook tool calls in this turn. */
  citations: Citation[];
}

// Inside the for-await:
for await (const event of client.session.send(sessionId, message)) {
  if (event.type === "user_message") continue;
  if (event.type === "tool_result") {
    // If this is a retrieve_from_textbook result, harvest citations.
    if (event.result.ok) {
      const value = event.result.value as { citations?: Citation[] } | undefined;
      if (Array.isArray(value?.citations)) {
        setBubbles((bs) => bs.map((b) =>
          b.id === assistantId ? { ...b, citations: [...b.citations, ...value.citations] } : b,
        ));
      }
    }
    continue;
  }
  // ... existing model_message / error handling
}
```

**`packages/ui/src/components/message.tsx`** modifications:

```typescript
import { CitationChip } from "./citation-chip.js";
import { SourceCard } from "./source-card.js";
import type { Citation } from "@praxis/core/types";

export function Message(props: { role: "user" | "assistant"; content: string; streaming: boolean; citations: Citation[] }) {
  const cls = props.role === "user" ? styles.user : styles.assistant;
  return (
    <div className={`${styles.bubble} ${cls}`} data-role={props.role}>
      <span className={styles.content}>{renderWithCitations(props.content, props.citations)}</span>
      {props.streaming && <span className={styles.cursor}>▋</span>}
      {props.citations.length > 0 && (
        <div className={styles.sources}>
          {props.citations.map((c) => (
            <SourceCard key={c.chunkId} citation={c} />
          ))}
        </div>
      )}
    </div>
  );
}

const CITATION_RE = /\[(\d+)\]/g;

function renderWithCitations(text: string, citations: Citation[]): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  CITATION_RE.lastIndex = 0;
  while ((match = CITATION_RE.exec(text)) !== null) {
    if (match.index > lastIndex) out.push(text.slice(lastIndex, match.index));
    const num = Number.parseInt(match[1] ?? "0", 10);
    const citation = citations.find((c) => c.index === num);
    if (citation) {
      out.push(<CitationChip key={`cit-${match.index}`} citation={citation} />);
    } else {
      out.push(match[0]);  // pass through if no matching citation
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) out.push(text.slice(lastIndex));
  return out;
}
```

**`packages/ui/src/components/citation-chip.tsx`** (new):

```typescript
import type { Citation } from "@praxis/core/types";
import styles from "./citation-chip.module.css";

export function CitationChip(props: { citation: Citation }) {
  const onClick = () => {
    const target = document.getElementById(`source-${props.citation.chunkId}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "nearest" });
      target.classList.add(styles.highlight);
      setTimeout(() => target.classList.remove(styles.highlight), 1200);
    }
  };
  return (
    <button type="button" className={styles.chip} onClick={onClick} title={props.citation.documentTitle}>
      [{props.citation.index}]
    </button>
  );
}
```

**`packages/ui/src/components/source-card.tsx`** (new):

```typescript
import { useState } from "react";
import type { Citation } from "@praxis/core/types";
import styles from "./source-card.module.css";

export function SourceCard(props: { citation: Citation }) {
  const [expanded, setExpanded] = useState(false);
  const c = props.citation;
  const preview = c.chunkText.length > 200 ? `${c.chunkText.slice(0, 200)}…` : c.chunkText;
  return (
    <div id={`source-${c.chunkId}`} className={styles.card}>
      <div className={styles.header}>
        <span className={styles.index}>[{c.index}]</span>
        <span className={styles.title}>{c.documentTitle}</span>
        {c.section && <span className={styles.section}>· {c.section}</span>}
        {c.page !== undefined && <span className={styles.page}>· p.{c.page}</span>}
      </div>
      <div className={styles.body}>
        {expanded ? c.chunkText : preview}
        {c.chunkText.length > 200 && (
          <button type="button" className={styles.toggle} onClick={() => setExpanded((x) => !x)}>
            {expanded ? "less" : "more"}
          </button>
        )}
      </div>
    </div>
  );
}
```

**Acceptance Criteria**:
- [ ] Assistant text containing `[1]` renders the chip; clicking scrolls to the corresponding source card and briefly highlights it.
- [ ] `[N]` references with no matching citation render as plain text (no broken chip).
- [ ] Source cards show document title, section, page, and chunk text preview with "more" toggle.
- [ ] Multiple `tool_result` events in one turn accumulate citations on the same assistant bubble.
- [ ] Component tests cover citation parsing, chip click → scroll, expand/collapse.

---

### Unit 12: `teach` mode update — add `retrieve_from_textbook` + tools fragment update

**Files**:
- `packages/curriculum/src/modes/teach.ts` (modified — add tool name)
- `packages/curriculum/src/modes/fragments/tools.ts` (modified — describe new tool + citation convention)

**`packages/curriculum/src/modes/teach.ts`** updates:

```typescript
toolNames: ["grade_math", "code_sandbox", "retrieve_from_textbook"],   // ← added
```

**`packages/curriculum/src/modes/fragments/tools.ts`** updated template:

```typescript
export const toolsFragment: PromptFragment = {
  id: "tools.available",
  position: "tools",
  customizable: false,
  template: `Tools available:
- grade_math — symbolic math via sympy. Use for ANY arithmetic or algebra; never grade with your own arithmetic.
- code_sandbox — run JavaScript or Python in a sandbox. Use to demonstrate algorithms or verify multi-step computation.
- retrieve_from_textbook — search the student's uploaded textbooks for relevant passages. Use for ANY claim that should be grounded in their course material.

When you cite from retrieve_from_textbook results, refer to them as [1], [2], [3] in the order they appear in the result. The student's UI renders these as clickable chips that show the source chunk.

When you make a claim a tool can verify, call the tool. The student sees the tool call — visibility is part of the lesson.`,
};
```

**Acceptance Criteria**:
- [ ] `teachMode.toolNames` includes `"retrieve_from_textbook"`.
- [ ] Tools fragment includes citation convention text.
- [ ] Existing teach-mode tests pass after fragment update.

---

### Unit 13: Tests

| Test file | Type | What it tests |
|---|---|---|
| `packages/tools/src/runtime/__tests__/sqlite-vec-store.test.ts` | unit, fast | Real sqlite-vec (prebuilt). Upsert, batch upsert, search with/without doc filter, deleteByDocumentId, distance ordering. |
| `packages/tools/src/runtime/__tests__/embeddings.test.ts` | unit (mock) + slow (real) | Mock @huggingface/transformers for fast lane: lazy load, batch reshape, dimension contract. Real model gated by PRAXIS_RUN_SLOW_TESTS. |
| `packages/tools/src/retrieval/__tests__/retrieve-from-textbook.test.ts` | unit, fast | Mock embeddings + vectorStore + documents reader. Verify query embedding → search → title hydration → indexing. |
| `packages/core/src/__tests__/ingestion-service.test.ts` | unit, fast | Mock `runSidecarIngest` (return canned parse), mock embeddings/vectorStore. Verify event order: start → parsing → parsed → embedding(N) → done. Verify document/chunk rows persisted. |
| `packages/core/src/__tests__/ingestion-sidecar.test.ts` | unit, fast | Mock `child_process.spawn` (return canned subprocess emitting stdout/stderr). Verify exit-code handling, JSON parsing, error path. |
| `packages/core/src/__tests__/db-vector-init.test.ts` | unit, fast | After `openDb`, verify `document_embeddings` table exists; idempotent re-init. |
| `packages/desktop/src/__tests__/ipc-server.test.ts` (extended) | unit | New ingest + documents channels register; pickFile mock; stream lifecycle. |
| `packages/ui/src/__tests__/use-ingestion.test.tsx` | unit, fast | Mock client. Verify state transitions: idle → checking → picking → ingesting → done. |
| `packages/ui/src/__tests__/citation-chip.test.tsx` | unit, fast | Click chip → scrolls to source card (mocked scrollIntoView). |
| `packages/ui/src/__tests__/document-list.test.tsx` | unit, fast | Renders documents from mock client; delete refreshes list. |
| `tests/textbook-rag-end-to-end.test.ts` | integration, slow | Real sqlite-vec + mocked embeddings + mocked sidecar. Ingest → store → retrieve_from_textbook → assert ranked citations returned. |

---

## Implementation Order

1. **Unit 1** — Type contracts (foundation).
2. **Unit 2** — `python/praxis-cli/` (independent; can be developed in parallel).
3. **Unit 3** — `LocalEmbeddingService`.
4. **Unit 4** — `SqliteVecStore` + `initVectorStore`.
5. **Unit 5** — `IngestionService` (depends on Units 1, 3, 4 for types; integrates with Unit 2's CLI).
6. **Unit 6** — `retrieve_from_textbook` tool (depends on Units 1, 3, 4).
7. **Unit 7** — `DocumentsService` + `DrizzleDocumentsReader` (depends on Unit 1).
8. **Unit 8** — ServiceDeps + buildServices wiring (depends on Units 3-7).
9. **Unit 9** — IPC server + client additions (depends on Units 5, 7).
10. **Unit 10** — UI: file picker, progress, document list (depends on Unit 9).
11. **Unit 11** — UI: citation chips + source cards (depends on Unit 6's tool output shape).
12. **Unit 12** — `teach` mode + tools fragment (depends on Unit 6 existing).
13. **Unit 13** — Tests (interspersed; not all at the end).

Units 2 and 3 can be parallelized (Python vs TS).
Units 5 and 7 can be parallelized after 1, 3, 4 land.
Units 10 and 11 can be parallelized after 9 lands.

---

## Verification

```bash
# Existing
pnpm install && pnpm typecheck && pnpm lint && pnpm test
# 195 → ~250 tests pass on the fast lane

# Pyodide + Marker + real embeddings:
PRAXIS_RUN_SLOW_TESTS=1 pnpm test
# Adds ~5 minutes (Marker model download + load + parse a sample PDF)

# Python CLI dev install
uv tool install -e python/praxis-cli
praxis-cli --version
praxis-cli ingest /path/to/sample.pdf | head -c 1000

# Desktop build
pnpm desktop:build
pnpm dev    # opens window — manual M2-prep test

# Manual M1+ walkthrough (Phase 5 test checkpoint)
# 1. Click "Add document" → pick a PDF → see parsing then embedding progress
# 2. Wait until "Done" — close modal
# 3. Type: "What does chapter 3 say about respiration?"
# 4. Wait for assistant → text contains [1], [2] chips
# 5. Click [1] → page scrolls to source card, briefly highlighted
# 6. Click "more" on source card → full chunk text expands
# 7. pnpm db:episodic → see tool_call(retrieve_from_textbook) + tool_result with citations array
```

---

## Out of scope (defer)

- **Cloud embedding providers** — `EmbeddingService` interface ready for OpenAI/Voyage/Ollama via Vercel AI SDK in a future phase.
- **Per-page Marker streaming** via `marker_server` daemon — Phase 5 uses whole-doc batch with synthetic progress.
- **EPUB / .docx ingestion** — Marker supports them; only PDF wired in Phase 5.
- **Document re-ingestion / update** — workflow is delete + re-upload.
- **Concept extraction from documents** — Phase 6 (course bootstrap).
- **PDF page rendering** — citation cards show extracted text + page number; rendered pages are Phase 13 territory.
- **pgvector adapter** — Phase 15 (hosted deployment).
- **OCR for image-only PDFs** beyond what Marker does internally.
- **Marker model download UI** — first run triggers download silently; clearer "first-time setup" UI is a polish pass.
- **Hybrid search** (keyword + vector) — pure vector search for Phase 5.

## Notes for the implementer

- **`require("sqlite-vec")` over `import`** — sqlite-vec is loaded dynamically inside `loadSqliteVec` to avoid eager native binary load in tests that mock the extension. This mirrors the Phase 4 fix for `isolated-vm`.
- **Test gating** — slow tests (real Marker, real embedding model) gate behind `PRAXIS_RUN_SLOW_TESTS=1` (joins Phase 4's pattern; see `slow-test-gating` pattern doc).
- **Episodic events for tool_result** — already persisted by `SessionServiceImpl` (Phase 3); the citation harvest in `useStreamedSend` reads from the live stream, but episodic also captures the full tool_result for post-hoc review.
- **`@praxis/tools/runtime` exports** — add `LocalEmbeddingService`, `SqliteVecStore` to the index.
- **Patterns referenced**: `engine-session-lifecycle` (no impact, but related; ingestion is a different flow), `tool-dispatch-pipeline` (retrieve_from_textbook follows it exactly), `discriminated-union-dispatch` (IngestionEvent uses `type` discriminator like EngineEvent), `ipc-channel-convention` (new channels follow `praxis.ingest.*` and `praxis.documents.*`), `service-deps-injection` (new toolServices fields populated in buildServices), `temp-db-test-helper` (DB-backed tests use it), `slow-test-gating` (Marker + real embeddings gated).
- **Future migration to graph-aware chunking** — if Phase 7 demands semantic chunk boundaries (e.g., "definition" chunks separated from "example" chunks), the chunker in `python/praxis-cli/src/praxis_cli/ingest.py` is the seam; switch from `chunk_markdown` to a Marker-JSON-tree walker.
