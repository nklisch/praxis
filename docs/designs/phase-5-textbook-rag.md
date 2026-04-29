# Design: Phase 5 — Multi-Format Document RAG (with Native Engine Vision + Hybrid Retrieval)

> **Revision history**
> - v1 (a11cbba) — Marker-centric Python sidecar design
> - v2 (6eabb61) — multi-format JS ingestors + native engine vision; Marker deferred
> - **v3 (this) — adds page-render persistence (View Page UI), tightened Markdown vision prompt, hybrid retrieval (vector + BM25 via SQLite FTS5 with Reciprocal Rank Fusion), section/page filters on `retrieve_from_textbook`, question-asymmetric embedding for the bge-small model. Embedded image extraction added to Phase 13 in the roadmap.**

## Overview

Phase 5 lets a student drop almost any common study document into Praxis and ask questions about its contents — typed notes, class handouts, web articles, ebooks, PDFs — with cited answers backed by **multi-dimensional retrieval** (semantic + lexical + filtered). Architecture has four layers:

1. **`Ingestor` port + dispatcher** in `@praxis/tools/runtime/ingestion/`. Six default JS-tier ingestors cover the common formats (txt, md, html, docx, epub, pdf-text-layer). A seventh `VisionPdfIngestor` handles math-heavy / scanned PDFs by rendering pages and using the configured engine's native vision (no third-party OCR).
2. **Dual indexes** in `@praxis/tools/runtime/`: `SqliteVecStore` (sqlite-vec — semantic) and `SqliteFtsStore` (SQLite FTS5 — lexical). Both written during ingestion in the same transaction.
3. **Local embedding** via `@huggingface/transformers` v4 with `Xenova/bge-small-en-v1.5` (384-dim). Asymmetric encoding — chunks use the passage encoding, queries use a question-prefixed encoding — adds ~5-10% retrieval quality for free.
4. **Hybrid retrieval** in `retrieve_from_textbook`: parallel vector + BM25 search with **Reciprocal Rank Fusion** combining ranks. Optional section / page filters. Citations render as `[1]` `[2]` chips with expandable source cards in chat. Vision-tier chunks include a "📄 View page" button that opens the saved page render.

After Phase 5: drop any of `.txt`, `.md`, `.html`, `.docx`, `.epub`, `.pdf` into the chat sidebar. Modern text-layer PDFs and prose docs index in seconds via the JS tier. Math-heavy or scanned PDFs use the vision tier — engine-native, no separate API key. Ask "what does the textbook say about ATP synthase?" → hybrid retrieval surfaces the right chunks (vector for semantic relevance, BM25 for the exact term match), assistant streams an answer with `[1]` `[2]` chips that scroll to source cards. For vision-tier citations, click "View page" to see the original page.

**What ships:**

- Type contracts: `Ingestor`, `IngestorRegistry`, `IngestorResult`, `VectorStore`, `FtsStore`, `EmbeddingService`, `VisionCapability`, `Citation`, `IngestionEvent`, `RetrievalRequest`, `RetrievalResult`
- Engine config validation requires vision-capable models (per-provider allow-lists with substring fallback)
- `VisionCapability` on the `Engine` interface (optional field), implemented per-adapter using fresh one-shot SDK sessions:
  - **Direct**: Vercel AI SDK image content via `generateText`
  - **Claude Code**: pass-through via `query()` (one-shot, NOT `createConversation`) → temp-file image → Read tool → native Claude vision
  - **Codex**: pass-through via transient `startThread` with `local_image` inputs
- Six JS-tier ingestors: `PlainTextIngestor`, `MarkdownIngestor`, `HtmlIngestor` (Readability), `DocxIngestor` (mammoth), `EpubIngestor` (epub2), `JsPdfIngestor` (pdfjs-dist text layer)
- `VisionPdfIngestor` — pdfjs-dist renders pages → engine vision describes; per-page progress; saves rendered page images to disk for "View page" UI
- `VISION_PROMPT` extracted to `vision-prompt.ts` — markdown output with code fences, image placeholders, math LaTeX, table preservation, noise suppression
- `LocalEmbeddingService` (HF transformers v4, bge-small-en-v1.5, 384d) with **asymmetric methods**: `embed(text)` for passages, `embedQuery(text)` for queries
- `SqliteVecStore` + `initVectorStore` (sqlite-vec virtual table)
- **`SqliteFtsStore` + `initFtsStore`** (SQLite FTS5 virtual table for BM25)
- **`reciprocalRankFusion(vectorHits, ftsHits, topK)`** — combines two ranked lists into one
- **Page-image persistence** — `~/Library/Application Support/Praxis/document-pages/<documentId>/<pageNum>.png`; chunk locator gains `pageImagePath?: string`
- `IngestionService` thin orchestrator: ingestor → persist → save page images (vision tier) → embed + dual-index in batches → stream progress
- `retrieve_from_textbook` tool — hybrid retrieval, section / page filters, asymmetric query encoding
- `DocumentsService` (read + delete) and `IngestionClient` for IPC; **`praxis.documents.pageImage`** IPC for page image fetching
- UI: file picker (broad extension list), document list sidebar (with ingestor badge), ingestion progress modal, citation chips + expandable source cards (with **"📄 View page"** button for vision-tier chunks)
- `teach` mode: add `retrieve_from_textbook` to `toolNames`; tools fragment teaches `[N]` citation convention

**What does not ship (deferred):**

- **Local Marker (Python sidecar)** — see `docs/ROADMAP.md` "Future enhancements" for the trigger to revisit
- **Embedded image extraction (Option C)** — moved to Phase 13 alongside the broader visual-content work; uses image-rendering UI patterns built for sketches and the page-image side panel
- `.pptx`, `.rtf`, raw images — out of Phase 5 format set
- Hybrid-search re-ranking with the model — let the agent re-rank implicitly via citation choice
- pgvector adapter (Phase 15)
- Cloud-only OCR providers (Mistral, Mathpix, Textract) — vision goes through the configured engine
- Concept extraction / draft course bootstrap (Phase 6)

## Why these choices (decision rationale)

**Why hybrid retrieval (vector + BM25).** Pure vector search misses precise terminology (the query "ATP synthase" can match chunks about "energy metabolism" rather than the exact term). Pure BM25 misses semantic queries ("explain the energy cycle"). Combining them via Reciprocal Rank Fusion catches both. SQLite FTS5 is built-in — no new native dep, no extra index server. The cost is ~half a day of code for a meaningful retrieval-quality improvement, which compounds over thousands of agent tool calls.

**Why asymmetric query/passage encoding.** bge-small-en-v1.5 was trained with a query instruction prefix. Using it raises retrieval quality 5-10% on standard benchmarks. Cost: ~15 minutes of code. Benefit-to-effort ratio is absurdly favorable.

**Why save page renders.** A biology textbook full of cell diagrams loses ~50% of its value if students can't see the figures. The vision tier already renders pages to send to the model — saving them to disk costs trivial overhead and gives us "📄 View page" affordance for free. ~50KB-200KB per page on disk; ~15-60MB per textbook. Acceptable storage.

**Why drop Marker from Phase 5.** Marker requires Apple Silicon or a discrete GPU with 6GB+ VRAM. On Intel laptops with integrated graphics it falls back to CPU at 30 min – 2 hours per textbook (unusable). For a tutoring product targeting students broadly, that's a meaningful population we'd shut out. Roadmap's "Future enhancements" captures the trigger to revisit. The `Ingestor` port we ship makes adding `MarkerIngestor` a self-contained future addition.

**Why pass-through vision instead of separate API key.** SPEC.md commits to "Vision via the engine adapter's model. No third-party OCR." Phase 5 makes that concrete. Users on Claude Code or Codex CLI subscriptions get vision OCR billed against their existing subscription. Direct users use whatever provider they configured. Zero new credential surface.

**Why one-shot vision calls.** A 300-page textbook OCR pass would dump huge image content into the active tutoring conversation if we used the long-lived `EngineSession`. That destroys prompt-cache hits, pollutes the model's view of the conversation, and likely overflows context. Vision calls open a separate fresh session per page. The active tutoring `EngineSession` is untouched.

**Why require vision-capable models in engine config.** Multiple Phase 5+ features need vision: PDF ingestion via vision tier (this phase), handwritten math OCR (Phase 13), sketched concept maps (Phase 13). A user who selects a text-only model can't use these. Better to require vision at config time with a clear error than to silently break later features.

**Why embedded image extraction goes to Phase 13.** That phase is when Praxis becomes vision-rich (sketches, concept maps, handwriting OCR). The chat UI patterns for image rendering land there. Embedded image extraction reuses those patterns and groups all "visual content from documents" work together.

## Scope and assumptions

- **Local-only embeddings**, asymmetric. `Xenova/bge-small-en-v1.5` (384-dim). Lazy-loaded, preloaded at app startup.
- **Vision via configured engine's native model.** No third-party OCR. Pass-through for Claude Code / Codex.
- **Vision calls are isolated.** Each `engine.vision.describe(...)` opens a fresh underlying SDK session — never affects the active tutoring `EngineSession`.
- **Engine config requires vision-capable models.** Per-provider allow-lists with substring fallback. `claude-code` and `codex` trusted (CLI defaults are vision-capable). Direct providers must explicitly pick.
- **Hybrid retrieval is the default.** All `retrieve_from_textbook` calls run vector + BM25 in parallel and fuse via RRF. Filters layered on top.
- **Page renders persist on disk** for vision-tier ingestion. Cleaned up when the document is deleted. Not generated for JS-tier (we don't render those pages).
- **Per-student ingestion.** Documents scoped to the singleton default student.
- **`sqlite-vec` and FTS5 virtual tables created programmatically** in `initVectorStore` and `initFtsStore` after Drizzle migrations.
- **Slow tests gated** behind `PRAXIS_RUN_SLOW_TESTS=1` (real embedding model load, real vision calls against fixture PDFs).

## Dependency direction (Phase 5 additions)

```
@praxis/core/types
  ├─ NEW: VisionCapability on Engine
  ├─ NEW: FtsStore interface (sibling to VectorStore)
  ├─ NEW: page-image fields on chunk locator
  └─ NEW: section/page filter fields on retrieve input

@praxis/core/db
  ├─ initVectorStore (sqlite-vec, programmatic CREATE VIRTUAL TABLE)
  └─ initFtsStore  (FTS5, programmatic CREATE VIRTUAL TABLE)

@praxis/tools/runtime
  ├─ embeddings.ts — LocalEmbeddingService with asymmetric embed/embedQuery
  ├─ sqlite-vec-store.ts — SqliteVecStore
  ├─ sqlite-fts-store.ts — SqliteFtsStore (BM25)
  ├─ ingestion/
  │   ├─ ingestor.ts (port)
  │   ├─ registry.ts
  │   ├─ vision-prompt.ts (extracted, tightened)
  │   ├─ chunker.ts (shared)
  │   ├─ {plain-text,markdown,html,docx,epub,js-pdf}-ingestor.ts
  │   └─ vision-pdf-ingestor.ts (now also persists page images)
  └─ retrieval/
      ├─ rrf.ts — Reciprocal Rank Fusion helper
      └─ retrieve-from-textbook.ts (hybrid + filters)

@praxis/core/services
  ├─ ingestion/page-images.ts — content-addressed page render storage
  └─ documents/page-image.ts  — read page images for IPC

@praxis/engines/{direct,claude-code,codex}/vision.ts
  └─ Native vision per adapter (one-shot SDK sessions)

@praxis/desktop
  ├─ IPC: praxis.ingest.* (streamed), praxis.documents.{list,delete,pageImage}
  └─ buildServices wires all new pieces

@praxis/ui
  ├─ Document list sidebar (with ingestor badge)
  ├─ Ingestion progress modal
  ├─ Citation chips + source cards (with "📄 View page" for vision-tier)
  └─ Page-image side panel
```

No Python in Phase 5. SPEC.md's "single language boundary" still describes the future shape if/when Marker (or any other heavy ML tool) lands.

---

## Implementation Units

### Unit 1: Type contract additions

**File**: `packages/core/src/types/engine.ts` (modified — `VisionCapability`, `Engine.vision`)
**File**: `packages/core/src/types/citation.ts` (new)
**File**: `packages/core/src/types/ingestion.ts` (new)
**File**: `packages/core/src/types/tool.ts` (modified — `vectorStore`, `ftsStore`, `embeddings`, `documents` concrete)

```typescript
// packages/core/src/types/engine.ts — vision additions

export interface ImageInput {
  /** Image data as base64 (no `data:` prefix). */
  data: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

export interface VisionDescribeRequest {
  prompt: string;
  images: ReadonlyArray<ImageInput>;
  maxTokens?: number;
}

export interface VisionDescribeResponse {
  text: string;
  usage?: TokenUsage;
}

/**
 * Vision capability — extract text/structure from images. Each call opens a
 * fresh underlying SDK session (one-shot). The active tutoring EngineSession's
 * conversation history and prompt cache are NOT affected.
 */
export interface VisionCapability {
  describe(req: VisionDescribeRequest): Promise<VisionDescribeResponse>;
}

export interface Engine {
  readonly id: string;
  readonly kind: "looped" | "single-shot";
  open(opts: EngineOpenOptions): Promise<EngineSession>;
  health(): Promise<HealthStatus>;
  /** Optional vision capability. Phase 5 ships for all three adapters. */
  readonly vision?: VisionCapability;
}
```

```typescript
// packages/core/src/types/tool.ts — additions for hybrid + new services

export interface ToolServices {
  memory: unknown;       // → Phase 7
  artifacts: unknown;    // → Phase 6
  vectorStore: VectorStore;       // ← Phase 5
  ftsStore: FtsStore;             // ← Phase 5 NEW (BM25)
  sandbox: CodeSandbox;
  sympy: SymPyService;
  embeddings: EmbeddingService;   // ← Phase 5 NEW
  documents: DocumentsReader;     // ← Phase 5 NEW
  pedagogyPack: unknown; // → Phase 14
}

// EmbeddingService — now asymmetric

export interface EmbeddingService {
  /** Encode a passage / chunk for storage. */
  embed(text: string): Promise<number[]>;
  /** Encode a question/query for retrieval. Uses model-specific prefix when applicable. */
  embedQuery(query: string): Promise<number[]>;
  /** Batch passage encoding. */
  embedBatch(texts: string[]): Promise<number[][]>;
  readonly dimension: number;
  readonly modelId: string;
}

// VectorStore — unchanged from v2

export interface VectorStore {
  upsert(input: VectorUpsertInput): Promise<void>;
  upsertBatch(items: ReadonlyArray<VectorUpsertInput>): Promise<void>;
  search(input: VectorSearchInput): Promise<VectorSearchResult[]>;
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
  documentIds?: ReadonlyArray<string>;
  /** Phase 5 NEW: section name substring filter (case-insensitive). */
  sectionPattern?: string;
  /** Phase 5 NEW: page range filter (inclusive). */
  pageRange?: { from: number; to: number };
}

export interface VectorSearchResult {
  chunkId: string;
  documentId: string;
  chunkText: string;
  page?: number;
  section?: string;
  distance: number;
}

// FtsStore — NEW

export interface FtsStore {
  upsert(input: FtsUpsertInput): Promise<void>;
  upsertBatch(items: ReadonlyArray<FtsUpsertInput>): Promise<void>;
  /** BM25 full-text search. Returns chunks ranked by FTS5's BM25 score. */
  search(input: FtsSearchInput): Promise<FtsSearchResult[]>;
  deleteByDocumentId(documentId: string): Promise<void>;
}

export interface FtsUpsertInput {
  chunkId: string;
  documentId: string;
  chunkText: string;
  section?: string;
  page?: number;
}

export interface FtsSearchInput {
  /** Plain text query. The store internally builds an FTS5 MATCH expression. */
  query: string;
  topK: number;
  documentIds?: ReadonlyArray<string>;
  sectionPattern?: string;
  pageRange?: { from: number; to: number };
}

export interface FtsSearchResult {
  chunkId: string;
  documentId: string;
  chunkText: string;
  page?: number;
  section?: string;
  /** BM25 rank score from FTS5 (lower = more relevant; FTS5 returns negative log-prob). */
  score: number;
}

// DocumentsReader — extended for page images

export interface DocumentsReader {
  titlesByIds(ids: ReadonlyArray<string>): Promise<Map<string, string>>;
  /** Fetch the page image bytes if one was saved during vision-tier ingestion. */
  pageImage(input: { documentId: string; page: number }): Promise<Buffer | null>;
}
```

```typescript
// packages/core/src/types/citation.ts — NEW

export interface Citation {
  index: number;
  documentId: string;
  documentTitle: string;
  chunkId: string;
  chunkText: string;
  page?: number;
  section?: string;
  /** When set, the UI shows a "📄 View page" button that fetches the page image. */
  hasPageImage?: boolean;
  /** Combined retrieval score (rank-fused). Informational; results pre-sorted. */
  score: number;
}

export interface RetrievalResult {
  query: string;
  citations: Citation[];
}
```

```typescript
// packages/core/src/types/ingestion.ts — NEW

export type IngestionEvent =
  | { type: "start"; documentId: string; filename: string }
  | { type: "ingestor_selected"; ingestorId: string; ingestorLabel: string }
  | { type: "parsing"; message: string }
  | { type: "vision_page"; page: number; totalPages: number }   // VisionPdfIngestor only
  | { type: "parsed"; chunkCount: number }
  | { type: "indexing"; chunksProcessed: number; totalChunks: number }
  | { type: "done"; documentId: string; chunkCount: number }
  | { type: "error"; error: { code: string; message: string; recoverable: boolean } };

export interface IngestionRequest {
  filePath: string;
  filename: string;
  mimeType: string;
  studentId: string;
  /** Override ingestor selection. Default: registry auto-selects. */
  preferIngestorId?: string;
}
```

**Acceptance Criteria**:
- [ ] `VisionCapability` typechecks; `Engine.vision` is optional.
- [ ] `EmbeddingService` has separate `embed` and `embedQuery` methods.
- [ ] `FtsStore` is concrete; `VectorSearchInput` has `sectionPattern` and `pageRange`.
- [ ] `Citation` has `hasPageImage?: boolean` and `score: number` (replacing distance for hybrid results).
- [ ] `DocumentsReader.pageImage` defined; returns `null` when no image is stored.
- [ ] `IngestionEvent` includes `vision_page` and (renamed from `embedding`) `indexing` variants.

---

### Unit 2: `EngineConfigSchema` vision-capable validation

Unchanged from v2 — see prior revision. Adds `packages/core/src/config/vision-models.ts` with per-provider allow-lists; `EngineConfigSchema.superRefine` validates; `claude-code` and `codex` engines trusted (their CLI defaults are vision-capable).

---

### Unit 3: Per-engine `VisionCapability` implementations (one-shot, isolated)

Unchanged from v2 — see prior revision. Three `vision.ts` files, one per adapter. Each `describe()` call opens a fresh underlying SDK session: Direct uses `generateText`, Claude Code uses `query()` with `noSessionPersistence: true` and a temp-file image, Codex uses a transient `startThread` with `local_image` inputs. All clean up temp dirs in `finally` blocks.

---

### Unit 4: `Ingestor` port + `IngestorRegistry`

Same shape as v2. Registry dispatches by mime type / extension; `preferIngestorId` honored when supplied; `candidatesFor` returns multiple matches (e.g., both `JsPdfIngestor` and `VisionPdfIngestor` match `.pdf`).

---

### Unit 5: `vision-prompt.ts` — extracted + tightened

**File**: `packages/tools/src/runtime/ingestion/vision-prompt.ts` (new)
**File**: `packages/tools/src/runtime/ingestion/__tests__/vision-prompt.test.ts` (new — snapshot test)

```typescript
/**
 * The prompt sent to the configured engine's vision capability for each PDF
 * page during VisionPdfIngestor. Extracted to its own file so changes are
 * reviewable in one diff and the prompt can be customized later (e.g., per
 * subject pack) without touching the ingestor.
 *
 * Output target: Markdown with LaTeX math, code fences, image placeholders,
 * and proper tables. The chunker downstream relies on `#`/`##`/`###`
 * headings for section boundaries.
 */
export const VISION_PROMPT = `Extract all content from this page of a document. Output as Markdown.

Formatting rules (follow exactly):
- Use # / ## / ### / #### for headings, preserving the page's heading hierarchy.
- Use $$ ... $$ for display math equations (LaTeX).
- Use $ ... $ for inline math.
- Use Markdown table syntax for tables (| col | col | format with --- separator row).
- Use triple-backtick code fences for code blocks. Include the language if recognizable (e.g., \`\`\`python).
- For figures, diagrams, or images, emit a placeholder line:
    ![Figure: brief one-sentence description of what the figure depicts]
  Be specific (e.g., "Figure: bar chart comparing quarterly sales", not "Figure: a chart").
- Preserve numbered and bulleted lists as Markdown lists.
- Preserve paragraph structure with blank lines between paragraphs.

Skip noise (do NOT include in output):
- Page numbers
- Running headers and footers
- Watermarks
- Decorative borders or pure-style elements

Edge cases:
- If the page is blank or contains only decorative elements, output exactly: [BLANK PAGE]
- If the page contains only images with no extractable text content, output the figure placeholder(s) only.
- If you cannot read part of the page (low-quality scan, damage, etc.), use [UNREADABLE] in place of the unreadable section.

Output ONLY the Markdown content. No preamble. No explanation. No acknowledgment of the task.`;
```

**Implementation Notes**:
- Single-source-of-truth file makes prompt iteration easy.
- The prompt is a plain `const` — no template variables today; future per-subject customization can wrap it (`buildVisionPrompt({ subject })`).
- Snapshot test catches accidental changes during refactors.

**Acceptance Criteria**:
- [ ] `VISION_PROMPT` exports as a `const string`.
- [ ] Snapshot test asserts the prompt contents match a stored fixture; refactors that change the prompt require explicit snapshot update.

---

### Unit 6: Six default JS-tier ingestors

Same as v2 — six small ingestors, each ~50-150 lines, pure JS, all conform to the `Ingestor` interface and produce `IngestorResult` with markdown-derived chunks. Files:

- `plain-text-ingestor.ts` — paragraph chunking via `chunker.ts`
- `markdown-ingestor.ts` — heading-aware chunking, extracts H1 as title
- `html-ingestor.ts` — `@mozilla/readability` + `linkedom` strips chrome, then chunks
- `docx-ingestor.ts` — `mammoth.js` → HTML → heading-aware chunking
- `epub-ingestor.ts` — `epub2` chapter-by-chapter; each chapter is a section
- `js-pdf-ingestor.ts` — `pdfjs-dist` (legacy build for Node) text-layer extraction; reports `page` per chunk

Shared helper: `chunker.ts` — paragraph-boundary chunking with max-chars cap.

Dependency additions to `@praxis/tools/package.json`:
```json
{
  "dependencies": {
    "@mozilla/readability": "^0.5.0",
    "linkedom": "^0.18.0",
    "mammoth": "^1.8.0",
    "epub2": "^3.0.2",
    "pdfjs-dist": "^4.8.0"
  }
}
```

---

### Unit 7: `VisionPdfIngestor` with page-image persistence (NEW: persistence)

**Files**:
- `packages/tools/src/runtime/ingestion/vision-pdf-ingestor.ts` (modified — saves rendered pages)
- `packages/core/src/ingestion/page-images.ts` (new — content-addressed storage)
- `packages/tools/src/runtime/ingestion/__tests__/vision-pdf-ingestor.test.ts`

**`packages/core/src/ingestion/page-images.ts`** (new):

```typescript
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir, platform } from "node:os";

/**
 * Content-addressed storage for rendered PDF page images. Saved during
 * VisionPdfIngestor; read by `praxis.documents.pageImage` IPC for the
 * "📄 View page" UI.
 *
 * Storage layout:
 *   <baseDir>/<documentId>/<pageNum>.png
 * baseDir defaults to OS user data dir; can be overridden via PRAXIS_PAGE_IMAGES_DIR.
 */
export interface PageImageStore {
  save(input: { documentId: string; page: number; pngBytes: Buffer }): Promise<string>;
  read(input: { documentId: string; page: number }): Promise<Buffer | null>;
  /** Delete all page images for a document. Called when the document is removed. */
  deleteByDocumentId(documentId: string): Promise<void>;
  /** Absolute path where a page image would be (or is) stored. */
  pathFor(input: { documentId: string; page: number }): string;
}

export class FsPageImageStore implements PageImageStore {
  private readonly baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? defaultBaseDir();
  }

  pathFor(input: { documentId: string; page: number }): string {
    return join(this.baseDir, input.documentId, `${input.page}.png`);
  }

  async save(input: { documentId: string; page: number; pngBytes: Buffer }): Promise<string> {
    const path = this.pathFor(input);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, input.pngBytes);
    return path;
  }

  async read(input: { documentId: string; page: number }): Promise<Buffer | null> {
    try {
      return await readFile(this.pathFor(input));
    } catch {
      return null;
    }
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    await rm(join(this.baseDir, documentId), { recursive: true, force: true });
  }
}

function defaultBaseDir(): string {
  const env = process.env.PRAXIS_PAGE_IMAGES_DIR;
  if (env) return env;
  const home = homedir();
  switch (platform()) {
    case "darwin":
      return join(home, "Library", "Application Support", "Praxis", "document-pages");
    case "win32":
      return join(process.env.APPDATA ?? home, "Praxis", "document-pages");
    default:
      return join(home, ".local", "share", "praxis", "document-pages");
  }
}
```

**`packages/tools/src/runtime/ingestion/vision-pdf-ingestor.ts`** (modified):

```typescript
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Ingestor, IngestorOptions, IngestorResult, IngestedChunk } from "./ingestor.js";
import type { VisionCapability } from "@praxis/core/types";
import type { PageImageStore } from "@praxis/core/ingestion";
import { VISION_PROMPT } from "./vision-prompt.js";

export interface VisionPdfIngestorOptions {
  visionResolver: () => VisionCapability | undefined;
  /** Optional store for persisting rendered page images. When set, ingestor saves each page. */
  pageImageStore?: PageImageStore;
  /** Render scale; higher = larger images = better OCR + cost. Default 2.0. */
  renderScale?: number;
}

/**
 * VisionPdfIngestor — per-page render → engine vision → markdown chunks.
 * When a `pageImageStore` is provided, each rendered page PNG is saved to disk
 * for later "View page" display in source cards.
 */
export class VisionPdfIngestor implements Ingestor {
  readonly id = "vision-pdf";
  readonly label = "PDF (vision OCR)";
  readonly extensions = [".pdf"] as const;
  readonly mimeTypes = ["application/pdf"] as const;

  constructor(private readonly opts: VisionPdfIngestorOptions) {}

  async isAvailable(): Promise<boolean> {
    return this.opts.visionResolver() !== undefined;
  }

  async parse(filePath: string, opts: IngestorOptions = {}): Promise<IngestorResult> {
    const vision = this.opts.visionResolver();
    if (!vision) throw new Error("VisionPdfIngestor: no vision capability on the active engine");

    const data = await readFile(filePath);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createCanvas } = await import("canvas");

    const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
    const renderScale = this.opts.renderScale ?? 2.0;
    const maxChars = opts.maxChars ?? 2000;
    const chunks: IngestedChunk[] = [];
    let chunkIndex = 0;
    let currentSection: string | undefined;

    // documentId is decided by IngestionService and isn't known to the ingestor;
    // page-image saving uses a synthetic id derived from filePath that
    // IngestionService rewrites to the real documentId after persisting the row.
    // (See IngestionService for the rewrite step.)
    const synthDocId = `pending-${basename(filePath)}-${Date.now()}`;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      if (opts.signal?.aborted) break;
      opts.onPageProgress?.(pageNum, pdf.numPages);

      // Render to PNG
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: renderScale });
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext("2d") as unknown as Parameters<typeof page.render>[0]["canvasContext"];
      await page.render({ canvasContext: ctx, viewport }).promise;
      const pngBuffer = canvas.toBuffer("image/png");

      // Save the rendered page if a store is configured
      if (this.opts.pageImageStore) {
        await this.opts.pageImageStore.save({
          documentId: synthDocId,
          page: pageNum,
          pngBytes: pngBuffer,
        });
      }

      // Vision call — fresh one-shot SDK session per page
      const result = await vision.describe({
        prompt: VISION_PROMPT,
        images: [{ data: pngBuffer.toString("base64"), mimeType: "image/png" }],
        maxTokens: 4000,
      });

      const pageMarkdown = result.text.trim();
      if (pageMarkdown === "[BLANK PAGE]" || pageMarkdown === "") continue;

      // Parse the page's markdown into chunks (MarkdownIngestor-style)
      let buf: string[] = [];
      let bufLen = 0;
      const flush = () => {
        if (buf.length === 0) return;
        chunks.push({
          chunkIndex: chunkIndex++,
          text: buf.join("\n\n"),
          page: pageNum,
          ...(currentSection !== undefined && { section: currentSection }),
        });
        buf = [];
        bufLen = 0;
      };
      for (const para of pageMarkdown.split("\n\n")) {
        const stripped = para.trim();
        if (!stripped) continue;
        const headingMatch = /^(#{1,6})\s+(.+)$/.exec(stripped);
        if (headingMatch) {
          flush();
          currentSection = headingMatch[2]!.trim();
          chunks.push({
            chunkIndex: chunkIndex++,
            text: stripped,
            section: currentSection,
            page: pageNum,
            blockType: "SectionHeader",
          });
          continue;
        }
        if (bufLen + stripped.length > maxChars && buf.length > 0) flush();
        buf.push(stripped);
        bufLen += stripped.length;
      }
      flush();
    }

    return {
      title: basename(filePath),
      pageCount: pdf.numPages,
      chunks,
      ingestorId: this.id,
      // Hint to IngestionService: rewrite synthetic doc-id directory to real one
      pendingPageImageDocId: synthDocId,
    };
  }
}
```

> **Note**: `IngestorResult` extends with optional `pendingPageImageDocId?: string`. `IngestionService` checks this after persisting the document row and renames the synthetic-doc-id directory to the real `documentId`. This keeps the ingestor unaware of the document ID assignment.

**`canvas` native dep**: requires `electron-rebuild` like `isolated-vm`. Update `@praxis/desktop`'s postinstall: `electron-rebuild -f -w isolated-vm,canvas`.

**Acceptance Criteria**:
- [ ] When `pageImageStore` is provided, each page PNG is saved to disk under a synthetic doc-id directory.
- [ ] `IngestorResult.pendingPageImageDocId` is set to the synthetic id.
- [ ] When `pageImageStore` is not provided (e.g., tests), no images saved; ingestion still works.
- [ ] Vision call uses `VISION_PROMPT` from `vision-prompt.ts` (not inlined).
- [ ] Aborts mid-page-loop on `signal.aborted`.

---

### Unit 8: `LocalEmbeddingService` with asymmetric encoding

**File**: `packages/tools/src/runtime/embeddings.ts` (modified — add `embedQuery`)

```typescript
import type { EmbeddingService } from "@praxis/core/types";

const DEFAULT_MODEL = "Xenova/bge-small-en-v1.5";
const DEFAULT_DIMENSION = 384;

/** bge-small-en-v1.5 query instruction (recommended by the model card). */
const QUERY_PREFIX = "Represent this question for searching relevant textbook passages: ";

export class LocalEmbeddingService implements EmbeddingService {
  readonly modelId: string;
  readonly dimension: number;
  private pipelinePromise: Promise<unknown> | null = null;

  constructor(opts: { modelId?: string; dimension?: number } = {}) {
    this.modelId = opts.modelId ?? DEFAULT_MODEL;
    this.dimension = opts.dimension ?? DEFAULT_DIMENSION;
  }

  async preload(): Promise<void> { await this.getPipeline(); }

  async embed(text: string): Promise<number[]> {
    const [vec] = await this.embedBatch([text]);
    if (!vec) throw new Error("LocalEmbeddingService.embed returned no vectors");
    return vec;
  }

  /** Encode a query (with model-specific instruction prefix for ~5-10% retrieval gain). */
  async embedQuery(query: string): Promise<number[]> {
    return this.embed(`${QUERY_PREFIX}${query}`);
  }

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
      this.pipelinePromise = (async () => {
        const tx = await import("@huggingface/transformers");
        return tx.pipeline("feature-extraction", this.modelId);
      })();
    }
    return this.pipelinePromise;
  }
}
```

**Acceptance Criteria**:
- [ ] `embedQuery("hello")` produces a different vector than `embed("hello")` (the prefix changes the input).
- [ ] `embedBatch(["a", "b"])` returns 2 vectors of length 384 each.
- [ ] Concurrent calls share the same load promise (no double download).

---

### Unit 9: `SqliteVecStore` + `SqliteFtsStore`

**Files**:
- `packages/tools/src/runtime/sqlite-vec-store.ts` (modified — adds section/page filters)
- `packages/tools/src/runtime/sqlite-fts-store.ts` (new)
- `packages/core/src/db/vector-init.ts` (modified — also init FTS table)

**`packages/core/src/db/vector-init.ts`** (modified):

```typescript
import type Database from "better-sqlite3";

const EMBEDDING_DIMENSION = 384;

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

export function initFtsStore(sqlite: Database.Database): void {
  // FTS5 is built into SQLite — no extension load needed.
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS document_chunks_fts USING fts5(
      chunk_id UNINDEXED,
      document_id UNINDEXED,
      page UNINDEXED,
      section,
      text,
      tokenize = 'porter unicode61'
    );
  `);
}

function loadSqliteVec(sqlite: Database.Database): void {
  // biome-ignore lint/suspicious/noExplicitAny: dynamic require keeps native bin out of test load
  const sqliteVec = require("sqlite-vec") as { load: (db: Database.Database) => void };
  sqliteVec.load(sqlite);
}
```

`openDb` modifications: also call `initFtsStore(sqlite)` after `initVectorStore` (and after migrations).

**`packages/tools/src/runtime/sqlite-vec-store.ts`** modifications: `search()` now accepts `sectionPattern` and `pageRange`. The SQL builds dynamically:

```typescript
async search(input: VectorSearchInput): Promise<VectorSearchResult[]> {
  const conds: string[] = ["embedding MATCH ?", "k = ?"];
  const params: Array<Buffer | number | string> = [vectorToBlob(input.embedding), input.topK];

  if (input.documentIds && input.documentIds.length > 0) {
    conds.push(`document_id IN (${input.documentIds.map(() => "?").join(",")})`);
    params.push(...input.documentIds);
  }
  if (input.sectionPattern) {
    conds.push("section LIKE ?");
    params.push(`%${input.sectionPattern}%`);
  }
  if (input.pageRange) {
    conds.push("page BETWEEN ? AND ?");
    params.push(input.pageRange.from, input.pageRange.to);
  }

  const sql = `
    SELECT chunk_id, document_id, chunk_text, page, section, distance
    FROM document_embeddings
    WHERE ${conds.join(" AND ")}
    ORDER BY distance;
  `;
  const rows = this.sqlite.prepare(sql).all(...params) as Array<{...}>;
  return rows.map((r) => ({...}));
}
```

**`packages/tools/src/runtime/sqlite-fts-store.ts`** (new):

```typescript
import type Database from "better-sqlite3";
import type { FtsSearchInput, FtsSearchResult, FtsStore, FtsUpsertInput } from "@praxis/core/types";

export class SqliteFtsStore implements FtsStore {
  private readonly upsertStmt: Database.Statement;
  private readonly deleteByDocStmt: Database.Statement;

  constructor(private readonly sqlite: Database.Database) {
    this.upsertStmt = sqlite.prepare(`
      INSERT INTO document_chunks_fts (chunk_id, document_id, page, section, text)
      VALUES (?, ?, ?, ?, ?);
    `);
    this.deleteByDocStmt = sqlite.prepare(
      "DELETE FROM document_chunks_fts WHERE document_id = ?",
    );
  }

  async upsert(input: FtsUpsertInput): Promise<void> {
    // FTS5 doesn't support ON CONFLICT for virtual tables. Delete-then-insert
    // keyed on (document_id, chunk_id). For ingestion (one-time per doc) this
    // is fine; for re-ingestion, caller should deleteByDocumentId first.
    this.upsertStmt.run(
      input.chunkId, input.documentId,
      input.page ?? null, input.section ?? null, input.chunkText,
    );
  }

  async upsertBatch(items: ReadonlyArray<FtsUpsertInput>): Promise<void> {
    const txn = this.sqlite.transaction((rows: ReadonlyArray<FtsUpsertInput>) => {
      for (const row of rows) {
        this.upsertStmt.run(
          row.chunkId, row.documentId,
          row.page ?? null, row.section ?? null, row.chunkText,
        );
      }
    });
    txn(items);
  }

  async search(input: FtsSearchInput): Promise<FtsSearchResult[]> {
    // FTS5 MATCH expression. Sanitize query for FTS5 safety: strip quotes and
    // escape any control chars; otherwise the user's query is treated as plain
    // text (FTS5 tokenizes naturally).
    const safeQuery = input.query.replace(/["()]/g, " ").trim();
    if (!safeQuery) return [];

    const conds: string[] = ["text MATCH ?"];
    const params: Array<string | number> = [safeQuery];

    if (input.documentIds && input.documentIds.length > 0) {
      conds.push(`document_id IN (${input.documentIds.map(() => "?").join(",")})`);
      params.push(...input.documentIds);
    }
    if (input.sectionPattern) {
      conds.push("section LIKE ?");
      params.push(`%${input.sectionPattern}%`);
    }
    if (input.pageRange) {
      conds.push("page BETWEEN ? AND ?");
      params.push(input.pageRange.from, input.pageRange.to);
    }

    const sql = `
      SELECT chunk_id, document_id, page, section, text, bm25(document_chunks_fts) AS score
      FROM document_chunks_fts
      WHERE ${conds.join(" AND ")}
      ORDER BY score
      LIMIT ?;
    `;
    params.push(input.topK);

    const rows = this.sqlite.prepare(sql).all(...params) as Array<{
      chunk_id: string;
      document_id: string;
      page: number | null;
      section: string | null;
      text: string;
      score: number;
    }>;
    return rows.map((r) => ({
      chunkId: r.chunk_id,
      documentId: r.document_id,
      chunkText: r.text,
      ...(r.page !== null && { page: r.page }),
      ...(r.section !== null && { section: r.section }),
      score: r.score,
    }));
  }

  async deleteByDocumentId(documentId: string): Promise<void> {
    this.deleteByDocStmt.run(documentId);
  }
}
```

**Implementation Notes**:
- FTS5 returns negative log-prob scores via `bm25()`; lower = more relevant. We `ORDER BY score` ascending.
- The `text MATCH ?` form takes a raw FTS5 query expression; we strip syntactic chars from the user's input so they can't accidentally write malformed queries (typical user input is just words, which FTS5 handles natively).
- No prepared statement for `search` because the SQL shape varies with which filters are applied.

**Acceptance Criteria**:
- [ ] `initFtsStore` creates the `document_chunks_fts` virtual table.
- [ ] `ftsStore.upsertBatch` writes N rows in a transaction.
- [ ] `ftsStore.search({ query: "ATP synthase" })` returns chunks containing those terms ranked by BM25.
- [ ] Filters (`documentIds`, `sectionPattern`, `pageRange`) constrain results.
- [ ] Vector store search with `sectionPattern: "chapter 3"` returns only chunks with "chapter 3" in section.
- [ ] Vector store search with `pageRange: { from: 40, to: 50 }` returns only chunks with `page` in [40,50].

---

### Unit 10: Reciprocal Rank Fusion helper

**File**: `packages/tools/src/retrieval/rrf.ts` (new)
**File**: `packages/tools/src/retrieval/__tests__/rrf.test.ts`

```typescript
import type { FtsSearchResult, VectorSearchResult } from "@praxis/core/types";

export interface FusedResult {
  chunkId: string;
  documentId: string;
  chunkText: string;
  page?: number;
  section?: string;
  /** Combined RRF score (higher = better). */
  score: number;
  /** Whether this chunk appeared in the vector hits. */
  fromVector: boolean;
  /** Whether this chunk appeared in the FTS hits. */
  fromFts: boolean;
}

/**
 * Reciprocal Rank Fusion combines two ranked lists into one. For each chunk
 * present in either list, score = sum over lists of 1/(k + rank). The
 * constant `k=60` is the conventional RRF default (Cormack et al., 2009).
 *
 * Hits in BOTH lists score higher than hits in either list alone, which is
 * exactly what we want: chunks that are both semantically similar AND
 * lexically matching are typically the strongest answers.
 */
export function reciprocalRankFusion(
  vectorHits: ReadonlyArray<VectorSearchResult>,
  ftsHits: ReadonlyArray<FtsSearchResult>,
  topK: number,
  k = 60,
): FusedResult[] {
  const byChunkId = new Map<string, FusedResult>();

  vectorHits.forEach((hit, idx) => {
    const rank = idx + 1;
    byChunkId.set(hit.chunkId, {
      chunkId: hit.chunkId,
      documentId: hit.documentId,
      chunkText: hit.chunkText,
      ...(hit.page !== undefined && { page: hit.page }),
      ...(hit.section !== undefined && { section: hit.section }),
      score: 1 / (k + rank),
      fromVector: true,
      fromFts: false,
    });
  });

  ftsHits.forEach((hit, idx) => {
    const rank = idx + 1;
    const existing = byChunkId.get(hit.chunkId);
    if (existing) {
      existing.score += 1 / (k + rank);
      existing.fromFts = true;
    } else {
      byChunkId.set(hit.chunkId, {
        chunkId: hit.chunkId,
        documentId: hit.documentId,
        chunkText: hit.chunkText,
        ...(hit.page !== undefined && { page: hit.page }),
        ...(hit.section !== undefined && { section: hit.section }),
        score: 1 / (k + rank),
        fromVector: false,
        fromFts: true,
      });
    }
  });

  return [...byChunkId.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
```

**Acceptance Criteria**:
- [ ] Empty inputs return empty result.
- [ ] A chunk in only vector hits at rank 1 scores `1/(60+1)`.
- [ ] A chunk in both at rank 1 + rank 1 scores `2/(60+1)` (fused).
- [ ] Result ordered descending by score; truncated to `topK`.
- [ ] `fromVector` and `fromFts` flags correctly track origin.

---

### Unit 11: `IngestionService` (dual-index + page-image rewrite)

**File**: `packages/core/src/ingestion/service.ts` (modified)

```typescript
import { v7 as uuidv7 } from "uuid";
import { rename } from "node:fs/promises";
import { documentChunks, documents } from "@praxis/artifacts/schema";
import type { PraxisDb } from "../db/index.js";
import type {
  EmbeddingService,
  FtsStore,
  IngestionEvent,
  IngestionRequest,
  Logger,
  VectorStore,
} from "../types/index.js";
import type { Ingestor, IngestorRegistry } from "@praxis/tools/runtime/ingestion";
import type { PageImageStore } from "./page-images.js";

export interface IngestionServiceDeps {
  db: PraxisDb;
  log: Logger;
  vectorStore: VectorStore;
  ftsStore: FtsStore;          // ← new
  embeddings: EmbeddingService;
  ingestorRegistry: IngestorRegistry;
  pageImageStore: PageImageStore;  // ← new
}

const EMBED_BATCH_SIZE = 32;

export class IngestionService {
  constructor(private readonly deps: IngestionServiceDeps) {}

  async *ingest(req: IngestionRequest, signal?: AbortSignal): AsyncIterable<IngestionEvent> {
    const documentId = uuidv7();
    yield { type: "start", documentId, filename: req.filename };

    const ingestor = await this.deps.ingestorRegistry.select({
      mimeType: req.mimeType,
      filename: req.filename,
      ...(req.preferIngestorId !== undefined && { preferIngestorId: req.preferIngestorId }),
    });
    if (!ingestor) {
      yield { type: "error", error: { code: "ingest.no_ingestor", message: `No ingestor for ${req.mimeType} / ${req.filename}`, recoverable: false } };
      return;
    }
    yield { type: "ingestor_selected", ingestorId: ingestor.id, ingestorLabel: ingestor.label };

    yield { type: "parsing", message: `Parsing with ${ingestor.label}...` };
    let result;
    try {
      result = await ingestor.parse(req.filePath, {
        ...(signal !== undefined && { signal }),
        onPageProgress: (page, totalPages) => {
          this.deps.log.debug("vision page progress", { page, totalPages });
        },
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      yield { type: "error", error: { code: "ingest.parse_failed", message, recoverable: false } };
      return;
    }
    yield { type: "parsed", chunkCount: result.chunks.length };

    const ingestedAt = new Date();
    this.deps.db.insert(documents).values({
      id: documentId,
      studentId: req.studentId,
      filename: req.filename,
      mimeType: req.mimeType,
      ingestedAt,
      manifestJson: { title: result.title, pageCount: result.pageCount, ingestorId: result.ingestorId },
      chunkCount: result.chunks.length,
    }).run();

    // If the ingestor saved page images under a synthetic doc-id, rename to real id
    if (result.pendingPageImageDocId) {
      try {
        await rename(
          this.deps.pageImageStore.pathFor({ documentId: result.pendingPageImageDocId, page: 1 }).replace(/\/1\.png$/, ""),
          this.deps.pageImageStore.pathFor({ documentId, page: 1 }).replace(/\/1\.png$/, ""),
        );
      } catch (e) {
        this.deps.log.warn("page-image rename failed", { error: String(e) });
      }
    }

    const chunkRows = result.chunks.map((c) => ({
      id: uuidv7(),
      documentId,
      chunkIndex: c.chunkIndex,
      text: c.text,
      locatorJson: {
        page: c.page ?? null,
        section: c.section ?? null,
        blockType: c.blockType ?? null,
        // page-image presence is implicit from documentId/page; tools resolve via PageImageStore
      },
    }));
    if (chunkRows.length > 0) {
      this.deps.db.insert(documentChunks).values(chunkRows).run();
    }

    // Embed + dual-index in batches
    let processed = 0;
    for (let start = 0; start < result.chunks.length; start += EMBED_BATCH_SIZE) {
      if (signal?.aborted) {
        yield { type: "error", error: { code: "ingest.cancelled", message: "Cancelled by user", recoverable: false } };
        return;
      }
      const batch = result.chunks.slice(start, start + EMBED_BATCH_SIZE);
      const vectors = await this.deps.embeddings.embedBatch(batch.map((c) => c.text));

      const vectorUpserts = batch.map((c, i) => {
        const row = chunkRows[start + i]!;
        const vec = vectors[i]!;
        return {
          chunkId: row.id,
          documentId,
          embedding: vec,
          chunkText: c.text,
          ...(c.page !== undefined && { page: c.page }),
          ...(c.section !== undefined && { section: c.section }),
        };
      });
      const ftsUpserts = batch.map((c, i) => {
        const row = chunkRows[start + i]!;
        return {
          chunkId: row.id,
          documentId,
          chunkText: c.text,
          ...(c.page !== undefined && { page: c.page }),
          ...(c.section !== undefined && { section: c.section }),
        };
      });

      await Promise.all([
        this.deps.vectorStore.upsertBatch(vectorUpserts),
        this.deps.ftsStore.upsertBatch(ftsUpserts),
      ]);

      processed += batch.length;
      yield { type: "indexing", chunksProcessed: processed, totalChunks: result.chunks.length };
    }

    yield { type: "done", documentId, chunkCount: result.chunks.length };
  }
}
```

**Acceptance Criteria**:
- [ ] After ingestion, both `document_embeddings` AND `document_chunks_fts` contain N rows.
- [ ] Vector and FTS upserts run in parallel (verify via spy timing).
- [ ] When vision-tier ingests, page images are saved + renamed to real `documentId` directory.
- [ ] On parse failure: no document row, no vectors, no FTS rows persisted.
- [ ] Cancellation between batches stops both indexes from getting more rows.

---

### Unit 12: `retrieve_from_textbook` — hybrid retrieval + filters

**File**: `packages/tools/src/retrieval/retrieve-from-textbook.ts` (modified)

```typescript
import { z } from "zod";
import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { reciprocalRankFusion } from "./rrf.js";

export const retrieveFromTextbookInput = z.object({
  query: z.string().min(1).describe(
    "A natural-language question or topic to search the student's textbooks for.",
  ),
  topK: z.number().int().min(1).max(20).default(5).describe(
    "How many citations to return. Default 5; rarely need more than 10.",
  ),
  documentIds: z.array(z.string()).optional().describe(
    "Restrict search to specific document IDs. Default: search all of the student's documents.",
  ),
  sectionPattern: z.string().optional().describe(
    "Restrict to chunks whose section name contains this substring (case-insensitive). " +
    "Useful for 'chapter 3' or 'photosynthesis' style filtering when you know the section.",
  ),
  pageRange: z.object({
    from: z.number().int().min(1),
    to: z.number().int().min(1),
  }).optional().describe(
    "Restrict to a page range (inclusive). Useful when the student references specific pages.",
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
      hasPageImage: z.boolean().optional(),
      score: z.number(),
    }),
  ),
});

const VECTOR_OVERFETCH = 2;  // fetch 2x topK from each index before fusion

export const retrieveFromTextbookTool: ToolDefinition<
  typeof retrieveFromTextbookInput,
  typeof retrieveFromTextbookOutput
> = {
  name: "retrieve_from_textbook",
  description: `Search the student's uploaded textbooks for relevant passages and return ranked citations. Uses HYBRID retrieval (semantic + lexical) — vector embeddings for paraphrase matches plus BM25 for exact-term matches, combined via reciprocal rank fusion.

Use this for ANY claim that should be grounded in the student's course material — definitions, examples, derivations, formulas, historical facts, etc.

Refer to citations as [1], [2], etc. matching the order they appear in the result. The student's UI renders these as clickable chips that show the source chunk.

Filters (use when the student gives you a hint):
- documentIds: limit to specific documents (e.g., only the biology textbook)
- sectionPattern: restrict to a section by substring (e.g., "chapter 3" or "respiration")
- pageRange: restrict to a page range (e.g., pages 40-50)

If retrieval returns nothing useful, say so explicitly. Don't invent connections. Recommend the student upload more material if relevant.`,
  input: retrieveFromTextbookInput,
  output: retrieveFromTextbookOutput,
  tier: "grounded",
  effects: ["external.code-exec"],
  async handler(args, ctx: ToolContext) {
    const { embeddings, vectorStore, ftsStore, documents } = ctx.services;

    // Asymmetric query encoding (small quality boost for bge-small)
    const queryVec = await embeddings.embedQuery(args.query);

    const overfetch = args.topK * VECTOR_OVERFETCH;
    const filterArgs = {
      ...(args.documentIds !== undefined && { documentIds: args.documentIds }),
      ...(args.sectionPattern !== undefined && { sectionPattern: args.sectionPattern }),
      ...(args.pageRange !== undefined && { pageRange: args.pageRange }),
    };

    // Hybrid: parallel vector + BM25
    const [vectorHits, ftsHits] = await Promise.all([
      vectorStore.search({ embedding: queryVec, topK: overfetch, ...filterArgs }),
      ftsStore.search({ query: args.query, topK: overfetch, ...filterArgs }),
    ]);

    // Fuse via RRF
    const fused = reciprocalRankFusion(vectorHits, ftsHits, args.topK);

    if (fused.length === 0) {
      return { query: args.query, citations: [] };
    }

    // Hydrate document titles
    const docIds = [...new Set(fused.map((r) => r.documentId))];
    const titles = await documents.titlesByIds(docIds);

    // Mark which chunks have a page image saved (lightweight check via store)
    const citations = await Promise.all(
      fused.map(async (r, i) => {
        let hasPageImage = false;
        if (r.page !== undefined) {
          const img = await documents.pageImage({ documentId: r.documentId, page: r.page });
          hasPageImage = img !== null;
        }
        return {
          index: i + 1,
          documentId: r.documentId,
          documentTitle: titles.get(r.documentId) ?? "(unknown)",
          chunkId: r.chunkId,
          chunkText: r.chunkText,
          ...(r.page !== undefined && { page: r.page }),
          ...(r.section !== undefined && { section: r.section }),
          ...(hasPageImage && { hasPageImage: true }),
          score: r.score,
        };
      }),
    );

    return { query: args.query, citations };
  },
};
```

**Implementation Notes**:
- **Overfetch by 2×**: each index returns 2× topK before RRF; gives the fusion enough candidates to find chunks present in both lists (which score highest).
- **`hasPageImage` lookup is lightweight** — `pageImage()` returns null when no file exists (catches ENOENT); we don't decode the image bytes, just check existence by reading the buffer (a future optimization could be a separate `existsByDocumentPage()` method that just `stat`s).
- **`embedQuery`** is the asymmetric encoding entry point.
- The agent sees ranked, fused citations and decides which to cite as `[1]`, `[2]`, etc. in its text.

**Acceptance Criteria**:
- [ ] `retrieveFromTextbookTool.handler({ query: "..." }, ctx)` calls `embedQuery` (not `embed`) for the query.
- [ ] Calls vector + FTS search in parallel (verify via Promise.all spy).
- [ ] Result ordered by RRF score; chunks present in both lists rank highest.
- [ ] `hasPageImage: true` only set when the page image exists.
- [ ] Section/page filters propagate to both stores.
- [ ] Empty fused result returns `{ query, citations: [] }` (no error).

---

### Unit 13: `DocumentsService` + `DrizzleDocumentsReader` — page image read

**File**: `packages/core/src/services/documents-reader-impl.ts` (modified)

```typescript
import { inArray } from "drizzle-orm";
import { documents } from "@praxis/artifacts/schema";
import type { DocumentsReader } from "../types/tool.js";
import type { PraxisDb } from "../db/index.js";
import type { PageImageStore } from "../ingestion/page-images.js";

export class DrizzleDocumentsReader implements DocumentsReader {
  constructor(
    private readonly db: PraxisDb,
    private readonly pageImageStore: PageImageStore,
  ) {}

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

  async pageImage(input: { documentId: string; page: number }): Promise<Buffer | null> {
    return this.pageImageStore.read(input);
  }
}
```

`DocumentsServiceImpl.delete` extension: also delete from FtsStore + PageImageStore:

```typescript
async delete(documentId: string): Promise<void> {
  await this.deps.vectorStore.deleteByDocumentId(documentId);
  await this.deps.ftsStore.deleteByDocumentId(documentId);
  await this.deps.pageImageStore.deleteByDocumentId(documentId);
  this.deps.db.delete(documents).where(eq(documents.id, documentId)).run();
}
```

**Acceptance Criteria**:
- [ ] `pageImage` returns `null` when no file exists.
- [ ] `delete` removes vectors + FTS rows + page images + document row + cascaded chunks.

---

### Unit 14: ServiceDeps + buildServices wiring

**File**: `packages/desktop/electron/main/services.ts` (modified)

```typescript
export function buildServices(dbPath: string): Services {
  const { db } = openDb({ path: dbPath });  // initializes vec + fts tables
  const sqlite = (db as unknown as { $client: import("better-sqlite3").Database }).$client;
  const log = consoleLogger();

  // Phase 4: Pyodide + sandbox
  const pyodide = new PyodideHost({ packages: ["sympy"] });
  const sympy = new PyodideSymPyService(pyodide);
  const sandbox = new LocalCodeSandbox(new IsolatedVmHost(), pyodide);

  // Phase 5: vectors + FTS + embeddings + page images
  const vectorStore = new SqliteVecStore(sqlite);
  const ftsStore = new SqliteFtsStore(sqlite);
  const embeddings = new LocalEmbeddingService();
  const pageImageStore = new FsPageImageStore();
  const documentsReader = new DrizzleDocumentsReader(db, pageImageStore);

  // Vision resolver — derived from the active engine config at call time
  const visionResolver = () => {
    const engineConfig = readEngineConfig(db);
    const engine = createEngine({ config: engineConfig, deps: { log } });
    return engine.vision;
  };

  // Ingestor registry
  const ingestorRegistry = new IngestorRegistry([
    new PlainTextIngestor(),
    new MarkdownIngestor(),
    new HtmlIngestor(),
    new DocxIngestor(),
    new EpubIngestor(),
    new JsPdfIngestor(),
    new VisionPdfIngestor({ visionResolver, pageImageStore }),
  ]);

  const modes = new Map([[teachMode.id, teachMode]]);
  const toolDefinitions = [gradeMathTool, codeSandboxTool, retrieveFromTextbookTool];

  const deps: ServiceDeps = {
    db,
    log,
    modes,
    toolDefinitions,
    toolServices: { sympy, sandbox, vectorStore, ftsStore, embeddings, documents: documentsReader },
  };

  const ingestion = new IngestionService({
    db, log, vectorStore, ftsStore, embeddings, ingestorRegistry, pageImageStore,
  });
  const documentsService = new DocumentsServiceImpl({
    ...deps, vectorStore, ftsStore, pageImageStore,
  });

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

Main process preloads embeddings:
```typescript
services.embeddings.preload().catch((e) => log.warn("embeddings preload failed", e));
```

---

### Unit 15: IPC additions — page image channel + filters wired

**Files**:
- `packages/desktop/electron/main/ipc-server.ts` (modified)
- `packages/client/src/services/{ingest,documents}-client.ts` (modified)

New channel: `praxis.documents.pageImage` returns `{ documentId, page } → Buffer | null` over IPC. Renderer requests it when user clicks "📄 View page".

Existing `praxis.ingest.start` payload accepts `preferIngestorId` (already in v2 design).

```typescript
// ipc-server.ts addition
ipcMain.handle("praxis.documents.pageImage", async (_e, payload: { documentId: string; page: number }) => {
  const buffer = await services.documents.pageImage(payload);
  return buffer ? buffer.toString("base64") : null;  // base64 for IPC transport
});

// client/src/services/documents-client.ts
async pageImage(input: { documentId: string; page: number }): Promise<string | null> {
  return transport.invoke("praxis.documents.pageImage", input);
}
```

The UI consumer decodes base64 → blob → `<img src="data:image/png;base64,...">`.

---

### Unit 16: UI — citation chips, source cards with "View page", document badge

Same as v2 plus:
- **Source card "📄 View page" button** — shown only when `citation.hasPageImage === true`. Click opens a side panel that fetches `client.documents.pageImage(...)` and renders the PNG.
- **Page-image side panel** — new component `<PageImagePanel>` with close button; renders the page image full-size with optional zoom.
- **Document list ingestor badge** — renders ingestor label (e.g., "Markdown", "PDF (vision OCR)") so users see how the doc was processed.
- **PDF picker tier modal** — when user picks `.pdf`, a small modal appears: "Use vision parsing? (better for math + scans; uses your engine's vision capability)". Default = no (JS tier).

```typescript
// New <SourceCard /> additions
{props.citation.hasPageImage && (
  <button
    type="button"
    className={styles.viewPageBtn}
    onClick={() => onViewPage(props.citation.documentId, props.citation.page!)}
  >
    📄 View page {props.citation.page}
  </button>
)}
```

---

### Unit 17: `teach` mode — fragment update for hybrid + filters

```typescript
export const toolsFragment: PromptFragment = {
  id: "tools.available",
  position: "tools",
  customizable: false,
  template: `Tools available:
- grade_math — symbolic math via sympy. Use for ANY arithmetic or algebra; never grade with your own arithmetic.
- code_sandbox — run JavaScript or Python in a sandbox. Use to demonstrate algorithms or verify multi-step computation.
- retrieve_from_textbook — hybrid (semantic + lexical) search of the student's uploaded textbooks. Use for ANY claim that should be grounded in their course material. Filters available: documentIds, sectionPattern (e.g. "chapter 3"), pageRange (e.g. pages 40-50). Use these when the student gives you a hint about where to look.

When you cite from retrieve_from_textbook results, refer to them as [1], [2], [3] in the order they appear. The student's UI renders these as clickable chips that show the source chunk; for vision-parsed PDFs, the source card includes a "View page" button so the student can see the original.

When you make a claim a tool can verify, call the tool. The student sees the tool call — visibility is part of the lesson.`,
};
```

---

### Unit 18: Tests

| Test file | Type | What it tests |
|---|---|---|
| `packages/tools/src/runtime/__tests__/embeddings.test.ts` | unit + slow | Asymmetric encoding: `embedQuery` ≠ `embed` for same text. |
| `packages/tools/src/runtime/__tests__/sqlite-vec-store.test.ts` | unit, fast (real sqlite-vec) | Filter combinations: documentIds, sectionPattern, pageRange. |
| `packages/tools/src/runtime/__tests__/sqlite-fts-store.test.ts` | unit, fast | BM25 search; filter combos; query sanitization. |
| `packages/tools/src/retrieval/__tests__/rrf.test.ts` | unit, fast | RRF math; both-list bonus; ordering; topK truncation. |
| `packages/tools/src/retrieval/__tests__/retrieve-from-textbook.test.ts` | unit, fast | Hybrid path with mocked stores; filters propagate; embedQuery used; hasPageImage flag. |
| `packages/tools/src/runtime/ingestion/__tests__/vision-pdf-ingestor.test.ts` | unit, fast | Saves page images when store provided; uses VISION_PROMPT; aborts on signal. |
| `packages/tools/src/runtime/ingestion/__tests__/vision-prompt.test.ts` | unit, fast | Snapshot of prompt contents. |
| `packages/core/src/__tests__/page-images.test.ts` | unit, fast (real fs in temp dir) | Save / read / delete by docId; default base dir per OS. |
| `packages/core/src/__tests__/ingestion-service.test.ts` | unit, fast | Both indexes written; page-image rename runs; abort cleanup. |
| `packages/core/src/__tests__/documents-service.test.ts` | unit, fast | delete cleans vectors + FTS + images + row. |
| `packages/desktop/src/__tests__/ipc-server.test.ts` (extended) | unit | praxis.documents.pageImage handler; base64 round-trip. |
| `packages/ui/src/__tests__/source-card.test.tsx` | unit, fast | "View page" button only shown when hasPageImage; click triggers fetch. |
| `tests/textbook-rag-end-to-end.test.ts` | integration | Real sqlite-vec + real FTS5 + mocked embeddings on a fixture. Ingest → hybrid retrieve → citations correctly ranked; documents.delete cleans everything. |

Slow tests (real embedding model load, real vision calls against fixture PDFs) gated behind `PRAXIS_RUN_SLOW_TESTS=1`.

---

## Implementation Order

1. **Unit 1** — Type contracts.
2. **Unit 2** — EngineConfigSchema vision validation.
3. **Unit 3** — Per-engine vision (3 sub-units, parallelizable).
4. **Unit 4** — Ingestor port + registry.
5. **Unit 5** — vision-prompt.ts.
6. **Unit 6** — Six default JS-tier ingestors (parallelizable).
7. **Unit 7** — VisionPdfIngestor + page-images.ts (depends on Units 3, 5).
8. **Unit 8** — LocalEmbeddingService with embedQuery.
9. **Unit 9** — SqliteVecStore (extended) + SqliteFtsStore + initFtsStore.
10. **Unit 10** — RRF helper.
11. **Unit 11** — IngestionService (dual-index + page-image rewrite).
12. **Unit 12** — retrieve_from_textbook (hybrid + filters).
13. **Unit 13** — DocumentsService extensions.
14. **Unit 14** — ServiceDeps + buildServices wiring.
15. **Unit 15** — IPC + client additions.
16. **Unit 16** — UI: source card View Page, page-image panel, picker tier modal.
17. **Unit 17** — teach mode + tools fragment.
18. **Unit 18** — Tests interspersed.

---

## Verification

```bash
# Existing fast lane
pnpm install && pnpm typecheck && pnpm lint && pnpm test

# Slow lane (real embedding + vision)
PRAXIS_RUN_SLOW_TESTS=1 pnpm test

pnpm desktop:build && pnpm dev    # manual M1+ test

# Manual test checkpoint (Phase 5)
# 1. Drop a .md file (notes) → indexed in <1 sec; appears with "Markdown" badge
# 2. Drop a .docx (handout) → indexed; "Word document" badge
# 3. Drop a .epub (textbook) → indexed in seconds; "EPUB ebook" badge
# 4. Drop a .pdf → choose "text layer" → indexed in seconds; "PDF (text layer)" badge
# 5. Drop the same .pdf, choose "vision OCR" → slower (vision per page); "PDF (vision OCR)" badge
# 6. Ask: "what does the textbook say about ATP synthase?"
#    Watch hybrid retrieval: vector finds semantically similar chunks; BM25 finds exact term matches; RRF fuses.
# 7. Watch assistant stream with [1] [2] chips → click [1] → scrolls to source card
# 8. For vision-parsed citation: click "📄 View page" → side panel shows the rendered page
# 9. Ask: "from chapter 3, explain photosynthesis" — agent passes sectionPattern: "chapter 3"
# 10. pnpm db:episodic shows tool_call(retrieve_from_textbook) + tool_result with citations
# 11. Verify the active tutoring session's prompt cache wasn't polluted by vision OCR
```

---

## Out of scope (explicit list)

- **Local Marker (Python sidecar)** — see `docs/ROADMAP.md` "Future enhancements"
- **Embedded image extraction (Option C)** — Phase 13, alongside the broader visual-content work
- `.pptx`, `.rtf`, raw images — defer
- PDF page rendering for JS-tier ingested PDFs — only vision-tier saves page images
- Hybrid-search re-ranking with the model — let the agent re-rank implicitly
- pgvector adapter — Phase 15
- Cloud-only OCR providers — vision goes through the configured engine
- Concept extraction — Phase 6
- Batched/parallel vision calls for large PDFs — serial in Phase 5; future polish

## Notes for the implementer

- **Patterns referenced**: `engine-session-lifecycle` (vision uses fresh one-shot, distinct from active session), `tool-dispatch-pipeline` (retrieve follows it), `ipc-channel-convention` (new channels), `service-deps-injection` (new toolServices fields), `temp-db-test-helper` (DB tests), `slow-test-gating` (embeddings + vision real-call tests).
- **Vision call isolation is critical** — every vision call MUST use a fresh SDK session. Audit before merging that no implementation accidentally reuses a Conversation/Thread.
- **`canvas` native dep** for VisionPdfIngestor — needs `electron-rebuild` like isolated-vm. Update the desktop postinstall to include canvas.
- **`@huggingface/transformers` v4** — add to `@praxis/tools` deps; lazy-imported inside LocalEmbeddingService to keep test suites fast.
- **`pdfjs-dist`** — use the `legacy/build/pdf.mjs` entry point in Node (the default entry is browser-targeted).
- **No Python in Phase 5.** SPEC.md still documents the future Python sidecar boundary; no code lives there yet.
- **FTS5 query escaping**: the `SqliteFtsStore` strips quotes and parens from user queries. If a user types punctuation in a search, it becomes whitespace. This is fine for typical natural-language queries.
- **Page-image storage location** is configurable via `PRAXIS_PAGE_IMAGES_DIR` env var (useful for tests and for users who want to put it on a different disk).
- **RRF constant `k=60`** is the standard from the original Cormack paper. Don't change without benchmarking.
