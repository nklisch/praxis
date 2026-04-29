# Design: Phase 5 — Multi-Format Document RAG (with Native Engine Vision)

> **Revision history**
> - v1 (a11cbba) — initial design centered on Marker via Python sidecar with `praxis-cli`
> - **v2 (this) — Marker deferred to post-v1; multi-format JS ingestor tier (txt/md/html/docx/epub/pdf-text-layer); vision tier using configured engine's native vision via pass-through (Claude Code, Codex, Direct all supported); vision uses fresh one-shot SDK calls per page so the tutoring conversation's history and prompt cache stay clean; engine config validation enforces vision-capable models**

## Overview

Phase 5 lets a student drop almost any common study document into Praxis and ask questions about its contents — typed notes, class handouts, web articles, ebooks, PDFs — with cited answers. The architecture has three layers:

1. **An `Ingestor` port** with a registry that dispatches by file type. Each format gets a small, focused ingestor.
2. **A `VectorStore` port** with a `sqlite-vec` adapter, plus local embedding via `@huggingface/transformers` v4. Both run in-process; no Python required for Phase 5.
3. **Native engine vision** via a `VisionCapability` on the `Engine` interface. Each adapter implements vision differently — Direct via Vercel AI SDK image content, Claude Code and Codex via pass-through using their SDKs' native file-reading tools so the user's CLI subscription handles billing. **Vision calls use fresh one-shot SDK sessions** so the active tutoring conversation's history and prompt cache are not polluted by ingestion work.

After Phase 5: drag any of `.txt`, `.md`, `.html`, `.docx`, `.epub`, `.pdf` into the chat sidebar. Modern text-layer PDFs and prose docs index in seconds via the JS tier. For math-heavy or scanned PDFs, choose the "vision parsing" toggle — the engine the user already has configured does the OCR via its native vision capability, no separate API key needed. Ask "what does chapter 3 say about respiration?" → the assistant streams an answer with `[1]` `[2]` chips that scroll to source cards rendered below the message.

**What ships:**

- Type contracts: `Ingestor`, `IngestorResult`, `IngestorRegistry`, `VectorStore`, `EmbeddingService`, `Citation`, `IngestionEvent`, `VisionCapability` interfaces
- Engine config validation: `EngineConfigSchema` enforces that selected models are vision-capable; provider-specific allow-lists with sensible defaults
- `VisionCapability` added to `Engine` interface (optional field)
- Per-adapter vision implementations:
  - `DirectEngine.vision` — Vercel AI SDK `generateText` with image content blocks; one-shot per call
  - `ClaudeCodeEngine.vision` — pass-through via `query()` (one-shot) with images written to a temp dir, prompted via `Read` tool; the user's Claude CLI subscription bills the call
  - `CodexEngine.vision` — pass-through via a transient `codex.startThread()` with image attachment; the user's Codex subscription bills the call
- Six default ingestors in `@praxis/tools/runtime/ingestion/`:
  - `PlainTextIngestor` (.txt) — paragraph chunking
  - `MarkdownIngestor` (.md, .markdown) — heading-aware chunking via `marked`
  - `HtmlIngestor` (.html, .htm) — `@mozilla/readability` strips chrome, then chunks
  - `DocxIngestor` (.docx) — `mammoth.js` → HTML + heading detection
  - `EpubIngestor` (.epub) — `epub2` chapter-by-chapter extraction
  - `JsPdfIngestor` (.pdf) — `pdfjs-dist` text-layer extraction (default for PDF)
- Vision ingestor: `VisionPdfIngestor` — pdfjs-dist renders pages → `engine.vision.describe` per page (or per batch); tier-up for scans / math-heavy PDFs
- `IngestorRegistry` dispatches by mime type / extension; user can override per-document in UI
- `LocalEmbeddingService` (HF transformers v4, bge-small-en-v1.5, 384d), lazy + preloaded
- `SqliteVecStore` + `initVectorStore` (sqlite-vec virtual table)
- `IngestionService` thin orchestrator: pick ingestor → run → persist → embed in batches → stream progress
- `retrieve_from_textbook` tool (tier: `"grounded"`)
- `DocumentsService` (read + delete) and `IngestionClient` for IPC
- IPC: `praxis.ingest.*` (streamed), `praxis.documents.*`
- UI: file picker (broad extension list), document list sidebar, ingestion progress modal, citation chips + expandable source cards in chat
- `teach` mode: add `retrieve_from_textbook` to `toolNames`; tools fragment teaches `[N]` citation convention

**What does not ship (deferred):**

- **Local Marker (Python sidecar)** — see `docs/ROADMAP.md` "Future enhancements" section for the trigger to revisit
- `.pptx`, `.rtf`, raw images — out of Phase 5 format set
- PDF page image rendering in citation cards (text + page number only)
- Hybrid keyword+vector search (pure vector for v1)
- pgvector adapter (Phase 15)
- Cloud-only OCR providers (Mistral, Mathpix, Textract) — vision goes through the configured engine, not third-party services
- Concept extraction / draft course bootstrap (Phase 6)

## Why these choices

**Why drop Marker from Phase 5.** Marker requires PyTorch + ~2 GB model downloads + 4-6 GB VRAM at peak. On Apple Silicon or a discrete NVIDIA GPU it's ~3-10 minutes per textbook (good UX). On Intel laptops with integrated graphics it falls back to CPU at 30 min – 2 hours per textbook (unusable). For a tutoring product targeting students broadly, that's a meaningful population we'd shut out. The roadmap captures it as a power-user post-v1 enhancement; the `Ingestor` port we're shipping makes it a self-contained add-on later (one new ingestor + the Python sidecar package).

**Why pass-through vision instead of separate API key.** SPEC.md already commits to "Vision via the engine adapter's model. No third-party OCR." Phase 5 makes that concrete. Users on Claude Code or Codex CLI subscriptions get vision OCR billed against their existing subscription (no separate setup). Direct users use whatever provider they configured. Zero new credential surface.

**Why one-shot vision calls.** A 300-page textbook OCR pass would dump huge image content into the active tutoring conversation if we used the long-lived `EngineSession`. That destroys prompt-cache hits, pollutes the model's view of the conversation, and likely overflows context. Vision calls open a separate fresh session per page (or per batch), drain the response, close. The active tutoring `EngineSession` is untouched.

**Why require vision-capable models in engine config.** Multiple Phase 5+ features need vision: PDF ingestion via vision tier (this phase), handwritten math OCR (Phase 13), sketched concept maps (Phase 13). A user who selects a text-only model can't use these. Better to require vision at config time with a clear "this model doesn't support vision; pick from this list" error than to silently break later features.

## Scope and assumptions

- **Local-only embeddings.** `@huggingface/transformers` v4 with `Xenova/bge-small-en-v1.5` (384-dim). Lazy-loaded singleton, preloaded at app startup.
- **Vision uses the configured engine's native model.** No third-party OCR API. No separate API key surface. Pass-through pattern for Claude Code / Codex; native image content for Direct.
- **Vision calls are isolated.** Each `engine.vision.describe(...)` opens a fresh underlying SDK session — no relation to the active tutoring `EngineSession`. Vision calls don't appear in the conversation history. Vision calls don't share prompt cache with the tutoring session (and shouldn't — they're transient).
- **Engine config requires vision-capable models.** `EngineConfigSchema.parse` validates that the model is on the per-provider vision allow-list. Defaults are vision-capable. `setEngineConfig` rejects non-vision models with a clear error message. Settings UI shows only vision-capable model options.
- **Ingestor selection.** `IngestorRegistry` selects by mime type first, falling back to file extension. For PDFs specifically, multiple ingestors apply (`JsPdfIngestor` + `VisionPdfIngestor`); the request specifies which to use. Default for `.pdf` is `JsPdfIngestor`; user toggles to vision in the UI for math-heavy / scanned PDFs.
- **`sqlite-vec` virtual table created programmatically.** `initVectorStore(sqlite)` runs after Drizzle migrations. The extension is ABI-independent — no `electron-rebuild` for it.
- **Citation format.** Assistant emits `[1]`, `[2]`, `[3]` references. UI parses these from `model_message` content and renders as clickable chips that scroll to source cards rendered below the message.
- **Per-student ingestion.** Documents scoped to the singleton default student.
- **Slow tests gated behind `PRAXIS_RUN_SLOW_TESTS=1`** — real embedding model load, real PDF parsing of a sample fixture.

## Dependency direction (Phase 5 additions; no violations)

```
@praxis/core/types/engine.ts
  └─ NEW: VisionCapability interface; Engine.vision optional field

@praxis/core/config (existing)
  └─ EngineConfigSchema validates vision-capable models per provider

@praxis/tools/runtime/ingestion/    (NEW directory)
  ├─ Ingestor interface
  ├─ IngestorRegistry
  └─ Six default ingestors + VisionPdfIngestor

@praxis/tools/runtime/embeddings.ts (NEW)
  └─ LocalEmbeddingService

@praxis/tools/runtime/sqlite-vec-store.ts (NEW)
  └─ SqliteVecStore

@praxis/core/ingestion/           (NEW directory)
  └─ IngestionService thin orchestrator

@praxis/core/services additions    (Phase 3 exception unchanged)
  ├─ DocumentsServiceImpl
  └─ DrizzleDocumentsReader

@praxis/engines/{direct,claude-code,codex}/vision.ts (NEW per adapter)
  └─ Each adapter implements VisionCapability for its SDK

@praxis/desktop                    (additions)
  ├─ IPC: praxis.ingest.*, praxis.documents.*
  └─ buildServices wires new pieces

@praxis/ui                         (additions)
  ├─ Document list sidebar
  ├─ Ingestion progress modal
  └─ Citation chips + source cards
```

**No Python in Phase 5.** The `python/praxis-cli/` directory does not exist after this phase. SPEC.md's "single language boundary" still describes the future shape if/when Marker (or any other heavy ML tool) lands.

---

## Implementation Units

### Unit 1: Type contract additions

**File**: `packages/core/src/types/engine.ts` (modified)
**File**: `packages/core/src/types/citation.ts` (new)
**File**: `packages/core/src/types/ingestion.ts` (new)
**File**: `packages/core/src/types/tool.ts` (modified — `vectorStore`, `embeddings`, `documents` become concrete)

```typescript
// packages/core/src/types/engine.ts — additions

import type { TokenUsage } from "./common.js";

export interface ImageInput {
  /** Image data as base64 (no data: prefix) OR a remote https URL. */
  data: string;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

export interface VisionDescribeRequest {
  /** Instruction for the model — what to extract from the image(s). */
  prompt: string;
  /** One or more images to analyze. Adapters may batch or call serially. */
  images: ReadonlyArray<ImageInput>;
  /** Soft cap on response length. */
  maxTokens?: number;
}

export interface VisionDescribeResponse {
  text: string;
  usage?: TokenUsage;
}

/**
 * Vision capability — extract text/structure from images. Each call opens a
 * fresh underlying SDK session (one-shot), so the active tutoring EngineSession's
 * conversation history and prompt cache are NOT affected. Use this for one-off
 * vision tasks like PDF page OCR, handwritten math OCR (Phase 13), etc.
 */
export interface VisionCapability {
  describe(req: VisionDescribeRequest): Promise<VisionDescribeResponse>;
}

export interface Engine {
  readonly id: string;
  readonly kind: "looped" | "single-shot";
  open(opts: EngineOpenOptions): Promise<EngineSession>;
  health(): Promise<HealthStatus>;
  /**
   * Optional vision capability. When undefined, the engine doesn't support
   * vision input. Callers (e.g., VisionPdfIngestor) check before using.
   * Phase 5 ships vision for all three engines via per-adapter implementations
   * (Direct via Vercel image content; Claude Code + Codex via pass-through to
   * their SDKs' native file-reading + vision-capable underlying models).
   */
  readonly vision?: VisionCapability;
}
```

```typescript
// packages/core/src/types/citation.ts — new

export interface Citation {
  /** 1-based index for the model to reference as [1], [2], etc. */
  index: number;
  documentId: string;
  documentTitle: string;
  chunkId: string;
  chunkText: string;
  page?: number;
  section?: string;
  /** Cosine distance from the query (informational; results pre-sorted). */
  distance: number;
}

export interface RetrievalResult {
  query: string;
  citations: Citation[];
}
```

```typescript
// packages/core/src/types/ingestion.ts — new

export type IngestionEvent =
  | { type: "start"; documentId: string; filename: string }
  | { type: "ingestor_selected"; ingestorId: string; ingestorLabel: string }
  | { type: "parsing"; message: string }                       // indeterminate
  | { type: "vision_page"; page: number; totalPages: number }  // for VisionPdfIngestor only
  | { type: "parsed"; chunkCount: number }
  | { type: "embedding"; chunksProcessed: number; totalChunks: number }
  | { type: "done"; documentId: string; chunkCount: number }
  | { type: "error"; error: { code: string; message: string; recoverable: boolean } };

export interface IngestionRequest {
  filePath: string;
  filename: string;
  mimeType: string;
  studentId: string;
  /** Override ingestor selection. Default: registry auto-selects. */
  preferIngestorId?: string;  // e.g. "vision-pdf" to force vision parsing on a PDF
}
```

```typescript
// packages/core/src/types/tool.ts — concretize Phase 5 fields

export interface ToolServices {
  memory: unknown;       // → Phase 7
  artifacts: unknown;    // → Phase 6
  vectorStore: VectorStore;       // ← Phase 5
  sandbox: CodeSandbox;
  sympy: SymPyService;
  embeddings: EmbeddingService;   // ← Phase 5 (new field)
  documents: DocumentsReader;     // ← Phase 5 (new field)
  pedagogyPack: unknown; // → Phase 14
}

// EmbeddingService, VectorStore (with VectorUpsertInput, VectorSearchInput,
// VectorSearchResult), DocumentsReader — same shapes as v1 of the design.
// See appendix at end of doc for verbatim if useful; nothing changed for these.
```

**Acceptance Criteria**:
- [ ] `VisionCapability` typechecks; `Engine.vision` is optional.
- [ ] `IngestionEvent` has the `ingestor_selected` and `vision_page` variants (new vs v1).
- [ ] `ToolServices.vectorStore`, `.embeddings`, `.documents` are concrete; rest stays `unknown`.
- [ ] All existing Phase 1-4 tests typecheck (the new `Engine.vision?` field is optional so doesn't break existing engines until they're updated).

---

### Unit 2: `EngineConfigSchema` vision-capable validation

**File**: `packages/core/src/config/schema.ts` (modified)
**File**: `packages/core/src/config/vision-models.ts` (new — per-provider allow-lists + helpers)
**File**: `packages/core/src/__tests__/engine-config.test.ts` (extended)

**`packages/core/src/config/vision-models.ts`** (new):

```typescript
/**
 * Per-provider lists of vision-capable model IDs. Praxis enforces vision
 * support at engine config time so later features (PDF vision ingestion,
 * Phase 13 handwriting OCR) don't silently fail. Lists are conservative —
 * include only models confirmed vision-capable as of April 2026.
 *
 * The Claude Code and Codex CLI engines are treated as vision-capable
 * unconditionally because their SDKs use vision-capable models by default
 * and the user can't easily downgrade through Praxis.
 */

export const VISION_MODELS: Record<string, ReadonlyArray<string>> = {
  "direct.anthropic": [
    "claude-sonnet-4-5",
    "claude-opus-4-5",
    "claude-haiku-4-5",
    "claude-3-5-sonnet-latest",
    "claude-3-5-sonnet-20241022",
    "claude-3-opus-20240229",
    "claude-3-5-haiku-latest",
    // Pattern matches: any "claude-*-sonnet-*", "claude-*-opus-*", "claude-3-5-haiku-*", "claude-4-*-haiku"
    // (see isVisionCapable() for substring fallbacks)
  ],
  "direct.openai": [
    "gpt-5",
    "gpt-5-mini",
    "gpt-4.1",
    "gpt-4o",
    "gpt-4o-mini",
    "gpt-4-turbo",
    "gpt-4-vision-preview",
  ],
  "direct.google": [
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
  ],
  "direct.ollama": [
    // Ollama vision models — user must pick one of these (or compatible local model)
    "llava",
    "llava:13b",
    "llava:34b",
    "bakllava",
    "llama3.2-vision",
    "llama3.2-vision:11b",
    "llama3.2-vision:90b",
    "qwen2-vl",
    "qwen2.5-vl",
    "moondream",
  ],
};

/**
 * Default model per engine ID — guaranteed vision-capable. Used when the
 * user hasn't explicitly chosen a model. New users land on these.
 */
export const DEFAULT_VISION_MODEL: Record<string, string> = {
  "direct.anthropic": "claude-sonnet-4-5",
  "direct.openai": "gpt-4o",
  "direct.google": "gemini-2.5-flash",
  "direct.ollama": "llama3.2-vision",
};

/**
 * Engine IDs that don't have a "model" field validated by Praxis (the SDK
 * picks the model). For these, Praxis trusts the SDK to use a vision-capable
 * model (which is the default for both Claude Code and Codex in 2026).
 */
const ENGINE_TRUSTS_SDK_MODEL = new Set(["claude-code", "codex"]);

export function requiresVisionModelValidation(engineId: string): boolean {
  return !ENGINE_TRUSTS_SDK_MODEL.has(engineId);
}

/**
 * Check whether a (engineId, model) combination supports vision. For Direct
 * engines, validates against the per-provider list with a substring fallback
 * for forward-compat (e.g. unreleased model variants whose names match a
 * known pattern).
 */
export function isVisionCapable(engineId: string, model: string | undefined): boolean {
  if (ENGINE_TRUSTS_SDK_MODEL.has(engineId)) return true;
  if (!model) return false;  // Direct engine without a model isn't usable for vision

  const allowed = VISION_MODELS[engineId];
  if (!allowed) return false;
  if (allowed.includes(model)) return true;

  // Forward-compat: substring match for known vision-friendly patterns per provider.
  switch (engineId) {
    case "direct.anthropic":
      return /claude-(\d+(\.\d+)?-)?(sonnet|opus|haiku)/.test(model);
    case "direct.openai":
      return /gpt-(4|5)/i.test(model);
    case "direct.google":
      return /gemini-([12]\.\d+|[3-9])/i.test(model);
    case "direct.ollama":
      return /llava|vision|moondream|qwen.*vl/i.test(model);
    default:
      return false;
  }
}

/** Human-readable list of valid models for an engine (used in error messages + UI). */
export function visionCapableModelsFor(engineId: string): ReadonlyArray<string> {
  if (ENGINE_TRUSTS_SDK_MODEL.has(engineId)) return [];
  return VISION_MODELS[engineId] ?? [];
}
```

**`packages/core/src/config/schema.ts`** modifications:

```typescript
import { z } from "zod";
import { isVisionCapable, visionCapableModelsFor, DEFAULT_VISION_MODEL } from "./vision-models.js";

export const ENGINE_IDS = [
  "claude-code",
  "codex",
  "direct.anthropic",
  "direct.openai",
  "direct.google",
  "direct.ollama",
] as const;

export const EngineIdSchema = z.enum(ENGINE_IDS);
export type EngineId = z.infer<typeof EngineIdSchema>;

const baseEngineConfig = z.object({
  engineId: EngineIdSchema,
  model: z.string().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  effort: z.enum(["minimal", "low", "medium", "high", "xhigh"]).optional(),
});

export const EngineConfigSchema = baseEngineConfig.superRefine((cfg, ctx) => {
  if (!isVisionCapable(cfg.engineId, cfg.model)) {
    const allowed = visionCapableModelsFor(cfg.engineId);
    const example = allowed.slice(0, 3).join(", ") || "(no presets — see provider docs)";
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Praxis requires a vision-capable model. ${cfg.engineId} with model "${cfg.model ?? "(default)"}" is not vision-capable. Try one of: ${example}.`,
      path: ["model"],
    });
  }
});

export type EngineConfig = z.infer<typeof EngineConfigSchema>;

export const DEFAULT_ENGINE_CONFIG: EngineConfig = { engineId: "claude-code" };
//  ^^ "claude-code" is treated as trusted (uses vision-capable default model in CLI). Validates.
```

**Implementation Notes**:
- `claude-code` and `codex` skip model validation — their CLIs use vision-capable defaults and Praxis can't easily verify the user's CLI config.
- For Direct engines, `model` is required AND must be vision-capable. Old configs in `config_kv` that don't specify a model fail to parse — `readEngineConfig` should fall back to `DEFAULT_ENGINE_CONFIG` on parse error and log a warning.
- Settings UI updates: each Direct provider shows a model dropdown listing only vision-capable models from `visionCapableModelsFor(engineId)`.

**Acceptance Criteria**:
- [ ] `EngineConfigSchema.parse({ engineId: "claude-code" })` succeeds (no model validation).
- [ ] `EngineConfigSchema.parse({ engineId: "direct.anthropic", model: "claude-sonnet-4-5" })` succeeds.
- [ ] `EngineConfigSchema.parse({ engineId: "direct.anthropic", model: "claude-instant-1" })` fails with vision-capability error.
- [ ] `EngineConfigSchema.parse({ engineId: "direct.openai" })` fails (no model + Direct → must specify).
- [ ] `EngineConfigSchema.parse({ engineId: "direct.openai", model: "gpt-3.5-turbo" })` fails.
- [ ] `EngineConfigSchema.parse({ engineId: "direct.openai", model: "gpt-5-future-variant-x" })` succeeds via substring fallback.
- [ ] `setEngineConfig` validates and rejects non-vision configs.
- [ ] On config_kv parse failure, `readEngineConfig` returns `DEFAULT_ENGINE_CONFIG` and logs.

---

### Unit 3: Per-engine `VisionCapability` implementations

**Files**:
- `packages/engines/src/direct/vision.ts` (new)
- `packages/engines/src/claude-code/vision.ts` (new)
- `packages/engines/src/codex/vision.ts` (new)
- Each adapter's `adapter.ts` populates the `vision` field on construction
- `packages/engines/src/__tests__/{direct,claude-code,codex}-vision.test.ts` (new)

**Common pattern**: each `VisionCapability` implementation opens a **fresh, transient SDK session per call** — never reuses the active tutoring `Conversation` / `Thread`. This keeps the tutoring session's prompt cache and conversation history clean.

**`packages/engines/src/direct/vision.ts`** (Direct adapter — Vercel AI SDK image content):

```typescript
import { generateText } from "ai";
import type { VisionCapability, VisionDescribeRequest, VisionDescribeResponse } from "@praxis/core/types";
import type { EngineConfig } from "@praxis/core/config";
import { resolveModel, type DirectProvider } from "./providers.js";

export class DirectVision implements VisionCapability {
  constructor(
    private readonly provider: DirectProvider,
    private readonly config: EngineConfig,
  ) {}

  async describe(req: VisionDescribeRequest): Promise<VisionDescribeResponse> {
    const model = resolveModel(this.provider, this.config);
    const result = await generateText({
      model,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: req.prompt },
          ...req.images.map((img) => ({
            type: "image" as const,
            // Vercel SDK accepts data URLs OR raw base64 with mimeType.
            image: `data:${img.mimeType};base64,${img.data}`,
          })),
        ],
      }],
      ...(req.maxTokens !== undefined && { maxTokens: req.maxTokens }),
    });
    return {
      text: result.text,
      usage: { inputTokens: result.usage?.inputTokens ?? 0, outputTokens: result.usage?.outputTokens ?? 0 },
    };
  }
}
```

**`packages/engines/src/claude-code/vision.ts`** (Claude Code — pass-through via temp files + one-shot `query`):

```typescript
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v7 as uuidv7 } from "uuid";
import { collectResult, query } from "@nklisch/claude-cli-sdk";
import type { VisionCapability, VisionDescribeRequest, VisionDescribeResponse } from "@praxis/core/types";

/**
 * Pass-through vision via Claude Code SDK. Writes images to a temp dir,
 * spawns a one-shot `query` (NOT a long-lived Conversation), the underlying
 * Claude model uses its Read tool to access the image files and applies its
 * native vision. The user's Claude CLI subscription bills the call. The
 * temp dir is cleaned up after.
 *
 * Each call is fully isolated — no shared state with the tutoring session.
 */
export class ClaudeCodeVision implements VisionCapability {
  async describe(req: VisionDescribeRequest): Promise<VisionDescribeResponse> {
    const tempDir = join(tmpdir(), `praxis-vision-${uuidv7()}`);
    await mkdir(tempDir, { recursive: true });
    const filePaths: string[] = [];
    try {
      // Materialize each image to a file
      for (let i = 0; i < req.images.length; i++) {
        const img = req.images[i];
        if (!img) continue;
        const ext = img.mimeType === "image/png" ? "png" : img.mimeType === "image/jpeg" ? "jpg" : "webp";
        const path = join(tempDir, `image-${i}.${ext}`);
        await writeFile(path, Buffer.from(img.data, "base64"));
        filePaths.push(path);
      }

      const fullPrompt = [
        "Read the following image file(s) using the Read tool, then complete the task.",
        "Image files:",
        ...filePaths.map((p) => `- ${p}`),
        "",
        "Task:",
        req.prompt,
        "",
        "Return ONLY the requested content. No commentary, no preamble, no acknowledgment of the task.",
      ].join("\n");

      const result = await collectResult(
        query(fullPrompt, {
          workDir: tempDir,
          maxTurns: Math.max(2, req.images.length + 1),  // one Read per image + one response turn
          // No session persistence — this is a pure one-shot
          noSessionPersistence: true,
        }),
      );

      return {
        text: result.result ?? "",
        usage: result.usage
          ? { inputTokens: result.usage.inputTokens, outputTokens: result.usage.outputTokens }
          : undefined as never,  // omit when missing per exactOptionalPropertyTypes
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
```

**`packages/engines/src/codex/vision.ts`** (Codex — pass-through via transient thread + image input):

```typescript
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { v7 as uuidv7 } from "uuid";
import { Codex } from "@openai/codex-sdk";
import type { VisionCapability, VisionDescribeRequest, VisionDescribeResponse } from "@praxis/core/types";
import type { EngineConfig } from "@praxis/core/config";

/**
 * Pass-through vision via Codex SDK. Codex's Input type supports
 * `{ type: "local_image", path }` natively. Each call uses a transient
 * thread (startThread + run + drop reference). The user's Codex
 * subscription handles billing.
 */
export class CodexVision implements VisionCapability {
  constructor(private readonly config: EngineConfig) {}

  async describe(req: VisionDescribeRequest): Promise<VisionDescribeResponse> {
    const tempDir = join(tmpdir(), `praxis-vision-${uuidv7()}`);
    await mkdir(tempDir, { recursive: true });
    try {
      const inputs: Array<{ type: "text"; text: string } | { type: "local_image"; path: string }> = [
        { type: "text", text: `${req.prompt}\n\nReturn ONLY the requested content. No preamble.` },
      ];
      for (let i = 0; i < req.images.length; i++) {
        const img = req.images[i];
        if (!img) continue;
        const ext = img.mimeType === "image/png" ? "png" : img.mimeType === "image/jpeg" ? "jpg" : "webp";
        const path = join(tempDir, `image-${i}.${ext}`);
        await writeFile(path, Buffer.from(img.data, "base64"));
        inputs.push({ type: "local_image", path });
      }

      const codex = new Codex({
        ...(this.config.apiKey !== undefined && { apiKey: this.config.apiKey }),
        ...(this.config.baseUrl !== undefined && { baseUrl: this.config.baseUrl }),
        // No mcp_servers — vision call doesn't need tools
      });
      const thread = codex.startThread({
        ...(this.config.model !== undefined && { model: this.config.model }),
        approvalPolicy: "never",
        sandboxMode: "read-only",
        skipGitRepoCheck: true,
      });
      const turn = await thread.run(inputs);

      // Concatenate any agent_message items into the response text.
      const text = (turn.items ?? [])
        .filter((it): it is Extract<typeof it, { type: "agent_message" }> => it.type === "agent_message")
        .map((it) => it.text)
        .join("\n")
        .trim() || turn.finalResponse || "";

      return {
        text,
        usage: turn.usage
          ? { inputTokens: turn.usage.input_tokens, outputTokens: turn.usage.output_tokens }
          : undefined as never,
      };
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
```

**Adapter wiring**:

```typescript
// packages/engines/src/direct/adapter.ts (modified — populate vision)
export class DirectEngine implements Engine {
  readonly id: string;
  readonly kind = "single-shot" as const;
  readonly vision: VisionCapability;

  constructor(opts: DirectEngineOptions) {
    this.opts = opts;
    this.id = `direct.${opts.provider}`;
    this.vision = new DirectVision(opts.provider, opts.config);
  }
  // ... open(), health() unchanged
}

// packages/engines/src/claude-code/adapter.ts
export class ClaudeCodeEngine implements Engine {
  readonly vision = new ClaudeCodeVision();
  // ...
}

// packages/engines/src/codex/adapter.ts
export class CodexEngine implements Engine {
  readonly vision: VisionCapability;
  constructor(opts: CodexEngineOptions) {
    this.opts = opts;
    this.vision = new CodexVision(opts.config);
  }
  // ...
}
```

**Implementation Notes**:
- **Each vision call is fully isolated.** Direct uses a fresh `generateText` (no shared messages); Claude Code uses `query()` (one-shot, NOT `createConversation`); Codex uses `startThread()` for the call and drops the reference. None of them touch the active tutoring session.
- **Temp file cleanup** in `finally` blocks for Claude Code and Codex (both write image files to disk because their SDKs route via file paths).
- **Claude Code SDK options**: `noSessionPersistence: true` to avoid Claude leaving session breadcrumbs on disk for vision calls; `workDir` scopes the Read tool to the temp dir.
- **Codex SDK Input format**: confirmed in research — `{ type: "local_image", path }` is the SDK's native shape for image attachments.
- **Mocking in tests**: test files use the same `vi.mock` SDK approach as Phase 2 conformance suite. Each adapter's vision tests assert (a) fresh SDK call per `describe()`, (b) no shared state, (c) correct response mapping, (d) temp dir cleanup on success and failure.

**Acceptance Criteria**:
- [ ] `directEngine.vision.describe({ prompt, images })` calls `generateText` once per call (verified via mock); image content blocks include each image as data URL.
- [ ] `claudeCodeEngine.vision.describe(...)` writes images to a temp dir, calls `query` once with `noSessionPersistence: true`, removes the temp dir after (assert via spy).
- [ ] `codexEngine.vision.describe(...)` calls `codex.startThread().run()` with `local_image` inputs, no MCP servers configured, removes temp dir after.
- [ ] Failure path: vision call throws → temp dir still removed (verify via spy on `rm`).
- [ ] No vision call mutates the engine's active `EngineSession` state (assert by checking session map size remains 0 in test).

---

### Unit 4: `Ingestor` port + `IngestorRegistry`

**Files**:
- `packages/tools/src/runtime/ingestion/ingestor.ts` (new — interface + types)
- `packages/tools/src/runtime/ingestion/registry.ts` (new — dispatcher)
- `packages/tools/src/runtime/ingestion/index.ts` (new — re-exports)
- `packages/tools/src/runtime/ingestion/__tests__/registry.test.ts` (new)

```typescript
// packages/tools/src/runtime/ingestion/ingestor.ts

export interface Ingestor {
  /** Stable identifier — used by IngestionRequest.preferIngestorId and persisted as a badge on the Document row. */
  readonly id: string;
  /** Human-readable label for the UI (e.g. "PDF (text layer)" or "PDF (vision OCR)"). */
  readonly label: string;
  /** File extensions handled (lowercase, with dot, e.g. ".pdf"). */
  readonly extensions: ReadonlyArray<string>;
  /** Mime types handled. */
  readonly mimeTypes: ReadonlyArray<string>;
  /** Whether this ingestor is currently usable. e.g. VisionPdfIngestor returns false when engine has no .vision. */
  isAvailable(): Promise<boolean>;
  /** Parse the file and produce ordered chunks. Caller persists the result. */
  parse(filePath: string, opts?: IngestorOptions): Promise<IngestorResult>;
}

export interface IngestorOptions {
  /** Soft cap per chunk (chars). Default 2000. */
  maxChars?: number;
  signal?: AbortSignal;
  /**
   * Per-page progress callback (optional). Vision ingestors invoke this so
   * the IngestionService can stream page-by-page progress to the UI.
   */
  onPageProgress?: (page: number, totalPages: number) => void;
}

export interface IngestorResult {
  /** Document title if extractable, else null. */
  title: string | null;
  /** Total pages if known, else null. */
  pageCount: number | null;
  /** Ordered chunks. */
  chunks: ReadonlyArray<IngestedChunk>;
  /** ID of the ingestor that produced this — recorded on the Document row. */
  ingestorId: string;
}

export interface IngestedChunk {
  /** Position in the original document (0-based). */
  chunkIndex: number;
  text: string;
  page?: number;
  section?: string;
  /** e.g. "Text", "SectionHeader", "Equation" — informational. */
  blockType?: string;
}
```

```typescript
// packages/tools/src/runtime/ingestion/registry.ts

import { extname } from "node:path";
import type { Ingestor } from "./ingestor.js";

export class IngestorRegistry {
  constructor(private readonly ingestors: ReadonlyArray<Ingestor>) {}

  /**
   * Pick the best available ingestor for a file. Priority order:
   *   1. Match by mime type
   *   2. Match by file extension
   *   3. Among matches, prefer one whose isAvailable() returns true
   * Returns null when no ingestor matches.
   */
  async select(opts: { mimeType: string; filename: string; preferIngestorId?: string }): Promise<Ingestor | null> {
    if (opts.preferIngestorId) {
      const named = this.ingestors.find((i) => i.id === opts.preferIngestorId);
      if (named && (await named.isAvailable())) return named;
    }
    const ext = extname(opts.filename).toLowerCase();
    const candidates = this.ingestors.filter(
      (i) => i.mimeTypes.includes(opts.mimeType) || i.extensions.includes(ext),
    );
    for (const c of candidates) {
      if (await c.isAvailable()) return c;
    }
    return null;
  }

  /** All ingestors that handle this file type — used by UI to offer choice. */
  candidatesFor(opts: { mimeType: string; filename: string }): ReadonlyArray<Ingestor> {
    const ext = extname(opts.filename).toLowerCase();
    return this.ingestors.filter(
      (i) => i.mimeTypes.includes(opts.mimeType) || i.extensions.includes(ext),
    );
  }

  /** All registered ingestors. */
  all(): ReadonlyArray<Ingestor> {
    return this.ingestors;
  }
}
```

**Acceptance Criteria**:
- [ ] `select` returns null when no ingestor matches the file.
- [ ] `select` honors `preferIngestorId` if available; falls back to auto if preferred is unavailable.
- [ ] `candidatesFor(.pdf file)` returns multiple ingestors (e.g., JsPdf + VisionPdf).
- [ ] `candidatesFor(.docx)` returns only `DocxIngestor`.

---

### Unit 5: Six default ingestors (JS tier)

Each is a small, focused module. Tests are fast (no models loaded). All live in `packages/tools/src/runtime/ingestion/`.

**Common implementation pattern**:

- Read the file (via `node:fs/promises`)
- Parse format-specifically into a stream of paragraphs/sections
- Apply a shared chunker that respects section boundaries + max chars
- Return `IngestorResult` with `ingestorId` set

#### 5a. `PlainTextIngestor`

**File**: `packages/tools/src/runtime/ingestion/plain-text-ingestor.ts`

```typescript
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Ingestor, IngestorOptions, IngestorResult, IngestedChunk } from "./ingestor.js";
import { chunkParagraphs } from "./chunker.js";

export class PlainTextIngestor implements Ingestor {
  readonly id = "plain-text";
  readonly label = "Plain text";
  readonly extensions = [".txt"] as const;
  readonly mimeTypes = ["text/plain"] as const;

  async isAvailable() { return true; }

  async parse(filePath: string, opts: IngestorOptions = {}): Promise<IngestorResult> {
    const text = await readFile(filePath, "utf-8");
    const chunks = chunkParagraphs(text, { maxChars: opts.maxChars ?? 2000 });
    return {
      title: basename(filePath),
      pageCount: null,
      chunks,
      ingestorId: this.id,
    };
  }
}
```

#### 5b. `MarkdownIngestor`

**File**: `packages/tools/src/runtime/ingestion/markdown-ingestor.ts`

```typescript
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Ingestor, IngestorOptions, IngestorResult, IngestedChunk } from "./ingestor.js";

export class MarkdownIngestor implements Ingestor {
  readonly id = "markdown";
  readonly label = "Markdown";
  readonly extensions = [".md", ".markdown"] as const;
  readonly mimeTypes = ["text/markdown", "text/x-markdown"] as const;

  async isAvailable() { return true; }

  async parse(filePath: string, opts: IngestorOptions = {}): Promise<IngestorResult> {
    const text = await readFile(filePath, "utf-8");
    const maxChars = opts.maxChars ?? 2000;
    const chunks: IngestedChunk[] = [];
    let currentSection: string | undefined;
    let buffer: string[] = [];
    let bufferLen = 0;
    let chunkIndex = 0;

    const flush = () => {
      if (buffer.length === 0) return;
      chunks.push({
        chunkIndex: chunkIndex++,
        text: buffer.join("\n\n"),
        ...(currentSection !== undefined && { section: currentSection }),
      });
      buffer = [];
      bufferLen = 0;
    };

    // Extract title from first H1 if present
    const firstH1Match = /^#\s+(.+)$/m.exec(text);
    const title = firstH1Match?.[1]?.trim() ?? basename(filePath);

    for (const para of text.split("\n\n")) {
      const stripped = para.trim();
      if (!stripped) continue;
      const headingMatch = /^(#{1,6})\s+(.+)$/.exec(stripped);
      if (headingMatch) {
        flush();
        const heading = headingMatch[2]!.trim();
        currentSection = heading;
        chunks.push({
          chunkIndex: chunkIndex++,
          text: stripped,
          section: heading,
          blockType: "SectionHeader",
        });
        continue;
      }
      if (bufferLen + stripped.length > maxChars && buffer.length > 0) flush();
      buffer.push(stripped);
      bufferLen += stripped.length;
    }
    flush();
    return { title, pageCount: null, chunks, ingestorId: this.id };
  }
}
```

#### 5c. `HtmlIngestor`

**File**: `packages/tools/src/runtime/ingestion/html-ingestor.ts`

Uses `@mozilla/readability` (npm) + `linkedom` (lightweight DOM in Node) to strip nav/sidebar/ads, then chunks the resulting text.

```typescript
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import type { Ingestor, IngestorOptions, IngestorResult } from "./ingestor.js";
import { chunkParagraphs } from "./chunker.js";

export class HtmlIngestor implements Ingestor {
  readonly id = "html";
  readonly label = "HTML / web page";
  readonly extensions = [".html", ".htm"] as const;
  readonly mimeTypes = ["text/html"] as const;

  async isAvailable() { return true; }

  async parse(filePath: string, opts: IngestorOptions = {}): Promise<IngestorResult> {
    const html = await readFile(filePath, "utf-8");
    const { document } = parseHTML(html);
    const reader = new Readability(document as unknown as Document);
    const article = reader.parse();
    const text = article?.textContent ?? document.body?.textContent ?? "";
    const chunks = chunkParagraphs(text, { maxChars: opts.maxChars ?? 2000 });
    return {
      title: article?.title ?? document.title ?? basename(filePath),
      pageCount: null,
      chunks,
      ingestorId: this.id,
    };
  }
}
```

#### 5d. `DocxIngestor`

**File**: `packages/tools/src/runtime/ingestion/docx-ingestor.ts`

Uses `mammoth` (npm) to convert DOCX → HTML, then routes through HTML chunking.

```typescript
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import mammoth from "mammoth";
import { parseHTML } from "linkedom";
import type { Ingestor, IngestorOptions, IngestorResult, IngestedChunk } from "./ingestor.js";

export class DocxIngestor implements Ingestor {
  readonly id = "docx";
  readonly label = "Word document";
  readonly extensions = [".docx"] as const;
  readonly mimeTypes = ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"] as const;

  async isAvailable() { return true; }

  async parse(filePath: string, opts: IngestorOptions = {}): Promise<IngestorResult> {
    const buffer = await readFile(filePath);
    const result = await mammoth.convertToHtml({ buffer });
    const { document } = parseHTML(`<!DOCTYPE html><html><body>${result.value}</body></html>`);

    const maxChars = opts.maxChars ?? 2000;
    const chunks: IngestedChunk[] = [];
    let currentSection: string | undefined;
    let buf: string[] = [];
    let bufLen = 0;
    let chunkIndex = 0;

    const flush = () => {
      if (buf.length === 0) return;
      chunks.push({
        chunkIndex: chunkIndex++,
        text: buf.join("\n\n"),
        ...(currentSection !== undefined && { section: currentSection }),
      });
      buf = [];
      bufLen = 0;
    };

    for (const node of document.body?.children ?? []) {
      const tag = node.tagName.toLowerCase();
      const text = (node.textContent ?? "").trim();
      if (!text) continue;
      if (/^h[1-6]$/.test(tag)) {
        flush();
        currentSection = text;
        chunks.push({
          chunkIndex: chunkIndex++,
          text,
          section: text,
          blockType: "SectionHeader",
        });
        continue;
      }
      if (bufLen + text.length > maxChars && buf.length > 0) flush();
      buf.push(text);
      bufLen += text.length;
    }
    flush();

    // Title from the first heading or the filename.
    const firstHeading = chunks.find((c) => c.blockType === "SectionHeader")?.text;
    return {
      title: firstHeading ?? basename(filePath),
      pageCount: null,
      chunks,
      ingestorId: this.id,
    };
  }
}
```

#### 5e. `EpubIngestor`

**File**: `packages/tools/src/runtime/ingestion/epub-ingestor.ts`

Uses `epub2` (npm) to read EPUB chapter-by-chapter. Each chapter becomes its own section.

```typescript
import { basename } from "node:path";
import { EPub } from "epub2";
import { parseHTML } from "linkedom";
import type { Ingestor, IngestorOptions, IngestorResult, IngestedChunk } from "./ingestor.js";

export class EpubIngestor implements Ingestor {
  readonly id = "epub";
  readonly label = "EPUB ebook";
  readonly extensions = [".epub"] as const;
  readonly mimeTypes = ["application/epub+zip"] as const;

  async isAvailable() { return true; }

  async parse(filePath: string, opts: IngestorOptions = {}): Promise<IngestorResult> {
    const epub = await EPub.createAsync(filePath);
    const maxChars = opts.maxChars ?? 2000;
    const chunks: IngestedChunk[] = [];
    let chunkIndex = 0;

    for (const chapter of epub.flow) {
      if (opts.signal?.aborted) break;
      const html = await epub.getChapterAsync(chapter.id);
      const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
      const sectionTitle = chapter.title ?? `Chapter ${chunkIndex + 1}`;

      let buf: string[] = [];
      let bufLen = 0;
      const flush = () => {
        if (buf.length === 0) return;
        chunks.push({
          chunkIndex: chunkIndex++,
          text: buf.join("\n\n"),
          section: sectionTitle,
        });
        buf = [];
        bufLen = 0;
      };

      for (const para of document.body?.querySelectorAll("p, h1, h2, h3, h4, h5, h6, li") ?? []) {
        const text = (para.textContent ?? "").trim();
        if (!text) continue;
        if (bufLen + text.length > maxChars && buf.length > 0) flush();
        buf.push(text);
        bufLen += text.length;
      }
      flush();
    }

    return {
      title: epub.metadata.title ?? basename(filePath),
      pageCount: epub.flow.length,
      chunks,
      ingestorId: this.id,
    };
  }
}
```

#### 5f. `JsPdfIngestor` (default for PDFs)

**File**: `packages/tools/src/runtime/ingestion/js-pdf-ingestor.ts`

Uses `pdfjs-dist` to extract text from a PDF's text layer. Works well for modern PDFs with selectable text. Loses equations, struggles with multi-column.

```typescript
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Ingestor, IngestorOptions, IngestorResult, IngestedChunk } from "./ingestor.js";

export class JsPdfIngestor implements Ingestor {
  readonly id = "js-pdf";
  readonly label = "PDF (text layer)";
  readonly extensions = [".pdf"] as const;
  readonly mimeTypes = ["application/pdf"] as const;

  async isAvailable() { return true; }

  async parse(filePath: string, opts: IngestorOptions = {}): Promise<IngestorResult> {
    const data = await readFile(filePath);
    // Lazy import to avoid loading pdfjs-dist at module init in tests.
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
    const pdf = await loadingTask.promise;
    const maxChars = opts.maxChars ?? 2000;
    const chunks: IngestedChunk[] = [];
    let chunkIndex = 0;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      if (opts.signal?.aborted) break;
      opts.onPageProgress?.(pageNum, pdf.numPages);
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items.map((it) => ("str" in it ? it.str : "")).join(" ");
      // Naive chunk-per-page (good enough for v0.5; semantic chunking is future polish).
      let buf: string[] = [];
      let bufLen = 0;
      const flush = () => {
        if (buf.length === 0) return;
        chunks.push({
          chunkIndex: chunkIndex++,
          text: buf.join(" "),
          page: pageNum,
        });
        buf = [];
        bufLen = 0;
      };
      for (const para of pageText.split(/\n{2,}|(?<=\.)\s+(?=[A-Z])/)) {
        const trimmed = para.trim();
        if (!trimmed) continue;
        if (bufLen + trimmed.length > maxChars && buf.length > 0) flush();
        buf.push(trimmed);
        bufLen += trimmed.length;
      }
      flush();
    }

    // Try to extract title from PDF metadata
    const meta = await pdf.getMetadata().catch(() => null);
    const metaInfo = meta?.info as { Title?: string } | undefined;
    const title = metaInfo?.Title ?? basename(filePath);
    return { title, pageCount: pdf.numPages, chunks, ingestorId: this.id };
  }
}
```

**Shared chunker** at `packages/tools/src/runtime/ingestion/chunker.ts`:

```typescript
import type { IngestedChunk } from "./ingestor.js";

export interface ChunkParagraphsOpts {
  maxChars: number;
}

/**
 * Split text into chunks at paragraph boundaries, respecting maxChars.
 * Used by the simple ingestors (PlainText, HTML body text).
 */
export function chunkParagraphs(text: string, opts: ChunkParagraphsOpts): IngestedChunk[] {
  const out: IngestedChunk[] = [];
  let buf: string[] = [];
  let bufLen = 0;
  let chunkIndex = 0;

  const flush = () => {
    if (buf.length === 0) return;
    out.push({ chunkIndex: chunkIndex++, text: buf.join("\n\n") });
    buf = [];
    bufLen = 0;
  };

  for (const para of text.split(/\n{2,}/)) {
    const stripped = para.trim();
    if (!stripped) continue;
    if (bufLen + stripped.length > opts.maxChars && buf.length > 0) flush();
    buf.push(stripped);
    bufLen += stripped.length;
  }
  flush();
  return out;
}
```

**`packages/tools/package.json`** dependency additions:

```json
{
  "dependencies": {
    "@mozilla/readability": "^0.5.0",
    "linkedom": "^0.18.0",
    "mammoth": "^1.8.0",
    "epub2": "^3.0.2",
    "pdfjs-dist": "^4.8.0",
    "@huggingface/transformers": "^4.0.0",
    "sqlite-vec": "^0.1.9",
    // ...existing
  }
}
```

**Acceptance Criteria**:
- [ ] Each ingestor loads its file format and produces chunks with the right `ingestorId`.
- [ ] `MarkdownIngestor` extracts the first H1 as title; preserves section per heading.
- [ ] `HtmlIngestor` strips nav/sidebar via Readability; preserves the article body.
- [ ] `DocxIngestor` preserves heading hierarchy as sections.
- [ ] `EpubIngestor` produces one section per chapter.
- [ ] `JsPdfIngestor` produces chunks with `page` set; reports total pages; calls `onPageProgress`.
- [ ] All ingestors honor `signal?.aborted` to stop mid-parse.
- [ ] Tests use small fixture files in `tests/fixtures/{txt,md,html,docx,epub,pdf}/`.

---

### Unit 6: `VisionPdfIngestor`

**File**: `packages/tools/src/runtime/ingestion/vision-pdf-ingestor.ts`
**File**: `packages/tools/src/runtime/ingestion/__tests__/vision-pdf-ingestor.test.ts`

Renders each PDF page to a PNG via `pdfjs-dist` + `canvas`, calls `engine.vision.describe` per page, parses the response into chunks.

```typescript
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Ingestor, IngestorOptions, IngestorResult, IngestedChunk } from "./ingestor.js";
import type { VisionCapability } from "@praxis/core/types";

export interface VisionPdfIngestorOptions {
  /** Vision capability from the active engine. Required — undefined disables this ingestor. */
  vision: VisionCapability | undefined;
  /** Render scale; higher = larger images = better OCR quality + cost. Default 2.0. */
  renderScale?: number;
}

const VISION_PROMPT = `Extract all text from this page of a document. Format the output as Markdown:
- Use # / ## / ### for section headings (preserve the hierarchy from the page)
- Use $$ ... $$ for display math equations (LaTeX)
- Use $ ... $ for inline math
- Preserve lists, tables, and paragraph structure
- Skip page numbers, headers, and footers (they're noise for retrieval)
- If the page is blank or contains only images with no extractable text, output the literal string "[BLANK PAGE]"

Output ONLY the Markdown content. No preamble. No explanation.`;

export class VisionPdfIngestor implements Ingestor {
  readonly id = "vision-pdf";
  readonly label = "PDF (vision OCR)";
  readonly extensions = [".pdf"] as const;
  readonly mimeTypes = ["application/pdf"] as const;
  private readonly vision: VisionCapability | undefined;
  private readonly renderScale: number;

  constructor(opts: VisionPdfIngestorOptions) {
    this.vision = opts.vision;
    this.renderScale = opts.renderScale ?? 2.0;
  }

  async isAvailable(): Promise<boolean> {
    return this.vision !== undefined;
  }

  async parse(filePath: string, opts: IngestorOptions = {}): Promise<IngestorResult> {
    if (!this.vision) {
      throw new Error("VisionPdfIngestor: no vision capability available on the active engine");
    }
    const data = await readFile(filePath);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createCanvas } = await import("canvas");

    const pdf = await pdfjs.getDocument({ data: new Uint8Array(data) }).promise;
    const maxChars = opts.maxChars ?? 2000;
    const chunks: IngestedChunk[] = [];
    let chunkIndex = 0;
    let currentSection: string | undefined;

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      if (opts.signal?.aborted) break;
      opts.onPageProgress?.(pageNum, pdf.numPages);

      // Render to PNG
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: this.renderScale });
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext("2d") as unknown as Parameters<typeof page.render>[0]["canvasContext"];
      await page.render({ canvasContext: ctx, viewport }).promise;
      const pngBuffer = canvas.toBuffer("image/png");
      const pngBase64 = pngBuffer.toString("base64");

      // Vision call — fresh one-shot SDK session per page (does NOT touch the active tutoring session)
      const result = await this.vision.describe({
        prompt: VISION_PROMPT,
        images: [{ data: pngBase64, mimeType: "image/png" }],
        maxTokens: 4000,
      });

      const pageText = result.text.trim();
      if (pageText === "[BLANK PAGE]" || pageText === "") continue;

      // Parse the page's markdown into chunks (similar to MarkdownIngestor)
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
      for (const para of pageText.split("\n\n")) {
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
    };
  }
}
```

**Implementation Notes**:
- **Vision call per page is a one-shot.** The `engine.vision.describe(...)` call internally opens a fresh SDK session (Direct: fresh `generateText`; Claude Code: fresh `query`; Codex: fresh `startThread`). The active tutoring `EngineSession` is unaffected.
- **`canvas` npm package** provides a Node-side canvas implementation that pdfjs-dist can render into. It's a native dep (~10MB), uses cairo/pango. Cross-platform but adds a build dep. Alternative: `@napi-rs/canvas` (newer, sometimes faster). Pick whichever has better Electron rebuild story; both work.
- **Cost awareness**: a 300-page textbook = 300 vision calls. At Claude vision pricing, that's ~$3-15 per textbook. UI surfaces this as "Vision parsing may incur engine usage costs." Document the cost prominently.
- **Cancellation**: between pages, check `signal?.aborted` and break.
- **Throttling**: not implemented in v0.5 — for very large PDFs this can hammer the API. Future polish: configurable concurrency / rate limit.

**Acceptance Criteria**:
- [ ] `isAvailable()` returns false when constructed with `vision: undefined`.
- [ ] `parse()` throws if `vision` is undefined when invoked (defensive).
- [ ] For a 3-page mock PDF: calls `vision.describe` exactly 3 times.
- [ ] Each vision call gets a different page image (mock asserts unique image data).
- [ ] Pages returning "[BLANK PAGE]" are skipped.
- [ ] Aborts mid-page-loop on `signal.aborted`.
- [ ] `onPageProgress` invoked for each page processed.

---

### Unit 7: `LocalEmbeddingService` and `SqliteVecStore`

These two units are unchanged from v1 of the design — see the v1 design doc at git rev `a11cbba` for the full text. The interfaces are stable; no architectural change. Brief restatement:

- **`LocalEmbeddingService`** in `packages/tools/src/runtime/embeddings.ts` — wraps `@huggingface/transformers` v4 with `Xenova/bge-small-en-v1.5`. Lazy-loaded singleton with `preload()`. Returns 384-dim vectors.

- **`SqliteVecStore`** in `packages/tools/src/runtime/sqlite-vec-store.ts` — wraps better-sqlite3's prepared statements against the `document_embeddings` virtual table. Methods: `upsert`, `upsertBatch` (transaction), `search` (cosine + optional document_id filter), `deleteByDocumentId`.

- **`initVectorStore`** in `packages/core/src/db/vector-init.ts` — loads sqlite-vec extension and creates the virtual table via `CREATE VIRTUAL TABLE IF NOT EXISTS document_embeddings USING vec0(...)`. Called from `openDb` after migrations.

- **`openDb` extension** — accepts `initVectors?: boolean` (default true); skipped when `readonly: true`.

---

### Unit 8: `IngestionService` (thin orchestrator)

**Files**:
- `packages/core/src/ingestion/service.ts` (new)
- `packages/core/src/ingestion/index.ts` (new)
- `packages/core/src/__tests__/ingestion-service.test.ts`

```typescript
import { v7 as uuidv7 } from "uuid";
import { documentChunks, documents } from "@praxis/artifacts/schema";
import type { PraxisDb } from "../db/index.js";
import type { EmbeddingService, IngestionEvent, IngestionRequest, Logger, VectorStore } from "../types/index.js";
import type { Ingestor, IngestorRegistry } from "@praxis/tools/runtime/ingestion";

export interface IngestionServiceDeps {
  db: PraxisDb;
  log: Logger;
  vectorStore: VectorStore;
  embeddings: EmbeddingService;
  ingestorRegistry: IngestorRegistry;
}

const EMBED_BATCH_SIZE = 32;

export class IngestionService {
  constructor(private readonly deps: IngestionServiceDeps) {}

  async *ingest(req: IngestionRequest, signal?: AbortSignal): AsyncIterable<IngestionEvent> {
    const documentId = uuidv7();
    yield { type: "start", documentId, filename: req.filename };

    // Pick an ingestor
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

    // Parse
    yield { type: "parsing", message: `Parsing with ${ingestor.label}...` };
    let result: Awaited<ReturnType<Ingestor["parse"]>>;
    try {
      result = await ingestor.parse(req.filePath, {
        ...(signal !== undefined && { signal }),
        onPageProgress: (page, totalPages) => {
          // For vision ingestor — page-level progress events. The async iterable
          // can't yield from a callback, so we record into a queue and flush
          // between batches (simplified: skip for now and rely on parsing message).
          this.deps.log.debug("vision page progress", { page, totalPages });
        },
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      yield { type: "error", error: { code: "ingest.parse_failed", message, recoverable: false } };
      return;
    }
    yield { type: "parsed", chunkCount: result.chunks.length };

    // Persist document + chunks
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

    const chunkRows = result.chunks.map((c) => ({
      id: uuidv7(),
      documentId,
      chunkIndex: c.chunkIndex,
      text: c.text,
      locatorJson: { page: c.page ?? null, section: c.section ?? null, blockType: c.blockType ?? null },
    }));
    if (chunkRows.length > 0) {
      this.deps.db.insert(documentChunks).values(chunkRows).run();
    }

    // Embed in batches
    let processed = 0;
    for (let start = 0; start < result.chunks.length; start += EMBED_BATCH_SIZE) {
      if (signal?.aborted) {
        yield { type: "error", error: { code: "ingest.cancelled", message: "Cancelled by user", recoverable: false } };
        return;
      }
      const batch = result.chunks.slice(start, start + EMBED_BATCH_SIZE);
      const vectors = await this.deps.embeddings.embedBatch(batch.map((c) => c.text));
      const upserts = batch.map((c, i) => {
        const row = chunkRows[start + i];
        if (!row) throw new Error(`chunk row missing at ${start + i}`);
        const vec = vectors[i];
        if (!vec) throw new Error(`embedding missing at ${start + i}`);
        return {
          chunkId: row.id,
          documentId,
          embedding: vec,
          chunkText: c.text,
          ...(c.page !== undefined && { page: c.page }),
          ...(c.section !== undefined && { section: c.section }),
        };
      });
      await this.deps.vectorStore.upsertBatch(upserts);
      processed += batch.length;
      yield { type: "embedding", chunksProcessed: processed, totalChunks: result.chunks.length };
    }

    yield { type: "done", documentId, chunkCount: result.chunks.length };
  }
}
```

**Acceptance Criteria**:
- [ ] Selects auto-ingestor based on mime type; honors `preferIngestorId`.
- [ ] Yields `ingestor_selected` with the chosen ingestor's id + label.
- [ ] Yields `parsing` → `parsed` → `embedding(N)` → `done` in order.
- [ ] On parse failure, yields `error` and stops; no partial document row.
- [ ] On embed-batch failure, yields error and stops (no partial vectors).
- [ ] Honors `AbortSignal` between embed batches.

---

### Unit 9: `retrieve_from_textbook` tool, `DocumentsService`, ServiceDeps wiring

These units mirror v1 of the design with no architectural change beyond the new fields on ToolServices. Key points:

- **`retrieve_from_textbook`** in `packages/tools/src/retrieval/retrieve-from-textbook.ts` — input has `query`, `topK`, optional `documentIds`. Handler embeds query, calls `vectorStore.search`, hydrates titles via `documents.titlesByIds`, returns `{ query, citations: [{ index, documentId, documentTitle, chunkId, chunkText, page?, section?, distance }] }`.
- **`DocumentsServiceImpl`** + **`DrizzleDocumentsReader`** in `packages/core/src/services/`.
- **`ServiceDeps.toolServices`** gains `vectorStore`, `embeddings`, `documents` fields.
- **`SessionServiceImpl.openActive`** populates these into `ToolContext.services`.
- **`buildServices`** in `packages/desktop/electron/main/services.ts` constructs:
  - `LocalEmbeddingService` (preloaded at startup)
  - `SqliteVecStore`
  - `IngestorRegistry` populated with all 7 ingestors (`PlainTextIngestor`, `MarkdownIngestor`, `HtmlIngestor`, `DocxIngestor`, `EpubIngestor`, `JsPdfIngestor`, `VisionPdfIngestor`)
  - `IngestionService`
  - `DocumentsServiceImpl`

**Critical wiring detail**: `VisionPdfIngestor` constructor takes `vision: engineFor(currentConfig).vision`. But which engine? The currently configured one. So the ingestor list needs to be rebuilt when engine config changes — or the ingestor lookup is dynamic.

**Recommended pattern**: `VisionPdfIngestor` accepts a `() => VisionCapability | undefined` getter, not a fixed reference. The getter resolves the active engine's vision at call time. This keeps the registry stable across engine changes.

```typescript
// Adjust VisionPdfIngestor constructor:
constructor(opts: { visionResolver: () => VisionCapability | undefined }) { ... }
async isAvailable() { return this.visionResolver() !== undefined; }
async parse(filePath, opts) {
  const vision = this.visionResolver();
  if (!vision) throw new Error(...);
  // ... use vision
}

// In buildServices:
const visionResolver = () => {
  const config = readEngineConfig(db);
  const engine = engineFactory ? engineFactory(config, { log }) : createEngine({ config, deps: { log } });
  return engine.vision;
};
const visionPdf = new VisionPdfIngestor({ visionResolver });
```

This way, switching engines in Settings immediately makes vision parsing reflect the new engine.

**Acceptance Criteria**:
- [ ] `retrieve_from_textbook` works as in v1.
- [ ] `DocumentsServiceImpl.list()`, `.delete()` work; delete cascades to vectors.
- [ ] `buildServices` wires all 7 ingestors; the registry's `candidatesFor(.pdf)` returns 2 (JsPdf + VisionPdf).
- [ ] Vision ingestor's availability tracks the current engine config (test by changing config and observing `isAvailable()`).

---

### Unit 10: IPC + Client + UI — file picker, progress, document list, citation chips

Same as v1 of the design with these additions/modifications:

- **`praxis.ingest.start`** payload includes optional `preferIngestorId` (UI sends `"vision-pdf"` when user chooses vision parsing for a PDF).
- **`praxis.ingest.candidatesFor`** (new invoke) — UI calls it after picking a file to learn which ingestors apply, and shows a chooser if more than one (typically only PDFs trigger this).
- **Document list shows the ingestor badge** — e.g. "PDF (text layer)" or "PDF (vision OCR)" or "DOCX" — informational so users understand what was used.
- **PDF-picked dialog** — when user picks a PDF, a small modal appears: "Use vision parsing? (recommended for math-heavy or scanned PDFs; uses your engine's vision capability and may incur usage)". Default = no (use JS tier).
- **Citation chips + source cards** — same as v1.

**Acceptance Criteria**:
- [ ] File picker accepts `.txt`, `.md`, `.markdown`, `.html`, `.htm`, `.docx`, `.epub`, `.pdf`.
- [ ] PDF selected → choose-parser modal appears with two options.
- [ ] Document list shows ingestor badge.
- [ ] Citation rendering as in v1.

---

### Unit 11: `teach` mode — add `retrieve_from_textbook`

Same as v1: add `"retrieve_from_textbook"` to `teachMode.toolNames`; tools fragment teaches the `[N]` citation convention.

---

### Unit 12: Tests (per-unit + integration)

| Test file | Type | What it tests |
|---|---|---|
| `packages/core/src/__tests__/engine-config.test.ts` (extended) | unit, fast | Vision-capability validation: succeed/fail per provider; substring fallback; default model is vision-capable. |
| `packages/engines/src/__tests__/direct-vision.test.ts` | unit, fast | Mock `generateText`. Single-shot per call; image content correctly formed; usage propagated. |
| `packages/engines/src/__tests__/claude-code-vision.test.ts` | unit, fast | Mock `query` and `collectResult`. Temp dir created and removed; `noSessionPersistence: true`; image files written. |
| `packages/engines/src/__tests__/codex-vision.test.ts` | unit, fast | Mock `Codex` constructor; transient thread; `local_image` inputs; temp dir cleanup. |
| `packages/tools/src/runtime/ingestion/__tests__/registry.test.ts` | unit, fast | select / candidatesFor by mime + extension; preferIngestorId honored. |
| `packages/tools/src/runtime/ingestion/__tests__/{plain-text,markdown,html,docx,epub,js-pdf}-ingestor.test.ts` | unit, fast | Each parses a small fixture and produces expected chunks. |
| `packages/tools/src/runtime/ingestion/__tests__/vision-pdf-ingestor.test.ts` | unit, fast | Mock pdfjs + canvas + vision; assert N pages → N vision calls; blank-page skipping. |
| `packages/tools/src/runtime/__tests__/sqlite-vec-store.test.ts` | unit (real sqlite-vec, fast) | Upsert, batch, search with/without doc filter, deleteByDocumentId. |
| `packages/tools/src/runtime/__tests__/embeddings.test.ts` | unit (mock) + slow (real) | Lazy load contract; batch reshape; real model gated. |
| `packages/core/src/__tests__/ingestion-service.test.ts` | unit, fast | Mock registry + ingestor + embeddings + vectorStore. Event order; persist correctness. |
| `packages/desktop/src/__tests__/ipc-server.test.ts` (extended) | unit | Ingest channels + documents channels + candidatesFor invoke. |
| `tests/textbook-rag-end-to-end.test.ts` | integration | Real sqlite-vec + mocked embeddings + JS ingestor on a fixture. Ingest → retrieve → assert ranked citations. |

Slow tests (real embedding model load) gate behind `PRAXIS_RUN_SLOW_TESTS=1`.

---

## Implementation Order

1. **Unit 1** — Type contracts.
2. **Unit 2** — EngineConfigSchema vision validation.
3. **Unit 3** — Per-engine vision (3 sub-units, can parallelize).
4. **Unit 4** — Ingestor port + registry.
5. **Unit 5** — Six default ingestors (parallelizable).
6. **Unit 6** — VisionPdfIngestor (depends on Unit 3).
7. **Unit 7** — LocalEmbeddingService + SqliteVecStore.
8. **Unit 8** — IngestionService.
9. **Unit 9** — retrieve_from_textbook tool + DocumentsService + buildServices wiring.
10. **Unit 10** — IPC + client + UI.
11. **Unit 11** — teach mode + fragment update.
12. **Unit 12** — Tests interspersed.

---

## Verification

```bash
pnpm install && pnpm typecheck && pnpm lint && pnpm test  # fast lane
PRAXIS_RUN_SLOW_TESTS=1 pnpm test  # adds real embedding model load
pnpm desktop:build && pnpm dev      # manual M1+ test

# Manual test checkpoint (Phase 5):
# 1. Drop a .md file → indexed in <1 sec; appears in document list with "Markdown" badge
# 2. Drop a .docx → indexed; "Word document" badge
# 3. Drop a .epub → indexed; "EPUB ebook" badge
# 4. Drop a .pdf → choose-parser modal; pick "text layer" → indexed in seconds; "PDF (text layer)" badge
# 5. Drop the same .pdf again, choose "vision OCR" → indexed slower (vision calls per page); "PDF (vision OCR)" badge
# 6. Ask: "what does chapter 3 say about respiration?"
# 7. Watch assistant stream with [1] [2] chips → click [1] → scrolls to source card
# 8. pnpm db:episodic shows the tool_call(retrieve_from_textbook) + tool_result with citations array
# 9. Verify the active tutoring session's prompt cache wasn't blown away by ingestion (Anthropic dashboard or via inspecting Claude Code's session log)
```

---

## Out of scope (explicit list)

- **Local Marker (Python sidecar)** — see `docs/ROADMAP.md` "Future enhancements". Triggered by power-user demand.
- **`.pptx`, `.rtf`** — defer; revisit if user demand emerges.
- **Image OCR for raw photos** (`.png`, `.jpg`) — Phase 13 vision pipeline.
- **PDF page image rendering** in citation cards — text + page number only.
- **Hybrid keyword + vector search** — pure vector for v1.
- **pgvector adapter** — Phase 15.
- **Concept extraction → draft course bootstrap** — Phase 6.
- **Batched/parallel vision calls** for large PDFs — Phase 5 calls serially. Future polish: configurable concurrency.
- **Vision prompt caching across pages** — each page is a fresh call (clean isolation); a future optimization could cache the system prompt portion.

## Notes for the implementer

- **Patterns referenced**: `engine-session-lifecycle` (vision uses fresh one-shot, distinct from active session), `tool-dispatch-pipeline` (retrieve_from_textbook follows it), `ipc-channel-convention` (new channels), `service-deps-injection` (new toolServices fields), `temp-db-test-helper` (DB tests), `slow-test-gating` (embeddings + vision real-call tests).
- **Vision call isolation is critical** — every vision call MUST use a fresh SDK session. Audit before merging that no implementation accidentally reuses a Conversation/Thread.
- **`canvas` native dep** for VisionPdfIngestor — needs `electron-rebuild` like isolated-vm. Add to the desktop postinstall.
- **`@huggingface/transformers` v4** — add to `@praxis/tools` deps; lazy-imported inside LocalEmbeddingService to keep test suites fast.
- **`pdfjs-dist`** — use the `legacy/build/pdf.mjs` entry point in Node (the default entry is browser-targeted).
- **No Python in Phase 5.** SPEC.md still documents the future Python sidecar boundary; no code lives there yet.
