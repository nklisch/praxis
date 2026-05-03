# Design: Phase 16 — Bootstrap Explorer + Course-Scoped Document Library

## Overview

This design replaces Phase 6's single-shot concept-extractor with an **agentic concept-explorer** that incrementally peruses textbooks via deterministic + semantic search tools and shapes a course draft through small, typed mutations. Bundled with the explorer rewrite is a long-overdue **course-document scoping refactor**: documents stop being "all-visible to every agent" and become explicitly attached to the courses that use them, via a new `course_documents` join. Tools that read documents (notably `retrieve_from_textbook` and the new explorer tools) default-scope to the active course's attached documents, eliminating cross-course leakage (e.g. a Math agent seeing a Biology textbook).

The two changes ship together because (a) the explorer's `course.draft_finalize` is the natural materialization point for course-document attachment, and (b) the explorer's tool surface needs to use the same scoping primitives the rest of the system will use post-refactor.

### Why now

- The current extractor (`packages/curriculum/src/bootstrap/extractor.ts`) sends *all* document chunks in a single user message. For the Sullivan Algebra & Trigonometry textbook (1,174 chunks ≈ 635k tokens) this overshoots the 200k context window 3× and produces "no JSON block" failures (verified live by the user).
- The previous turn shipped a stopgap (even-stride sampling to 120 chunks) but it's structural, not semantic — for "extract Algebra-only from Sullivan" it samples trig chunks proportionally and relies on the model to drop them.
- The architecture already has the right primitives — vector store, BM25 over chunks, `retrieve_from_textbook`, ToolContext with `courseId` propagation — but the extractor bypasses them. Phase 6's `extractor.ts` comment even acknowledges `chunksPerBatch?: number` exists "currently single-pass" — the iteration was always coming.
- The "all student docs visible" model conflicts with the user's stated mental model ("if someone is doing math and biology, agents don't see both when they don't need to") and with the existing `course.list_documents` tool's scope, which filters only by `studentId`.

### What's in scope

1. **Schema**: new `course_documents` join table; cascade rules; migration.
2. **CourseDocumentsService** (port + impl): attach/detach/list-by-course/list-library queries.
3. **Tool-context augmentation**: `ToolContext.courseDocumentIds?: DocumentId[]` populated when `courseId` is set, plus `ctx.services.courseDocuments`.
4. **Retrieve scoping**: `retrieve_from_textbook` defaults `documentIds` to course-attached when `ctx.courseId` is set.
5. **Ingestion auto-attach**: `IngestionRequest.courseId?: CourseId` → on success, link the new document to that course.
6. **Document tools** (deterministic): `document.list_sections`, `document.read_pages`, `document.outline`.
7. **Library tools**: `course.list_library_documents` (replaces today's `course.list_documents` semantics in non-bootstrap modes); `course.attach_document`, `course.detach_document`, `course.list_course_documents`.
8. **Incremental draft mutations**: `course.draft_init`, `course.draft_set_metadata`, `course.draft_add_concept`, `course.draft_remove_concept`, `course.draft_add_edge`, `course.draft_add_lesson`, `course.draft_remove_lesson`, `course.draft_finalize` — each validated, each mutating a single field of `BootstrapService`'s in-memory draft cache.
9. **Explorer agent**: `runConceptExplorer` in `@praxis/curriculum/bootstrap/explorer.ts` — multi-turn isolated session. New explorer system prompt teaches it the tool surface and the explore-then-shape pattern.
10. **`course.start_exploration` tool**: the new explorer entry point. Called by the bootstrap-mode tutor; runs the explorer in an isolated session; returns a `DraftSummary` for the tutor to narrate.
11. **Mode updates**: `bootstrap.toolNames` and `configure.toolNames` reflect the new tool inventory; bootstrap-role prompt fragment updated to describe the explore-then-confirm flow.
12. **UI**: ingestion entry points are course-aware (auto-attach when invoked from a course detail view); a library-reuse picker lets users attach an already-ingested doc to a course without re-uploading.
13. **Legacy deletes**: `runConceptExtractor` + `extractor.ts` + `extractor-prompt.ts` + `extractor.test.ts` + `proposeDraftTool` + `propose-draft.ts` + `BootstrapService.proposeDraft` + `ProposeDraftInput` are removed outright. Praxis has no production users; there is no transition tail to maintain. See "Files deleted by this design" below.

### What's out of scope (deferred)

- Migrating *existing* student documents into per-course attachments. Migration policy: existing documents remain unattached; users manually attach via the new picker on next bootstrap. (No row-level migration code.)
- Cross-course retrieval as a first-class feature. The `documentIds` override on `retrieve_from_textbook` exists but the agent isn't directed to use it.
- An "attach by default" UX for ingestion outside a course context — outside-course ingestion goes to the library only.
- Reworking `course.use_canonical_pack` (Phase 10). Stays as-is; canonical packs don't go through the explorer.

---

## Architectural overview

```
                   Bootstrap mode (live tutor session, user-facing)
                                    │
                                    │ user: "make me an algebra course from Sullivan"
                                    ▼
             ┌────────────────────────────────────────────────┐
             │  course.start_exploration  (NEW tool)          │
             │  args: { documentIds, courseTitle, subject,    │
             │          gradeLevel, maxSteps?, maxBudgetUsd? }│
             │  returns: { draftId, summary }                 │
             └────────────────────────────────────────────────┘
                                    │
                                    │ opens an ISOLATED engine session
                                    │ with explorer system prompt + scoped tool registry
                                    ▼
       ┌───────────────────────────────────────────────────────────┐
       │  Explorer agent  (multi-turn, looped by the SDK)          │
       │                                                           │
       │  Tool surface (the only tools the explorer can see):      │
       │   ─ retrieve_from_textbook  (semantic + lexical)          │
       │   ─ document.list_sections  (deterministic TOC)           │
       │   ─ document.read_pages     (deterministic page-range)    │
       │   ─ document.outline        (deterministic doc-summary)   │
       │   ─ course.draft_init       (creates draft, returns id)   │
       │   ─ course.draft_set_metadata                             │
       │   ─ course.draft_add_concept                              │
       │   ─ course.draft_remove_concept                           │
       │   ─ course.draft_add_edge                                 │
       │   ─ course.draft_add_lesson                               │
       │   ─ course.draft_remove_lesson                            │
       │   ─ course.draft_finalize   (validates + freezes draft)   │
       │                                                           │
       │  Loop: explore docs → propose concepts incrementally →    │
       │        propose edges → propose lessons → finalize         │
       └───────────────────────────────────────────────────────────┘
                                    │
                                    │ when explorer calls course.draft_finalize:
                                    ▼
                         BootstrapService draft cache (existing,
                         unchanged TTL — 2h, in-memory).
                                    │
                                    │ explorer session closes; control returns
                                    │ to bootstrap tutor, which calls
                                    │ course.show_draft to render the card.
                                    ▼
              ┌──────────────────────────────────────────┐
              │  Existing show/edit/confirm flow         │
              │  (unchanged — explorer just produces a   │
              │   normal DraftCourseState)               │
              └──────────────────────────────────────────┘
                                    │
                                    │ on course.confirm_draft, the documentIds
                                    │ that seeded the exploration are written
                                    │ to course_documents (NEW behavior).
                                    ▼
                         Course exists; documents attached.
```

**Isolation guarantee preserved**: the explorer runs in a fresh `EngineSession` opened by the `course.start_exploration` tool handler, exactly like Phase 6's `runOneShot`. The tutor's prompt cache and conversation history don't see exploration noise. The change is that the isolated session is now (a) multi-turn (the SDK's internal loop runs across many tool calls instead of one) and (b) given a non-empty tool registry.

---

## Schema additions

### `@praxis/artifacts` schema — new join table

**File**: `packages/artifacts/src/schema.ts` (modify; add the table)

```typescript
// ─── Phase 16: Course ↔ Document attachment ──────────────────────────────────

export const courseDocuments = sqliteTable(
  "course_documents",
  {
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    attachedAt: integer("attached_at", { mode: "timestamp_ms" }).notNull(),
    /**
     * Where the attachment came from. "bootstrap" = seed list passed to the
     * explorer; "manual" = user attached via UI picker; "ingestion" = the
     * document was uploaded while a course was in scope.
     */
    source: text("source", { enum: ["bootstrap", "manual", "ingestion"] }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.courseId, t.documentId] }),
    courseIdx: index("course_documents_course_idx").on(t.courseId),
    documentIdx: index("course_documents_document_idx").on(t.documentId),
  }),
);
```

**Cascade behavior**:
- Deleting a course removes its `course_documents` rows but **not** the documents themselves (documents are student-owned resources).
- Deleting a document removes its `course_documents` rows in every course (the reference is dead anyway).
- This is exactly what the FK `onDelete: "cascade"` clauses give us; no per-row cleanup logic.

**Migration**: a new file `drizzle/0009_course_documents.sql` (drizzle generates the name from `pnpm db:generate`). No data migration — pre-existing documents start unattached. Existing courses keep working because the only consumer of attachment-state (the new tool scoping) gracefully falls back to "no attachments" → empty allowlist → returns nothing, which is the safer-by-default behavior. Acceptance: existing teach sessions for pre-Phase-16 courses must explicitly attach documents before retrieval works in those courses.

### `documents` table — unchanged

Stays exactly as today (`packages/artifacts/src/schema.ts:117-131`). Documents remain student-scoped library entries.

---

## Implementation Units

### Unit 1: `CourseDocumentsService` port + impl

**Port file**: `packages/core/src/types/tool.ts` (add to existing `ToolServices` and exports)

```typescript
/**
 * Many-to-many between courses and the student's library documents. A document
 * can be attached to zero, one, or many courses. The student library
 * (`documents` table) is the SSOT — this service only manages links.
 */
export interface CourseDocumentsService {
  /** All document ids attached to a course, in attach order. */
  listForCourse(courseId: CourseId): Promise<DocumentId[]>;

  /** Compact summaries of documents attached to a course (for tool output). */
  listForCourseDetailed(courseId: CourseId): Promise<DocumentSummaryItem[]>;

  /**
   * Attach. Idempotent: re-attaching an already-attached document is a no-op
   * (returns false). Returns true if a row was actually inserted.
   */
  attach(input: {
    courseId: CourseId;
    documentId: DocumentId;
    source: "bootstrap" | "manual" | "ingestion";
  }): Promise<{ attached: boolean }>;

  /** Detach. Idempotent: detaching an unlinked doc returns false. */
  detach(input: { courseId: CourseId; documentId: DocumentId }): Promise<{ detached: boolean }>;

  /**
   * Bulk attach used at confirm-draft time. Skips already-attached documents.
   * Returns the list of newly attached document ids.
   */
  attachMany(input: {
    courseId: CourseId;
    documentIds: ReadonlyArray<DocumentId>;
    source: "bootstrap" | "manual" | "ingestion";
  }): Promise<{ newlyAttached: DocumentId[] }>;
}
```

**Impl file**: `packages/core/src/services/course-documents-service.ts` (new)

```typescript
import { courseDocuments, documents } from "@praxis/artifacts/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import type {
  CourseDocumentsService,
  CourseId,
  DocumentId,
  DocumentSummaryItem,
  Logger,
} from "../types/index.js";
import { brandId } from "../types/index.js";

export interface CourseDocumentsServiceDeps {
  db: PraxisDb;
  log: Logger;
}

export class CourseDocumentsServiceImpl implements CourseDocumentsService {
  constructor(private readonly deps: CourseDocumentsServiceDeps) {}

  async listForCourse(courseId: CourseId): Promise<DocumentId[]> {
    const rows = this.deps.db
      .select({ documentId: courseDocuments.documentId })
      .from(courseDocuments)
      .where(eq(courseDocuments.courseId, courseId))
      .orderBy(courseDocuments.attachedAt)
      .all();
    return rows.map((r) => brandId<"DocumentId">(r.documentId));
  }

  async listForCourseDetailed(courseId: CourseId): Promise<DocumentSummaryItem[]> {
    // Inner-joined select against `documents` for the title/manifest fields.
    // Implementation: same SELECT shape as ArtifactsService.listDocuments,
    // restricted by INNER JOIN course_documents ON document_id = documents.id.
  }

  async attach(input): Promise<{ attached: boolean }> {
    // INSERT … ON CONFLICT DO NOTHING with rowsAffected check.
  }

  async detach(input): Promise<{ detached: boolean }> {
    // DELETE … RETURNING; check changes count.
  }

  async attachMany(input): Promise<{ newlyAttached: DocumentId[] }> {
    // Single transaction: SELECT existing → compute diff → INSERT diff → return diff.
  }
}
```

**Acceptance**:
- [ ] All five methods round-trip: write then read returns the expected rows.
- [ ] `attach` is idempotent — calling twice with same args returns `{ attached: false }` on the second call.
- [ ] `attachMany` skips already-attached documents and returns only new ids.
- [ ] FK cascade: deleting a course via `db.delete(courses)` removes its `course_documents` rows; deleting a document removes its rows.
- [ ] Listing for a course with no attachments returns `[]`, not throws.

---

### Unit 2: `ToolContext` + `ToolServices` wiring

**File**: `packages/core/src/types/tool.ts`

```typescript
export interface ToolContext {
  studentId: StudentId;
  sessionId: SessionId;
  courseId?: CourseId;
  assignmentId?: AssignmentId;
  /**
   * Phase 16: pre-computed list of document ids attached to `courseId`.
   * Populated only when `courseId` is set; tools that scope to course
   * documents (e.g., `retrieve_from_textbook`) consume this directly to
   * avoid an extra DB call per dispatch. Empty array means "no documents
   * attached yet" — tools should return empty results, not fall back to
   * library scope.
   */
  courseDocumentIds?: DocumentId[];
  /**
   * Phase 16: present only inside the explorer agent's isolated session.
   * The draft-mutation tools read it to know which draft to mutate. Outside
   * the explorer, this is undefined.
   */
  draftId?: string;
  services: ToolServices;
  log: Logger;
}

export interface ToolServices {
  // ... existing services ...
  courseDocuments: CourseDocumentsService;  // ← NEW (Phase 16)
  // ... rest unchanged ...
}
```

**File**: `packages/core/src/services/session-service.ts`

```typescript
// In openActive(), where the ToolContext is built (current ~line 479):
const courseDocumentIds: DocumentId[] | undefined =
  args.courseId !== undefined
    ? await this.deps.toolServices.courseDocuments.listForCourse(args.courseId)
    : undefined;

const toolContext: ToolContext = {
  studentId: args.studentId,
  sessionId: args.sessionId,
  ...(args.courseId !== undefined && { courseId: args.courseId }),
  ...(args.assignmentId !== undefined && { assignmentId: args.assignmentId }),
  ...(courseDocumentIds !== undefined && { courseDocumentIds }),
  services: {
    // existing services ...
    courseDocuments: this.deps.toolServices.courseDocuments,
  },
  log: this.deps.log,
};
```

**File**: `packages/core/src/services/types.ts`

```typescript
export interface ServiceDeps {
  // existing fields ...
  toolServices: {
    // existing services ...
    courseDocuments: CourseDocumentsService;  // ← NEW
  };
}
```

**Acceptance**:
- [ ] `ctx.courseDocumentIds` is set whenever `ctx.courseId` is set; both undefined otherwise.
- [ ] `ctx.services.courseDocuments` is non-null in any session, regardless of mode.
- [ ] `buildServices` (the composition root) wires `CourseDocumentsServiceImpl` into `ServiceDeps.toolServices.courseDocuments`.

---

### Unit 3: Update `retrieve_from_textbook` to default-scope to course documents

**File**: `packages/tools/src/retrieval/retrieve-from-textbook.ts`

```typescript
async handler(args, ctx: ToolContext) {
  const { embeddings, vectorStore, ftsStore, documents } = ctx.services;

  // Phase 16: resolve effective document scope.
  //   1. Explicit args.documentIds wins (cross-course override).
  //   2. Otherwise, if a course is in scope, restrict to its attached docs.
  //   3. Otherwise (bootstrap, configure outside a course), search the whole
  //      student library — preserves today's pre-course behavior.
  let effectiveDocumentIds: string[] | undefined = args.documentIds;
  if (effectiveDocumentIds === undefined && ctx.courseDocumentIds !== undefined) {
    if (ctx.courseDocumentIds.length === 0) {
      // Course in scope but nothing attached — return empty rather than
      // silently widening to the library.
      return { query: args.query, citations: [] };
    }
    effectiveDocumentIds = ctx.courseDocumentIds;
  }

  // ... rest unchanged, threading effectiveDocumentIds into filterArgs ...
}
```

**Acceptance**:
- [ ] In a course-scoped session with no `args.documentIds`: returns only chunks from `courseDocumentIds`.
- [ ] In a course-scoped session with explicit `args.documentIds`: uses the explicit list, ignoring `courseDocumentIds` (this is the cross-course override).
- [ ] In a non-course session (e.g., bootstrap before exploration): searches the whole student library.
- [ ] When `courseDocumentIds.length === 0`, returns `{ citations: [] }` rather than expanding.

---

### Unit 4: Ingestion auto-attach

**File**: `packages/core/src/types/ingestion.ts`

```typescript
export interface IngestionRequest {
  filePath: string;
  filename: string;
  mimeType: string;
  studentId: string;
  preferIngestorId?: string;
  /**
   * Phase 16: when set, the resulting document is auto-attached to this
   * course (source: "ingestion") in the same transaction as the document
   * row. Used by the UI when the "Add document" button is pressed inside
   * a course detail view.
   */
  courseId?: string;
}
```

**File**: `packages/core/src/ingestion/service.ts`

In the `done` event path (where the document row is finalized): if `req.courseId` is set, call `this.deps.courseDocuments.attach({ courseId, documentId, source: "ingestion" })` before yielding the `done` event. Add `courseDocuments: CourseDocumentsService` to `IngestionServiceDeps`.

**File**: `packages/desktop/electron/main/ipc-server.ts`

The `praxis.ingest.start` handler accepts the optional `courseId` in its IpcEnvelope payload and forwards it into `IngestionRequest`.

**File**: `packages/client/src/services/ingest-client.ts`

The client's `start` accepts `courseId?: CourseId` and threads it through.

**Acceptance**:
- [ ] Calling `ingest()` with `courseId` set produces a document AND a `course_documents` row with `source: "ingestion"`.
- [ ] Calling without `courseId` produces only the document.
- [ ] If the auto-attach fails for any reason, the document still persists (attach is best-effort post-success, logged as a warning).

---

### Unit 5: Library + course-document tools

**File**: `packages/tools/src/course/list-library-documents.ts` (new — replaces `course.list_documents` everywhere; the old tool is deleted in Unit 11).

```typescript
import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({});
const OutputSchema = z.object({
  documents: z.array(
    z.object({
      documentId: z.string(),
      filename: z.string(),
      title: z.string().optional(),
      mimeType: z.string(),
      chunkCount: z.number(),
      ingestedAt: z.string(),
      attachedToCurrentCourse: z.boolean(),
    }),
  ),
});

export const listLibraryDocumentsTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.list_library_documents",
  description:
    "List ALL documents in the student's library, with a flag showing which are already attached to the active course. Use this when the user wants to add a previously-ingested document to the current course, or to see what's available across the library. In bootstrap mode (no course yet), `attachedToCurrentCourse` is always false.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(_args, ctx: ToolContext) {
    const docs = await ctx.services.artifacts.listDocuments(ctx.studentId);
    const attached = new Set(ctx.courseDocumentIds ?? []);
    return {
      documents: docs.map((d) => ({
        documentId: d.documentId,
        filename: d.filename,
        ...(d.title !== undefined && { title: d.title }),
        mimeType: d.mimeType,
        chunkCount: d.chunkCount,
        ingestedAt: d.createdAt,
        attachedToCurrentCourse: attached.has(d.documentId),
      })),
    };
  },
};
```

**File**: `packages/tools/src/course/list-course-documents.ts` (new)

```typescript
export const listCourseDocumentsTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.list_course_documents",
  description:
    "List documents attached to the active course. Use this in teach/configure modes when the user asks 'what materials does this course have?'. Errors if no course is in scope.",
  // input: z.object({})
  // output: same shape as list_library, minus the attachedToCurrentCourse flag (always true here).
  async handler(_args, ctx: ToolContext) {
    if (ctx.courseId === undefined) {
      throw new Error("course.list_course_documents requires a course-scoped session");
    }
    const detailed = await ctx.services.courseDocuments.listForCourseDetailed(ctx.courseId);
    return { documents: detailed };
  },
};
```

**File**: `packages/tools/src/course/attach-document.ts` (new)

```typescript
const InputSchema = z.object({
  documentId: z.string().describe("Document id from course.list_library_documents."),
});
const OutputSchema = z.object({
  attached: z.boolean(),
  message: z.string(),
});

export const attachDocumentTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.attach_document",
  description:
    "Attach an existing library document to the active course. Idempotent — returns attached=false with a message if already attached. Errors if no course is in scope.",
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx) {
    if (ctx.courseId === undefined) throw new Error("requires a course-scoped session");
    const result = await ctx.services.courseDocuments.attach({
      courseId: ctx.courseId,
      documentId: brandId<"DocumentId">(args.documentId),
      source: "manual",
    });
    return {
      attached: result.attached,
      message: result.attached ? "Document attached." : "Document was already attached.",
    };
  },
};
```

**File**: `packages/tools/src/course/detach-document.ts` (new)

Same shape; calls `courseDocuments.detach`. Error message if document is referenced by a confirmed lesson is *informational only* — we still detach (the lesson reference becomes a dead link the agent can re-attach later or replace). Future Phase could elevate to a hard block, but not in v1.

**Acceptance for the four tools**:
- [ ] `list_library_documents` returns every document the student has, with correct `attachedToCurrentCourse` flag.
- [ ] `list_course_documents` returns only attached docs and errors with no course in scope.
- [ ] `attach_document` and `detach_document` are idempotent and require `ctx.courseId`.
- [ ] All four tools have integration coverage via the standard tool-handler test pattern.

**Delete `course.list_documents`**. The existing tool's output is a strict subset of `course.list_library_documents` (the latter just adds the `attachedToCurrentCourse` flag, which is `false` everywhere when no course is in scope — i.e., bootstrap mode). Keeping both would be unused surface area.

In Unit 11's atomic deletion step, also:
- Delete `packages/tools/src/course/list-documents.ts`.
- Remove `listDocumentsTool` from `COURSE_TOOLS`.
- Remove `"course.list_documents"` from `bootstrap.toolNames` and `configure.toolNames`.
- Replace it with `"course.list_library_documents"` in both modes.
- Update the bootstrap-role prompt fragment to call `course.list_library_documents` instead of `course.list_documents`.

Distribution of the three list tools post-Phase-16:

| Tool | Use |
|---|---|
| `course.list_library_documents` | "What documents does this student have ingested?" — works in any mode. Sets `attachedToCurrentCourse: true` for docs already in the active course. |
| `course.list_course_documents` | "What documents does THIS course use?" — errors without `ctx.courseId`. Used in teach/configure for "show me the materials." |
| ~~`course.list_documents`~~ | Deleted. Strict subset of `list_library_documents`. |

---

### Unit 6: Deterministic document tools

These are the "deterministic search" half of the user's request — no LLM in the loop, pure DB lookups.

**File**: `packages/tools/src/document/list-sections.ts` (new — `packages/tools/src/document/` is a new directory)

```typescript
import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  documentId: z.string(),
});
const OutputSchema = z.object({
  documentId: z.string(),
  documentTitle: z.string(),
  sections: z.array(
    z.object({
      section: z.string(),
      firstPage: z.number().int().optional(),
      lastPage: z.number().int().optional(),
      chunkCount: z.number().int(),
    }),
  ),
});

export const documentListSectionsTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "document.list_sections",
  description:
    "List the sections (chapters, headings) of a document with page ranges and chunk counts. Use this to get a deterministic overview of a textbook's structure before deciding which sections to read in detail. Faster and more reliable than retrieve_from_textbook for 'what's in this book' questions.",
  input: InputSchema,
  output: OutputSchema,
  tier: "deterministic",
  effects: ["none"],
  async handler(args, ctx) {
    // SQL: SELECT locator_json, page from document_chunks WHERE document_id = ?
    //      ORDER BY chunk_index;
    // Group by locator_json.section, aggregate (count, min(page), max(page)).
    // Hydrate documentTitle via ctx.services.documents.titlesByIds([documentId]).
  },
};
```

**File**: `packages/tools/src/document/read-pages.ts` (new)

```typescript
const InputSchema = z.object({
  documentId: z.string(),
  fromPage: z.number().int().min(1),
  toPage: z.number().int().min(1),
  maxChunks: z.number().int().min(1).max(50).default(20),
});
const OutputSchema = z.object({
  documentId: z.string(),
  page: z.object({ from: z.number(), to: z.number() }),
  chunks: z.array(
    z.object({
      chunkIndex: z.number(),
      page: z.number().optional(),
      section: z.string().optional(),
      text: z.string(),
    }),
  ),
  truncated: z.boolean(),
});

export const documentReadPagesTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "document.read_pages",
  description:
    "Read a specific page range of a document and return the chunks in document order. Use this when you've identified a section you want to read in full (e.g., from list_sections) — semantic search would be wasteful when you already know the location. Capped at 50 chunks; if the range exceeds the cap, the response is truncated and `truncated: true` is set.",
  // ... handler queries documentChunks by documentId, filters by locator.page range
};
```

**File**: `packages/tools/src/document/outline.ts` (new)

```typescript
const OutputSchema = z.object({
  documentId: z.string(),
  documentTitle: z.string(),
  pageCount: z.number().int().optional(),
  chunkCount: z.number().int(),
  sectionCount: z.number().int(),
  /** First chunk's first 200 chars — usually the title page or preface. */
  preview: z.string(),
});

export const documentOutlineTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "document.outline",
  description:
    "Single-call summary of a document: page count, chunk count, section count, and a short preview. Cheapest way to orient before deciding whether to list sections or do retrieval. Always call this first when you encounter a new document.",
};
```

**Acceptance**:
- [ ] All three tools are registered, tier `"deterministic"`, no model calls.
- [ ] `list_sections` produces section ranges that match Sullivan's actual chapter structure when run on the user's ingested PDF.
- [ ] `read_pages` returns chunks within the page range in document order, truncates at `maxChunks`, sets `truncated` flag correctly.
- [ ] All three reject documents the student doesn't own (defense-in-depth: filter by `studentId` join even though tools should already be scoped).

---

### Unit 7: BootstrapService incremental draft mutations

**File**: `packages/core/src/services/bootstrap-service.ts` (modify — add new methods)

```typescript
// Add to BootstrapServiceImpl:

/**
 * Phase 16: create a new draft up-front (before the explorer has any concepts
 * to add). Used by the explorer's draft_init tool. Replaces the old
 * proposeDraft method, which assembled a full draft in one shot.
 */
async initDraft(input: {
  studentId: StudentId;
  documentIds: DocumentId[];
  courseTitle: string;
  subject: string;
  gradeLevel: string;
}): Promise<{ draftId: string }> {
  const now = Date.now() as Timestamp;
  const draft: DraftCourseState = {
    draftId: uuidv7(),
    studentId: input.studentId,
    documentIds: input.documentIds,
    proposed: {
      title: input.courseTitle,
      subject: input.subject,
      gradeLevel: input.gradeLevel,
      thresholds: {
        conceptMastery: 0.7,
        examPass: 0.7,
        allowRetake: true,
        decayDays: 14,
      },
      proposedConcepts: [],
      proposedEdges: [],
      proposedLessons: [],
    },
    createdAt: now,
    lastTouchedAt: now,
    expiresAt: (now + DRAFT_TTL_MS) as Timestamp,
  };
  this.drafts.set(draft.draftId, draft);
  return { draftId: draft.draftId };
}

/**
 * Phase 16: incremental concept addition. Validates uniqueness (case-
 * insensitive) and rejects duplicates rather than silently merging. Returns
 * the updated proposed concept count so the agent has a running tally.
 */
async addConcept(input: {
  draftId: string;
  name: string;
  description: string;
}): Promise<{ ok: true; conceptCount: number } | { ok: false; reason: string }> {
  const d = await this.showDraft(input.draftId);
  if (!d) return { ok: false, reason: "draft not found or expired" };
  const lower = input.name.trim().toLowerCase();
  if (d.proposed.proposedConcepts.some((c) => c.name.trim().toLowerCase() === lower)) {
    return { ok: false, reason: `concept "${input.name}" already exists` };
  }
  d.proposed.proposedConcepts.push({
    name: input.name.trim(),
    description: input.description.trim(),
    evidence: [],
  });
  d.lastTouchedAt = Date.now() as Timestamp;
  return { ok: true, conceptCount: d.proposed.proposedConcepts.length };
}

async removeConcept(input: { draftId: string; name: string }): Promise<{ ok: boolean; reason?: string }> { /* ... */ }

async addEdge(input: {
  draftId: string;
  fromName: string;
  toName: string;
  strength: number;
  rationale: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  // Validate both endpoints exist; reject self-edges; reject duplicate edges.
}

async addLesson(input: {
  draftId: string;
  title: string;
  conceptNames: string[];
  references: ReadonlyArray<Reference>;
  suggestedStrategy?: StrategyId;
  estimatedMinutes?: number;
}): Promise<{ ok: true; lessonIndex: number } | { ok: false; reason: string }> {
  // Validate every conceptName exists in proposedConcepts.
}

async removeLesson(input: { draftId: string; lessonIndex: number }): Promise<{ ok: boolean }> { /* ... */ }

async setMetadata(input: {
  draftId: string;
  title?: string;
  subject?: string;
  gradeLevel?: string;
  thresholds?: Partial<ThresholdConfig>;
}): Promise<{ ok: boolean }> { /* ... */ }

/**
 * Phase 16: validates the draft is internally consistent (every lesson
 * references real concepts, every edge references real concepts, at least
 * one concept and one lesson exist). On success, returns the same DraftSummary
 * shape as proposeDraft did. On failure, returns a structured list of issues
 * the explorer can read and try to fix.
 */
async finalizeDraft(input: { draftId: string }): Promise<
  | { ok: true; summary: DraftSummary }
  | { ok: false; issues: ReadonlyArray<{ kind: string; message: string }> }
> {
  const d = await this.showDraft(input.draftId);
  if (!d) return { ok: false, issues: [{ kind: "draft_missing", message: "draft expired or not found" }] };
  const issues = validateProposed(d.proposed); // existing helper — refactor to return issues, not throw.
  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, summary: buildSummary(d) };
}
```

**Refactor `validateProposed`** to return `Issue[]` directly (currently it throws). `finalizeDraft` consumes the array. No compatibility shim — the only previous caller (`proposeDraft`) is being deleted in Unit 11.

**Delete the following from `BootstrapServiceImpl` and the `BootstrapService` interface** (`packages/core/src/types/tool.ts`):
- `proposeDraft(input: ProposeDraftInput): ...` method
- `ProposeDraftInput` interface
- The private `readChunksFor(documentIds)` helper (was only used by `proposeDraft`)

**Update `BootstrapService` interface** in `packages/core/src/types/tool.ts` to expose the new incremental methods (`initDraft`, `addConcept`, `removeConcept`, `addEdge`, `addLesson`, `removeLesson`, `setMetadata`, `finalizeDraft`).

**Acceptance**:
- [ ] All new methods are typed, return structured errors (no thrown exceptions for invalid agent inputs — those become tool errors).
- [ ] `finalizeDraft` rejects drafts with: zero concepts, zero lessons, lessons referencing unknown concepts, edges referencing unknown concepts, and reports each as a separate issue.
- [ ] `BootstrapService.proposeDraft`, `ProposeDraftInput`, and `readChunksFor` are gone from the codebase — no callers remain.

---

### Unit 8: Draft mutation tools

For each `BootstrapService` method above, a corresponding tool. They all follow the same pattern: validate `ctx.draftId` (set during exploration), dispatch the matching service call, return the structured result.

**File**: `packages/tools/src/course/draft-init.ts`

```typescript
const InputSchema = z.object({
  courseTitle: z.string().min(1),
  subject: z.string().min(1),
  gradeLevel: z.string().min(1),
  documentIds: z.array(z.string()).min(1),
});
const OutputSchema = z.object({
  draftId: z.string(),
});

export const draftInitTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.draft_init",
  description:
    "Create an empty course draft. Call this once at the start of exploration, before adding any concepts. The returned `draftId` must be passed to all subsequent draft_* calls. (Note: most explorer-tool calls receive draftId implicitly via the session context — but for clarity, the explorer can also re-supply it.)",
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx) {
    const result = await ctx.services.bootstrap.initDraft({
      studentId: ctx.studentId,
      documentIds: args.documentIds.map((id) => brandId<"DocumentId">(id)),
      courseTitle: args.courseTitle,
      subject: args.subject,
      gradeLevel: args.gradeLevel,
    });
    return result;
  },
};
```

The remaining draft tools (`draft_set_metadata`, `draft_add_concept`, `draft_remove_concept`, `draft_add_edge`, `draft_add_lesson`, `draft_remove_lesson`, `draft_finalize`) follow the same pattern, each dispatching to its `BootstrapService` method. Each takes `draftId: z.string()` as the first input field.

`draft_finalize`'s output schema includes the full `DraftSummary` so the explorer's caller can read it directly.

**Acceptance**:
- [ ] Every draft-mutation tool is registered, tier `"grounded"`, with `effects: ["artifact.mutate"]`.
- [ ] Each rejects an unknown `draftId` with a tool error, not a throw.
- [ ] `draft_finalize` returns a `DraftSummary` on success and an `issues` array on failure.

---

### Unit 9: The explorer

**File**: `packages/curriculum/src/bootstrap/explorer.ts` (new — replaces `extractor.ts`)

```typescript
import type { Engine, EngineEvent, Logger, ToolContext, ToolDefinition } from "@praxis/core/types";
import { InProcessToolRegistry } from "@praxis/tools";
import { EXPLORER_SYSTEM_PROMPT } from "./explorer-prompt.js";

export interface RunConceptExplorerInput {
  engine: Engine;
  /** The base ToolContext from the live tutor session. Cloned with overrides. */
  baseContext: Omit<ToolContext, "courseId" | "courseDocumentIds">;
  /** Tools the explorer is allowed to call. Must include the draft mutation tools and at least one search tool. */
  toolDefinitions: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
  documentIds: ReadonlyArray<DocumentId>;
  courseTitle: string;
  subject: string;
  gradeLevel: string;
  log: Logger;
  /** Maximum loop steps. Default 30 — generous for a 50-concept extraction with ~15 retrievals. */
  maxSteps?: number;
}

export interface RunConceptExplorerResult {
  ok: boolean;
  draftId?: string;
  summary?: DraftSummary;
  /** Reason the explorer ended without finalizing. */
  reason?: "max_steps_reached" | "engine_error" | "no_finalize_call" | "validation_failed";
  issues?: ReadonlyArray<{ kind: string; message: string }>;
  stepsUsed: number;
}

/**
 * Drive the explorer agent in a fresh isolated engine session.
 *
 * Lifecycle:
 *   1. Open EngineSession with EXPLORER_SYSTEM_PROMPT and a scoped tool registry.
 *   2. send() the initial user message (course params + document list + outline hint).
 *   3. The SDK loops internally: model → tool → model → tool → ... → final.
 *   4. We drain the event stream and watch for the draft_finalize tool result.
 *   5. Close the session.
 */
export async function runConceptExplorer(
  input: RunConceptExplorerInput,
): Promise<RunConceptExplorerResult> {
  const tools = new InProcessToolRegistry({
    tools: input.toolDefinitions,
    context: { ...input.baseContext, draftId: undefined } as ToolContext,
    log: input.log.child({ component: "explorer-tools" }),
  });

  const session = await input.engine.open({
    systemPrompt: EXPLORER_SYSTEM_PROMPT,
    tools,
    maxSteps: input.maxSteps ?? 30,
  });

  let draftId: string | undefined;
  let finalizeSummary: DraftSummary | undefined;
  let finalizeIssues: ReadonlyArray<{ kind: string; message: string }> | undefined;
  let stepsUsed = 0;

  const initialMessage = buildInitialMessage(input);

  try {
    for await (const ev of session.send(initialMessage)) {
      if (ev.type === "tool_call") stepsUsed++;
      if (ev.type === "tool_result" && ev.result.ok) {
        const value = ev.result.value as Record<string, unknown>;
        // The init tool's output exposes draftId — we capture it so we can
        // also re-attach to ctx.draftId for downstream calls.
        if (typeof value.draftId === "string" && draftId === undefined) {
          draftId = value.draftId;
          // Mutate the registry's bound context so subsequent tools see draftId.
          tools.setContextField("draftId", draftId);
        }
        // The finalize tool's output is the success signal.
        if (typeof value.summary === "object" && value.summary !== null && "lessonCount" in value.summary) {
          finalizeSummary = value.summary as DraftSummary;
        }
        if (Array.isArray(value.issues)) {
          finalizeIssues = value.issues as ReadonlyArray<{ kind: string; message: string }>;
        }
      }
      if (ev.type === "error") {
        return { ok: false, reason: "engine_error", stepsUsed, ...(draftId !== undefined && { draftId }) };
      }
    }
  } finally {
    await session.close();
  }

  if (finalizeSummary !== undefined && draftId !== undefined) {
    return { ok: true, draftId, summary: finalizeSummary, stepsUsed };
  }
  if (finalizeIssues !== undefined) {
    return { ok: false, reason: "validation_failed", issues: finalizeIssues, stepsUsed, ...(draftId !== undefined && { draftId }) };
  }
  if (stepsUsed >= (input.maxSteps ?? 30)) {
    return { ok: false, reason: "max_steps_reached", stepsUsed, ...(draftId !== undefined && { draftId }) };
  }
  return { ok: false, reason: "no_finalize_call", stepsUsed, ...(draftId !== undefined && { draftId }) };
}

function buildInitialMessage(input: RunConceptExplorerInput): string {
  return [
    `Course title: ${input.courseTitle}`,
    `Subject: ${input.subject}`,
    `Grade level: ${input.gradeLevel}`,
    `Source documents (${input.documentIds.length}): ${input.documentIds.join(", ")}`,
    "",
    `Your job: explore these documents using the tools available, then assemble a concept graph and lesson plan that fits the course brief above. Start with document.outline on each document, then list sections, then read or retrieve as needed.`,
  ].join("\n");
}
```

**Note on `tools.setContextField`**: this is a small new method on `InProcessToolRegistry` — `setContextField<K extends keyof ToolContext>(key: K, value: ToolContext[K]): void`. It mutates the bound context after registry construction so `draftId` (which doesn't exist until `draft_init` runs) becomes visible to subsequent tool calls. This is the cleanest place to thread the draft id without making every draft tool re-take it as an argument. (Tools still accept `draftId` in their input schema as a defensive override; the explorer's prompt instructs it to omit the arg and rely on context.)

**Acceptance**:
- [ ] Explorer opens and closes its session in all paths (success, max-steps, error).
- [ ] Returns `{ ok: true, draftId, summary }` when the explorer calls `draft_finalize` successfully.
- [ ] Returns `{ ok: false, reason: "max_steps_reached" }` when step budget is exhausted before finalize.
- [ ] Returns `{ ok: false, reason: "validation_failed", issues: [...] }` when finalize rejects.
- [ ] Returns `{ ok: false, reason: "engine_error" }` on any engine event of type `"error"`.
- [ ] All new tool calls are observable via the `log.child({ component: "explorer-tools" })` namespace.

---

### Unit 10: Explorer system prompt

**File**: `packages/curriculum/src/bootstrap/explorer-prompt.ts` (new — replaces `extractor-prompt.ts`)

```typescript
export const EXPLORER_SYSTEM_PROMPT = `You are a curriculum-design agent. The user has provided one or more textbooks and wants you to produce a course's concept graph and lesson plan. You are NOT given the documents directly — you have a tool surface to explore them and build the course incrementally.

Your tools:

EXPLORATION (read-only):
- document.outline(documentId) — cheapest first call. Page count, chunk count, section count, preview.
- document.list_sections(documentId) — TOC-style listing with page ranges and chunk counts.
- document.read_pages(documentId, fromPage, toPage) — read a specific page range verbatim.
- retrieve_from_textbook(query) — semantic + lexical search across all source documents.

DRAFT SHAPING (write — to your own draft, not directly to the database):
- course.draft_init(courseTitle, subject, gradeLevel, documentIds) — call ONCE at the start. Returns draftId.
- course.draft_set_metadata(...) — adjust title/subject/gradeLevel/thresholds.
- course.draft_add_concept(name, description) — add ONE concept. Names are case-insensitive unique.
- course.draft_remove_concept(name) — undo.
- course.draft_add_edge(fromName, toName, strength, rationale) — prerequisite edge between existing concepts. strength 0.0-1.0.
- course.draft_add_lesson(title, conceptNames[], references[], suggestedStrategy?, estimatedMinutes?) — add ONE lesson. Every conceptName must already exist.
- course.draft_remove_lesson(lessonIndex) — undo.
- course.draft_finalize() — validate + freeze the draft. Call this LAST. Failure returns issues[]; fix them and call again.

Pattern:

1. Call document.outline on every source document.
2. For each document, call document.list_sections to see structure.
3. Pick a course scope that matches the user's brief (subject, grade level). Skip irrelevant sections.
4. Call course.draft_init with the title/subject/grade-level and the document ids.
5. Walk the relevant sections in order. For each section:
   a. Call document.read_pages or retrieve_from_textbook to understand the content.
   b. Identify ~3-7 concepts in that section. Call course.draft_add_concept for each.
   c. Call course.draft_add_edge for prerequisites.
   d. Call course.draft_add_lesson grouping the concepts (~30-60 min of teaching, ~3-7 concepts per lesson).
6. Once all sections are covered, call course.draft_finalize.
7. If finalize returns issues, READ them and call the relevant fixup tools, then finalize again. Don't loop more than twice on issues.

Rules:
- Cap total concepts at ~50 unless the materials clearly justify more. Course quality beats coverage.
- Concept names: 1-4 words, descriptive, no abbreviations the student wouldn't know.
- Strength on edges: 0.9 = strict prerequisite ("can't learn B without A"), 0.3 = weak suggestion. Default 0.7 if uncertain.
- Lessons must reference real concepts. Don't promise concepts you haven't added yet.
- Keep tool calls focused. Don't re-read sections you've already processed. The conversation history shows what you've done.
- If the user's subject doesn't match the document's content (e.g., user wants "Algebra" but the document is mostly Trig), skip the off-topic sections and note it in the draft title or subject if relevant.

You do NOT talk to the user directly — your output is the draft, not prose. Tool calls only.`;
```

**Acceptance**:
- [ ] The prompt enumerates every available tool with its purpose.
- [ ] The prompt describes the canonical loop (outline → sections → init → walk-and-shape → finalize).
- [ ] The prompt explicitly forbids prose output ("tool calls only") to keep the explorer disciplined.

---

### Unit 11: `course.start_exploration` tool (replaces `course.propose_draft`)

**File**: `packages/tools/src/course/start-exploration.ts` (new). `propose-draft.ts` is deleted in this unit — see "Files deleted by this design" below.

```typescript
import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { runConceptExplorer } from "@praxis/curriculum/bootstrap";
import { z } from "zod";
import { documentListSectionsTool } from "../document/list-sections.js";
import { documentOutlineTool } from "../document/outline.js";
import { documentReadPagesTool } from "../document/read-pages.js";
import { retrieveFromTextbookTool } from "../retrieval/retrieve-from-textbook.js";
import { draftAddConceptTool } from "./draft-add-concept.js";
import { draftAddEdgeTool } from "./draft-add-edge.js";
import { draftAddLessonTool } from "./draft-add-lesson.js";
import { draftFinalizeTool } from "./draft-finalize.js";
import { draftInitTool } from "./draft-init.js";
import { draftRemoveConceptTool } from "./draft-remove-concept.js";
import { draftRemoveLessonTool } from "./draft-remove-lesson.js";
import { draftSetMetadataTool } from "./draft-set-metadata.js";

const InputSchema = z.object({
  documentIds: z.array(z.string()).min(1),
  courseTitle: z.string().min(1),
  subject: z.string().min(1),
  gradeLevel: z.string().min(1),
  maxSteps: z.number().int().min(5).max(60).default(30),
});

const OutputSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    draftId: z.string(),
    summary: z.object({
      title: z.string(),
      lessonCount: z.number(),
      conceptCount: z.number(),
      edgeCount: z.number(),
      firstLessons: z.array(z.object({ title: z.string(), conceptCount: z.number() })),
    }),
    stepsUsed: z.number(),
  }),
  z.object({
    ok: z.literal(false),
    reason: z.enum(["max_steps_reached", "engine_error", "no_finalize_call", "validation_failed"]),
    issues: z.array(z.object({ kind: z.string(), message: z.string() })).optional(),
    stepsUsed: z.number(),
    /** Set when the explorer got far enough to create a draft before failing. */
    draftId: z.string().optional(),
  }),
]);

export const startExplorationTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.start_exploration",
  description:
    "Run the concept-explorer agent on the selected source documents to produce a course draft. The explorer reads the documents using deterministic + semantic search tools, then builds the concept graph and lesson plan incrementally. Returns the draftId on success — pass it to course.show_draft to render the draft to the user. If `ok: false`, narrate the failure to the user and offer to retry with a tighter scope.",
  input: InputSchema,
  output: OutputSchema,
  tier: "model-derived",
  effects: ["artifact.mutate", "external.code-exec"],
  async handler(args, ctx: ToolContext) {
    const explorerToolDefs = [
      retrieveFromTextbookTool,
      documentOutlineTool,
      documentListSectionsTool,
      documentReadPagesTool,
      draftInitTool,
      draftSetMetadataTool,
      draftAddConceptTool,
      draftRemoveConceptTool,
      draftAddEdgeTool,
      draftAddLessonTool,
      draftRemoveLessonTool,
      draftFinalizeTool,
    ];

    // The explorer's engine — reuse the same factory the live session uses.
    const engine = ctx.services.engineResolver();

    const result = await runConceptExplorer({
      engine,
      baseContext: ctx,
      toolDefinitions: explorerToolDefs,
      documentIds: args.documentIds.map((id) => brandId<"DocumentId">(id)),
      courseTitle: args.courseTitle,
      subject: args.subject,
      gradeLevel: args.gradeLevel,
      log: ctx.log,
      maxSteps: args.maxSteps,
    });

    if (result.ok && result.draftId !== undefined && result.summary !== undefined) {
      return { ok: true, draftId: result.draftId, summary: result.summary, stepsUsed: result.stepsUsed };
    }
    return {
      ok: false,
      reason: result.reason ?? "engine_error",
      ...(result.issues !== undefined && { issues: result.issues }),
      ...(result.draftId !== undefined && { draftId: result.draftId }),
      stepsUsed: result.stepsUsed,
    };
  },
};
```

**Note on `ctx.services.engineResolver`**: this needs to be added to `ToolServices`. Currently the engine resolver lives on `BootstrapServiceDeps`. We surface it onto `ToolServices` so any tool can spawn an isolated agent. Wired in `buildServices` from the same source.

**Deletion of `course.propose_draft`**: in the same unit, delete `packages/tools/src/course/propose-draft.ts` and remove `proposeDraftTool` from the `COURSE_TOOLS` array in `packages/tools/src/course/index.ts`. No backward-compatibility shim, no deprecation period — Praxis has no production users yet, so removing the legacy tool is clean. Any tests of the old tool are replaced with tests of `start-exploration` (see Unit 9's test plan).

**Acceptance**:
- [ ] The tool is registered, surfaces both success and failure shapes via discriminated union, and logs every explorer step under a child logger.
- [ ] On success, `course.show_draft(draftId)` returns the same shape as it always has — the rest of the bootstrap flow is unchanged.
- [ ] On failure with reason `max_steps_reached`, the bootstrap tutor's prompt fragment instructs it to narrate the failure and offer to retry with a smaller document set.
- [ ] `packages/tools/src/course/propose-draft.ts` does not exist; `proposeDraftTool` is not exported anywhere; `COURSE_TOOLS` does not include it; no test references it.

---

### Unit 12: `course.confirm_draft` attaches documents

**File**: `packages/core/src/services/bootstrap-service.ts` — modify `confirmDraft`

```typescript
async confirmDraft(input: {
  draftId: string;
  studentId: StudentId;
}): Promise<{ courseId: CourseId; lessonIds: LessonId[]; conceptGraphId: string }> {
  const d = await this.showDraft(input.draftId);
  if (!d) throw new Error(`Draft not found or expired: ${input.draftId}`);
  if (d.studentId !== input.studentId) {
    throw new Error(`Draft owner mismatch`);
  }

  const result = persistDraft({ db: this.deps.db, draft: d, now: new Date() });

  // Phase 16: attach the source documents to the new course.
  if (d.documentIds.length > 0) {
    await this.deps.courseDocuments.attachMany({
      courseId: brandId<"CourseId">(result.courseId),
      documentIds: d.documentIds,
      source: "bootstrap",
    });
  }

  this.drafts.delete(input.draftId);
  return result;
}
```

Add `courseDocuments: CourseDocumentsService` to `BootstrapServiceDeps` and wire it in `buildServices`.

**Acceptance**:
- [ ] After `confirmDraft`, every documentId in the draft is in `course_documents` for the new course with `source: "bootstrap"`.
- [ ] If `attachMany` fails (extremely unlikely — same DB transaction context), the course persistence is NOT rolled back; we log a warning and the user can manually attach via the new picker. (Acceptable degradation.)

---

### Unit 13: Mode + prompt-fragment updates

**File**: `packages/curriculum/src/modes/bootstrap.ts`

Replace `toolNames`:

```typescript
toolNames: [
  // Library + course-document tools
  "course.list_documents",         // existing — bootstrap-mode "library view"
  "course.list_library_documents", // NEW — alternative library view (richer)
  "course.attach_document",        // NEW — for "I want to add the syllabus too" flow
  // Canonical packs (Phase 10) — unchanged
  "course.list_canonical_packs",
  "course.use_canonical_pack",
  // The new explorer entry point
  "course.start_exploration",      // NEW — replaces propose_draft for the agent
  // Existing draft lifecycle
  "course.show_draft",
  "course.edit_draft",             // legacy edit op interface, still useful for user-driven edits
  "course.confirm_draft",
  "course.discard_draft",
  // Retrieval — used by the tutor for ad-hoc lookup, NOT by the explorer (the explorer has its own scoped registry)
  "retrieve_from_textbook",
],
```

**File**: `packages/curriculum/src/modes/configure.ts`

Same replacements; add `course.list_course_documents` and `course.detach_document` (configure mode supports detach because it implies post-bootstrap editing).

**File**: `packages/curriculum/src/modes/fragments/bootstrap-role.ts`

Update the prompt template to describe the new flow:

```
Your job (bootstrap):
1. List the student's documents (course.list_documents).
2. Confirm course title, subject, grade level.
3. Check for a curated pack (course.list_canonical_packs). If one fits, offer it.
4. Otherwise, run the concept explorer (course.start_exploration) on the selected documents.
   - This kicks off an isolated agent that reads the materials and builds the draft.
   - It usually takes 30-90 seconds. Tell the user "I'm exploring your materials — this'll take a bit."
   - On success, you get a draftId. Show the draft (course.show_draft).
   - On failure (ok: false), tell the user what went wrong:
     - reason "max_steps_reached" — the materials are too large; suggest narrowing to a chapter range or a single document.
     - reason "validation_failed" — the explorer couldn't produce a coherent graph; surface the issues[] and offer to retry with a tighter scope.
     - reason "engine_error" — system error; offer to retry.
5. Refine the draft conversationally (course.edit_draft for each user request).
6. When the student confirms, call course.confirm_draft. Their selected documents will be attached to the new course automatically.
```

**File**: `packages/curriculum/src/modes/fragments/bootstrap-tools.ts` and `configure-tools.ts`

Update the tool list section to reflect the new tool names and remove `propose_draft`.

**Acceptance**:
- [ ] The bootstrap mode's tool registry no longer contains `course.propose_draft`.
- [ ] The bootstrap-role fragment mentions `course.start_exploration`, the explorer wait time, and how to handle each failure reason.
- [ ] An e2e test of bootstrap mode (with a fake engine driving the OUTER tutor, plus a fake engine driving the explorer) produces a confirmed course with attached documents.

---

### Unit 14: UI — course-aware ingestion + library reuse picker

**File**: `packages/ui/src/components/add-document-button.tsx`

Add a `courseId?: string` prop. When set, pass it to `useIngestion`'s start call. The button's existing logic stays; the only change is threading the courseId through.

**File**: `packages/ui/src/hooks/use-ingestion.ts`

`startIngestion(file, opts?: { courseId?: CourseId })` — pass `courseId` to `client.ingest.start({...})`.

**File**: `packages/ui/src/routes/course-detail.tsx` (or wherever the course detail view lives — explore confirms exact path)

The course detail page's "Add document" button passes `courseId={course.id}`.

**File**: `packages/ui/src/components/library-document-picker.tsx` (new)

A modal listing the student's library docs with their `attachedToCurrentCourse` flags. Used in the course detail view to attach existing docs without re-ingesting. Calls `client.courseDocuments.attach(...)` per row.

**Client**: `packages/client/src/services/course-documents-client.ts` (new) — IPC channels:

- `praxis.courseDocuments.listForCourse` (invoke)
- `praxis.courseDocuments.attach` (invoke)
- `praxis.courseDocuments.detach` (invoke)

These are invoke-only (not streaming).

**Acceptance**:
- [ ] In course detail view, "Add document" → ingests + auto-attaches to that course.
- [ ] In course detail view, "Reuse from library" → opens picker → attach selected → row shows `attached` immediately.
- [ ] Outside a course context (the workspace's documents sidebar), "Add document" still ingests to the library only, no attachment.

---

## Files deleted by this design

Praxis has no production users yet — this design removes the legacy code paths outright rather than maintaining a deprecation tail. Each file below is gone after Phase 16 lands; nothing routes through a shim.

| File | Replaced by | Why |
|---|---|---|
| `packages/curriculum/src/bootstrap/extractor.ts` | `packages/curriculum/src/bootstrap/explorer.ts` (Unit 9) | The single-shot dump-all extractor (including its sampling + parser-permissiveness stopgaps from the prior fix) is fully obsolete once the explorer agent lands. |
| `packages/curriculum/src/bootstrap/extractor-prompt.ts` | `packages/curriculum/src/bootstrap/explorer-prompt.ts` (Unit 10) | Prompt for the obsolete extractor. |
| `packages/curriculum/src/bootstrap/__tests__/extractor.test.ts` | `packages/curriculum/src/bootstrap/__tests__/explorer.test.ts` (Unit 9 test plan) | Tests the deleted extractor. |
| `packages/tools/src/course/propose-draft.ts` | `packages/tools/src/course/start-exploration.ts` (Unit 11) | Tool exposing the obsolete extractor. |
| `packages/tools/src/course/list-documents.ts` | `packages/tools/src/course/list-library-documents.ts` (Unit 5) | Strict subset of `list_library_documents` once that exists. Keeping both would be dead surface area. |
| Any test of `proposeDraftTool` or `listDocumentsTool` (search `propose_draft`, `proposeDraftTool`, `list_documents`, `listDocumentsTool` in `packages/tools/src/course/__tests__/` and `tests/`) | Tests of `startExplorationTool` and `listLibraryDocumentsTool` | Same. |

Symbols removed from `BootstrapService` interface (`packages/core/src/types/tool.ts`) and `BootstrapServiceImpl` (`packages/core/src/services/bootstrap-service.ts`):

- `BootstrapService.proposeDraft(...)`
- `ProposeDraftInput` interface
- `BootstrapServiceImpl.readChunksFor(...)` (private helper, only called by the deleted method)
- `BootstrapService.editDraft(...)` and `DraftEditOp` are **kept** — `course.edit_draft` is still useful for user-driven post-explorer refinements.

Symbols removed from the curriculum bootstrap barrel (`packages/curriculum/src/bootstrap/index.ts`):

- `runConceptExtractor` export
- `RunConceptExtractorInput` export
- `DEFAULT_EXTRACTOR_MAX_CHUNKS` export (sampling cap from the prior stopgap — irrelevant under the explorer)
- `sampleEvenly` export (only used by the extractor)
- `EXTRACTOR_SYSTEM_PROMPT` export

Tool registry changes (`packages/tools/src/course/index.ts`):

- Remove `proposeDraftTool` and `listDocumentsTool` from imports and from the `COURSE_TOOLS` array.
- Add the new tools listed in Units 5, 6, 8, and 11.

Mode config changes (`packages/curriculum/src/modes/bootstrap.ts`, `configure.ts`):

- Remove `"course.propose_draft"` and `"course.list_documents"` from `toolNames`.
- Add `"course.list_library_documents"` (and, in configure mode, `"course.list_course_documents"`).

After this design lands, the only place the word "extractor" should appear in the repo is in this design doc's history notes (and in any commit messages). `git grep -i extractor packages/` should return no matches.

---

## Implementation Order

The order minimizes "broken intermediate state" and follows the dependency direction strictly. Deletes are performed in the same step that introduces their replacement so the build stays green at every step.

1. **Schema** (Unit 1's table). `pnpm db:generate` to produce the migration.
2. **CourseDocumentsService** port + impl (Unit 1, rest).
3. **ToolContext + ToolServices wiring** (Unit 2). `buildServices` must compile before any tool change lands.
4. **Update `retrieve_from_textbook`** scoping (Unit 3).
5. **Ingestion auto-attach** (Unit 4) — independent, safe to land anytime after Units 1-2.
6. **Library + course-doc tools** (Unit 5).
7. **Deterministic document tools** (Unit 6).
8. **`BootstrapService` incremental mutations** (Unit 7) — adds new methods. `proposeDraft` and `readChunksFor` are NOT yet removed at this step (the old `proposeDraftTool` still depends on them); they're deleted in step 11 alongside their last caller.
9. **Draft mutation tools** (Unit 8) — register but don't add to any mode's `toolNames` yet.
10. **Explorer + explorer prompt** (Units 9 + 10) — the loop runs but isn't reachable from any mode yet. Authored under new filenames; the old `extractor.ts`, `extractor-prompt.ts`, and `extractor.test.ts` files **stay on disk** through this step.
11. **`course.start_exploration` tool + legacy deletes** (Unit 11). Atomic step:
    1. Add `start-exploration.ts` and register `startExplorationTool` in `COURSE_TOOLS`.
    2. Delete `packages/tools/src/course/propose-draft.ts` and `list-documents.ts`; remove `proposeDraftTool` and `listDocumentsTool` from `COURSE_TOOLS`.
    3. Delete `packages/curriculum/src/bootstrap/extractor.ts`, `extractor-prompt.ts`, `__tests__/extractor.test.ts`.
    4. Update `packages/curriculum/src/bootstrap/index.ts` barrel: remove `runConceptExtractor`, `RunConceptExtractorInput`, `DEFAULT_EXTRACTOR_MAX_CHUNKS`, `sampleEvenly`, `EXTRACTOR_SYSTEM_PROMPT` exports; add `runConceptExplorer`, `RunConceptExplorerInput`, `RunConceptExplorerResult`, `EXPLORER_SYSTEM_PROMPT` exports.
    5. Delete `BootstrapService.proposeDraft`, `ProposeDraftInput`, and `BootstrapServiceImpl.readChunksFor`.
    6. Delete any test file that referenced `proposeDraftTool`, `listDocumentsTool`, or `runConceptExtractor` (they're already obsolete).
    7. Run `pnpm typecheck && pnpm lint && pnpm test` — all must pass before this step is considered done. `git grep` for `extractor`, `proposeDraft`, `listDocumentsTool`, and `course.list_documents` in `packages/` must each return zero matches.
12. **`confirm_draft` attaches documents** (Unit 12).
13. **Mode + prompt updates** (Unit 13) — flips bootstrap/configure modes onto the new explorer. Removes `"course.propose_draft"` from both modes' `toolNames`.
14. **UI** (Unit 14) — last; safe because the backend is fully ready.

After Unit 13, the system is functionally complete; Unit 14 makes the new flow ergonomic in the UI. Unit 14 can ship in a separate PR.

---

## Testing

### Unit tests (colocated `*.test.ts`)

Each new tool and service method gets a focused unit test. Use the project's standard helpers (`useTempDb`, `noopLogger`, `makeFakeClient`) — see `.claude/skills/patterns/temp-db-test-helper.md` and `ui-test-helper.md`.

#### `packages/core/src/services/__tests__/course-documents-service.test.ts`
- attach is idempotent
- attachMany returns only newly attached
- detach idempotent; non-existent link returns `{ detached: false }`
- listForCourse returns rows in attach order
- FK cascade on course delete and document delete
- defensive: invalid courseId/documentId surfaces FK error

#### `packages/tools/src/document/__tests__/*.test.ts` (one file per new tool)
- list_sections groups chunks by section, computes page ranges, counts correctly
- read_pages enforces page-range bounds and `maxChunks` cap, sets `truncated` flag
- outline returns counts for a known fixture document; preview is 200-char prefix

#### `packages/tools/src/course/__tests__/draft-*.test.ts`
- draft_init creates an empty draft, returns draftId
- draft_add_concept rejects duplicates (case-insensitive)
- draft_add_edge requires both endpoints to exist
- draft_add_lesson requires every conceptName to exist
- draft_finalize fails on empty drafts, missing references, and reports issues without throwing

#### `packages/tools/src/course/__tests__/list-library-documents.test.ts` etc.
- Library list returns all student docs with correct attached flag
- Course list errors without courseId in scope
- attach/detach tools are idempotent and require courseId

#### `packages/tools/src/retrieval/__tests__/retrieve-from-textbook.test.ts` (extend existing)
- New test: with `ctx.courseId` set and `ctx.courseDocumentIds = ["doc-A"]`, returns only doc-A chunks
- New test: with `ctx.courseId` set and `ctx.courseDocumentIds = []`, returns empty without expanding to library
- New test: explicit `args.documentIds` overrides ctx scoping
- Existing tests (no courseId) keep passing

#### `packages/curriculum/src/bootstrap/__tests__/explorer.test.ts` (new — replaces `extractor.test.ts`, which is deleted in Unit 11)

The most important test. Drives the explorer with a programmable fake engine that issues a scripted sequence of tool calls:

```typescript
it("produces a valid draft when the agent walks the canonical loop", async () => {
  const engine = makeScriptedEngine([
    { call: "document.outline", args: { documentId: "d1" } },
    { call: "document.list_sections", args: { documentId: "d1" } },
    { call: "course.draft_init", args: { courseTitle: "Algebra 1", subject: "math.algebra-1", gradeLevel: "9", documentIds: ["d1"] } },
    { call: "course.draft_add_concept", args: { name: "Variables", description: "..." } },
    { call: "course.draft_add_concept", args: { name: "Equations", description: "..." } },
    { call: "course.draft_add_edge", args: { fromName: "Variables", toName: "Equations", strength: 0.9, rationale: "..." } },
    { call: "course.draft_add_lesson", args: { title: "Intro to Variables", conceptNames: ["Variables"], references: [...] } },
    { call: "course.draft_add_lesson", args: { title: "Writing Equations", conceptNames: ["Equations"], references: [...] } },
    { call: "course.draft_finalize" },
  ]);
  const result = await runConceptExplorer({ engine, ... });
  expect(result.ok).toBe(true);
  expect(result.summary?.conceptCount).toBe(2);
  expect(result.summary?.lessonCount).toBe(2);
});

it("returns max_steps_reached when the agent loops without finalizing", async () => { ... });
it("returns validation_failed when finalize rejects", async () => { ... });
it("returns engine_error when the engine emits an error event", async () => { ... });
```

The fake engine helper (`makeScriptedEngine`) is a small new test helper in `packages/curriculum/src/bootstrap/__tests__/helpers/scripted-engine.ts`. It receives a list of `{ call, args }` items and yields synthetic `tool_call` events that get dispatched against the explorer's registry, plus a final `final` event after the script is exhausted.

#### `tests/bootstrap-explorer-end-to-end.test.ts` (new)

A full integration test using `useTempDb` + a real `BootstrapServiceImpl` + the scripted explorer engine. Verifies:
- The explorer creates a draft, populates it, finalizes
- `confirm_draft` persists the course AND attaches all source documents
- A subsequent `retrieve_from_textbook` in the new course's session is correctly scoped to attached docs

---

## Verification Checklist

Run from repo root after implementation:

```bash
# Schema + migration
pnpm db:reset && pnpm db:migrate
# Confirm course_documents table exists with the correct columns and indexes:
pnpm db:show

# Type + lint + tests
pnpm typecheck    # all packages
pnpm lint         # biome
pnpm test         # full vitest suite

# Targeted runs while iterating
pnpm vitest run packages/core/src/services/__tests__/course-documents-service.test.ts
pnpm vitest run packages/tools/src/document/__tests__/
pnpm vitest run packages/tools/src/course/__tests__/draft-
pnpm vitest run packages/curriculum/src/bootstrap/__tests__/explorer.test.ts
pnpm vitest run tests/bootstrap-explorer-end-to-end.test.ts

# Confirm the legacy code paths are gone
git grep -i extractor packages/                # must return zero matches
git grep proposeDraft packages/                # must return zero matches
git grep propose_draft packages/               # must return zero matches
git grep listDocumentsTool packages/           # must return zero matches
git grep '"course.list_documents"' packages/   # must return zero matches

# Manual smoke test (Electron):
# 1. pnpm dev
# 2. Open the app, ingest a small textbook (under 200 chunks) into the library
# 3. Start a bootstrap session, ask: "Make me a course from this book"
# 4. Watch the chat — the tutor should call course.start_exploration; wait ~30-90s; show_draft
# 5. Confirm the draft; navigate to the new course; verify the document is attached (use library picker → "attached to current course" badge)
```

**Done when**:
- [ ] All tests pass (existing + new)
- [ ] `pnpm typecheck && pnpm lint` are clean
- [ ] A real bootstrap run on a >500-chunk textbook completes successfully (i.e., the Sullivan failure mode is gone)
- [ ] `course.list_documents` in teach mode shows ONLY course-attached docs (cross-course leakage fixed)
- [ ] Ingesting a document while inside a course detail view auto-attaches; ingesting from the workspace sidebar does not
- [ ] `git grep` for `extractor`, `proposeDraft`, `propose_draft`, `listDocumentsTool`, and `"course.list_documents"` in `packages/` returns zero matches — the legacy code is fully gone
