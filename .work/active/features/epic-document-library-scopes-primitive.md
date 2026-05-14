---
id: epic-document-library-scopes-primitive
kind: feature
stage: done
tags: [core, documents, ingestion, schema]
parent: epic-document-library
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# `document_scopes` polymorphic scoping primitive

## Brief

Today documents are linked to a course via `course_documents`
(`packages/artifacts/src/schema.ts:242-264`) — a course-only join, single
tier. That shape can't express bootstrap-session ownership, lesson-level
scoping, or any other future scope, and the table name leaks the assumption
that everything is course-bound.

This feature replaces `course_documents` with a polymorphic
`document_scopes` join: rows of `(document_id, scope_kind, scope_id,
source, attached_at)` where `scope_kind` starts as `'course' | 'session'`
and is extensible without schema migration. A document can have multiple
rows — multiple scopes simultaneously — supporting "this doc is attached to
a course AND was originally ingested during this bootstrap session."

The feature includes: schema change, Drizzle migration that moves existing
`course_documents` rows into `document_scopes` with `scope_kind='course'`,
`DocumentScopesServiceImpl` replacing/wrapping `CourseDocumentsServiceImpl`,
updates to every call site listed in the anchors, and updates to the
ingestion-service auto-attach path (now takes a scope, not a courseId).
This is the **foundation feature** — every other child feature in this
epic depends on it.

## Epic context

- Parent epic: `epic-document-library`
- Position in epic: **foundation feature** — three downstream features
  (`bootstrap-session-scoped-attachment`, `viewer-tab-scoped-sidebar`,
  `library-view-tabs-filters`) all consume the new scoping primitive.

## Foundation references

- `docs/ARCHITECTURE.md` — "Document scoping" section (rolled forward at
  epic-design time; this feature realizes it)

## Anchors (current implementation)

- Current schema — `packages/artifacts/src/schema.ts:242-264`
  (`course_documents` table + indexes); migration in
  `drizzle/0009_round_siren.sql`
- Service — `CourseDocumentsServiceImpl` in
  `packages/core/src/services/course-documents-service.ts:18-140` (methods:
  `listForCourse`, `listForCourseDetailed`, `attach`, `detach`,
  `attachMany`)
- Service interface — `CourseDocumentsService` in
  `packages/core/src/types/tool.ts:570-600`
- Call sites to update:
  - Bootstrap confirm — `packages/core/src/services/bootstrap-service.ts:553-566`
  - Tool — `packages/tools/src/course/attach-document.ts:26-33`
  - IPC channel — `packages/desktop/electron/main/course-documents-channel.ts`
  - IPC registration site —
    `packages/desktop/electron/main/services.ts:276` (constructs
    `CourseDocumentsServiceImpl`)
  - Ingestion auto-attach — `packages/core/src/ingestion/service.ts:32-33`
    (deps), `:243-252` (call)
  - Client RPC — `packages/client/src/services/course-documents-client.ts`
  - Client registration —
    `packages/client/src/client.ts:51` (constructs `CourseDocumentsClient`)
- Related tables stay unchanged: `documents`
  (`packages/artifacts/src/schema.ts:208-222`), `documentChunks`
  (`:224-238`)

## Architectural choice

**Polymorphic `document_scopes` single table** with `(document_id,
scope_kind, scope_id)` composite PK. Decided at epic-design. Two
alternatives were considered and rejected:

- *Multiple typed tables* (`course_documents`, `session_documents`, …):
  doesn't generalize; service has to dispatch by scope kind everywhere;
  every new scope kind = new table + new migration.
- *Tag-style "document_tags"*: too generic — loses the explicit (kind,
  id) shape we want for queries like "all docs in this session."

No FK from `scope_id` to a specific parent table — polymorphic constraint
is enforced at the service layer (validate scope exists on write).
Orphaned rows (parent deleted) are intentional: per the resolved
"Orphaned" definition for `library-view-tabs-filters`, they surface
under the Orphaned library tab.

## Design decisions (resolved by autopilot)

- **Naming**: schema table `documentScopes` (TS) / `document_scopes`
  (SQL); types `DocumentScope`, `ScopeKind`, `DocumentScopeSource`,
  `DocumentScopeAttachment`; service `DocumentScopesService` /
  `DocumentScopesServiceImpl`; file `document-scopes-service.ts`. IPC
  channel family renamed to `praxis.documentScopes.*`; client renamed to
  `DocumentScopesClient`. All call sites use the `scope: { kind, id }`
  shape rather than a positional `courseId` arg.
- **Method shape**: keeps the 5 methods from the old service (renamed:
  `listForCourse` → `listForScope`, etc.) plus adds two new methods this
  feature is the right place to land:
  - `listScopesForDocument(documentId)` — supports Orphaned detection in
    `library-view-tabs-filters`.
  - `promoteScope({ from, to, source })` — supports session→course
    promotion in `bootstrap-session-scoped-attachment` on
    `confirmDraft`. Lives here because it's a pure scope-table
    operation; landing it now means the wave-2 feature doesn't need to
    touch this service again.
- **Brand types**: `DocumentScope` is a discriminated union
  `{ kind: 'course'; id: CourseId } | { kind: 'session'; id: SessionId }`
  using the existing `CourseId` and `SessionId` brands from
  `packages/core/src/types/ids.ts`. Service stores `scope_id` as
  unbranded `text` in SQL and re-brands on read in
  `listScopesForDocument`.
- **Migration**: data-copy + drop in one Drizzle migration file. The
  Drizzle CLI generates the schema-only diff; this feature manually
  appends the `INSERT … SELECT … FROM course_documents` step and the
  `DROP TABLE course_documents` step. Migration runs in better-sqlite3's
  default transaction, so a failure rolls back.
- **Service replacement, not facade**: `CourseDocumentsService`
  interface, `CourseDocumentsServiceImpl`, `CourseDocumentsClient`,
  `course-documents-channel.ts`, the existing test file, and every
  reference deleted. Net call sites to update: ~8 across 5 packages.
- **`ServiceDeps.courseDocuments` → `ServiceDeps.documentScopes`** (and
  same on `ToolContext.services`). One field rename across the
  injection graph.
- **`IngestionRequest.courseId` → `IngestionRequest.scope?:
  DocumentScope`**. The optional auto-attach path takes the full scope,
  not a hardcoded course assumption. Internal ingestion callers update
  accordingly. Source string on auto-attach stays `"ingestion"`.
- **No cascade triggers**. When a course or session is deleted, its
  `document_scopes` rows persist as "orphaned." Cleanup is a UI concern
  (Orphaned tab in `library-view-tabs-filters`), not a DB trigger
  concern.

## Implementation Units

### Unit 1: Schema change

**File**: `packages/artifacts/src/schema.ts`

Replace the existing `courseDocuments` export (lines 240-264) with:

```typescript
// ─── Document scoping (polymorphic) ───────────────────────────────────────

export const documentScopes = sqliteTable(
  "document_scopes",
  {
    documentId: text("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    /**
     * Scope kind discriminator. Extensible without schema migration —
     * adding a new kind only requires service-layer changes plus a UI
     * surface. Current kinds: 'course' (attached to a course),
     * 'session' (attached to a specific session, typically a
     * bootstrap exploration that hasn't been confirmed into a course).
     */
    scopeKind: text("scope_kind", { enum: ["course", "session"] }).notNull(),
    /**
     * Polymorphic reference. No DB-level FK — service-layer validation
     * checks existence on write. Deleted parents leave orphaned rows by
     * design; surfaced under the Orphaned library tab.
     */
    scopeId: text("scope_id").notNull(),
    attachedAt: integer("attached_at", { mode: "timestamp_ms" }).notNull(),
    source: text("source", {
      enum: ["bootstrap", "manual", "ingestion"],
    }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.documentId, t.scopeKind, t.scopeId] }),
    scopeIdx: index("document_scopes_scope_idx").on(t.scopeKind, t.scopeId),
    documentIdx: index("document_scopes_document_idx").on(t.documentId),
  }),
);
```

Remove the `Phase 16: Course ↔ Document attachment` comment header. The
`courses` import on the existing file stays (still used by other tables).

**Acceptance Criteria**:
- [ ] `courseDocuments` export removed from `schema.ts`.
- [ ] `documentScopes` export present with shape above.
- [ ] `pnpm typecheck` passes (every consumer that imported
      `courseDocuments` is fixed in Unit 4).

---

### Unit 2: Drizzle migration

**File**: `drizzle/0014_<generated_name>.sql`

Generate the schema-side diff with `pnpm db:generate`, then append the
data-copy and drop steps. Final migration:

```sql
-- Drizzle-generated section (CREATE TABLE + indexes)
CREATE TABLE `document_scopes` (
  `document_id` text NOT NULL,
  `scope_kind` text NOT NULL,
  `scope_id` text NOT NULL,
  `attached_at` integer NOT NULL,
  `source` text NOT NULL,
  PRIMARY KEY(`document_id`, `scope_kind`, `scope_id`),
  FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`)
    ON UPDATE no action ON DELETE cascade
);
CREATE INDEX `document_scopes_scope_idx`
  ON `document_scopes` (`scope_kind`, `scope_id`);
CREATE INDEX `document_scopes_document_idx`
  ON `document_scopes` (`document_id`);

-- Manual: copy existing rows
INSERT INTO `document_scopes`
  (`document_id`, `scope_kind`, `scope_id`, `attached_at`, `source`)
SELECT `document_id`, 'course', `course_id`, `attached_at`, `source`
FROM `course_documents`;

-- Manual: drop the old table
DROP TABLE `course_documents`;
```

**Implementation Notes**:
- Run `pnpm db:generate` first; Drizzle will produce the CREATE/DROP
  diff but **won't** produce the INSERT step. Hand-edit the generated
  file to add it.
- Update `drizzle/meta/_journal.json` is automatic via `db:generate`.
- The migration name suffix is whatever Drizzle generates; commit the
  generated name unchanged.

**Acceptance Criteria**:
- [ ] Running `pnpm db:reset` (which runs migrations from scratch)
      succeeds.
- [ ] Running the migration against a DB pre-populated with
      `course_documents` rows yields a `document_scopes` table with the
      same rows under `scope_kind='course'` and no surviving
      `course_documents` table.

---

### Unit 3: Types

**File**: `packages/core/src/types/document-scopes.ts` (new)

```typescript
import type { CourseId, DocumentId, SessionId } from "./ids.js";

export type ScopeKind = "course" | "session";

/**
 * A scope owns a set of documents. A document can belong to multiple
 * scopes simultaneously — e.g., attached to a course AND remembered as
 * having been ingested during a specific bootstrap session.
 */
export type DocumentScope =
  | { kind: "course"; id: CourseId }
  | { kind: "session"; id: SessionId };

export type DocumentScopeSource = "bootstrap" | "manual" | "ingestion";

/**
 * Enriched row joining documents + document_scopes (for tool/UI output).
 * Replaces today's `DocumentSummaryItem` shape at the
 * `listForScopeDetailed` surface — `source` and `attachedAt` are scope-
 * row fields the existing summary doesn't expose, and the library view
 * wants them.
 */
export interface DocumentScopeAttachment {
  documentId: DocumentId;
  filename: string;
  mimeType: string;
  chunkCount: number;
  hasPageImages: boolean;
  source: DocumentScopeSource;
  attachedAt: Date;
}
```

Re-export from `packages/core/src/types/index.ts`.

**File**: `packages/core/src/types/tool.ts`

Replace the `CourseDocumentsService` interface block (lines 563-600)
with:

```typescript
// ─── DocumentScopesService ───────────────────────────────────────────────

/**
 * Many-to-many between scopes (course, session, …) and the student's
 * library documents. A document can be attached to zero, one, or many
 * scopes. The student library (`documents` table) is the SSOT — this
 * service only manages links.
 */
export interface DocumentScopesService {
  /** All document ids attached to a scope, in attach order. */
  listForScope(scope: DocumentScope): Promise<DocumentId[]>;

  /** Enriched summaries for the scope's documents (tool / UI output). */
  listForScopeDetailed(scope: DocumentScope): Promise<DocumentScopeAttachment[]>;

  /**
   * Attach. Idempotent on (documentId, scope.kind, scope.id).
   * Returns true iff a row was inserted.
   */
  attach(input: {
    scope: DocumentScope;
    documentId: DocumentId;
    source: DocumentScopeSource;
  }): Promise<{ attached: boolean }>;

  /** Detach. Idempotent. */
  detach(input: {
    scope: DocumentScope;
    documentId: DocumentId;
  }): Promise<{ detached: boolean }>;

  /**
   * Bulk attach (e.g., confirm-draft, multi-file ingest). Skips
   * already-attached documents. Returns the newly attached ids.
   */
  attachMany(input: {
    scope: DocumentScope;
    documentIds: ReadonlyArray<DocumentId>;
    source: DocumentScopeSource;
  }): Promise<{ newlyAttached: DocumentId[] }>;

  /**
   * All scopes a document is currently attached to.
   * Used by Orphaned detection in the library view (a document with
   * zero scope rows is orphaned).
   */
  listScopesForDocument(documentId: DocumentId): Promise<DocumentScope[]>;

  /**
   * Promote every document in `from` into `to` (idempotent per row).
   * Used by bootstrap-session-scoped-attachment when a draft is
   * confirmed — session-scope rows promote to course-scope while the
   * session rows persist for audit. Source rows are NOT removed.
   */
  promoteScope(input: {
    from: DocumentScope;
    to: DocumentScope;
    source: DocumentScopeSource;
  }): Promise<{ promoted: DocumentId[] }>;
}
```

In the `ServiceBundle` (or equivalent — line 176 has
`courseDocuments: CourseDocumentsService;`) rename to
`documentScopes: DocumentScopesService;`.

Also update `CourseDocumentsClientApi` → `DocumentScopesClientApi` to
match (same mechanical rename, plus the scope-shaped input change).

**Acceptance Criteria**:
- [ ] `DocumentScope`, `ScopeKind`, `DocumentScopeSource`, and
      `DocumentScopeAttachment` exported from
      `@praxis/core/types`.
- [ ] `DocumentScopesService` interface present; old
      `CourseDocumentsService` removed.
- [ ] `ServiceBundle.documentScopes` typed; old `courseDocuments`
      removed.

---

### Unit 4: Service implementation

**File**: `packages/core/src/services/document-scopes-service.ts` (new;
replaces `course-documents-service.ts` which gets deleted).

```typescript
import { documentScopes, documents } from "@praxis/artifacts/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { PraxisDb } from "../db/index.js";
import type {
  DocumentId,
  DocumentScope,
  DocumentScopeAttachment,
  DocumentScopeSource,
  DocumentScopesService,
  Logger,
} from "../types/index.js";
import { brandId } from "../types/index.js";

export interface DocumentScopesServiceDeps {
  db: PraxisDb;
  log: Logger;
}

export class DocumentScopesServiceImpl implements DocumentScopesService {
  constructor(private readonly deps: DocumentScopesServiceDeps) {}

  async listForScope(scope: DocumentScope): Promise<DocumentId[]> {
    const rows = this.deps.db
      .select({ documentId: documentScopes.documentId })
      .from(documentScopes)
      .where(
        and(
          eq(documentScopes.scopeKind, scope.kind),
          eq(documentScopes.scopeId, scope.id),
        ),
      )
      .orderBy(documentScopes.attachedAt)
      .all();
    return rows.map((r) => brandId<"DocumentId">(r.documentId));
  }

  async listForScopeDetailed(
    scope: DocumentScope,
  ): Promise<DocumentScopeAttachment[]> {
    const rows = this.deps.db
      .select({
        id: documents.id,
        filename: documents.filename,
        mimeType: documents.mimeType,
        chunkCount: documents.chunkCount,
        manifestJson: documents.manifestJson,
        source: documentScopes.source,
        attachedAt: documentScopes.attachedAt,
      })
      .from(documentScopes)
      .innerJoin(documents, eq(documentScopes.documentId, documents.id))
      .where(
        and(
          eq(documentScopes.scopeKind, scope.kind),
          eq(documentScopes.scopeId, scope.id),
        ),
      )
      .orderBy(documentScopes.attachedAt)
      .all();
    return rows.map((r) => {
      const manifest = r.manifestJson as { hasPageImages?: boolean } | null;
      return {
        documentId: brandId<"DocumentId">(r.id),
        filename: r.filename,
        mimeType: r.mimeType,
        chunkCount: r.chunkCount,
        hasPageImages: manifest?.hasPageImages === true,
        source: r.source as DocumentScopeSource,
        attachedAt: r.attachedAt,
      };
    });
  }

  async attach(input: {
    scope: DocumentScope;
    documentId: DocumentId;
    source: DocumentScopeSource;
  }): Promise<{ attached: boolean }> {
    const result = this.deps.db
      .insert(documentScopes)
      .values({
        documentId: input.documentId,
        scopeKind: input.scope.kind,
        scopeId: input.scope.id,
        attachedAt: new Date(),
        source: input.source,
      })
      .onConflictDoNothing()
      .run();
    return { attached: result.changes > 0 };
  }

  async detach(input: {
    scope: DocumentScope;
    documentId: DocumentId;
  }): Promise<{ detached: boolean }> {
    const result = this.deps.db
      .delete(documentScopes)
      .where(
        and(
          eq(documentScopes.documentId, input.documentId),
          eq(documentScopes.scopeKind, input.scope.kind),
          eq(documentScopes.scopeId, input.scope.id),
        ),
      )
      .run();
    return { detached: result.changes > 0 };
  }

  async attachMany(input: {
    scope: DocumentScope;
    documentIds: ReadonlyArray<DocumentId>;
    source: DocumentScopeSource;
  }): Promise<{ newlyAttached: DocumentId[] }> {
    if (input.documentIds.length === 0) return { newlyAttached: [] };

    const newlyAttached: DocumentId[] = [];
    this.deps.db.transaction(() => {
      const existing = this.deps.db
        .select({ documentId: documentScopes.documentId })
        .from(documentScopes)
        .where(
          and(
            eq(documentScopes.scopeKind, input.scope.kind),
            eq(documentScopes.scopeId, input.scope.id),
            inArray(
              documentScopes.documentId,
              input.documentIds as DocumentId[],
            ),
          ),
        )
        .all();
      const existingSet = new Set(existing.map((r) => r.documentId));
      const toInsert = (input.documentIds as DocumentId[]).filter(
        (id) => !existingSet.has(id),
      );
      if (toInsert.length > 0) {
        const now = new Date();
        this.deps.db
          .insert(documentScopes)
          .values(
            toInsert.map((documentId) => ({
              documentId,
              scopeKind: input.scope.kind,
              scopeId: input.scope.id,
              attachedAt: now,
              source: input.source,
            })),
          )
          .run();
        newlyAttached.push(...toInsert.map((id) => brandId<"DocumentId">(id)));
      }
    });
    return { newlyAttached };
  }

  async listScopesForDocument(
    documentId: DocumentId,
  ): Promise<DocumentScope[]> {
    const rows = this.deps.db
      .select({
        scopeKind: documentScopes.scopeKind,
        scopeId: documentScopes.scopeId,
      })
      .from(documentScopes)
      .where(eq(documentScopes.documentId, documentId))
      .all();
    return rows.map((r) =>
      r.scopeKind === "course"
        ? { kind: "course", id: brandId<"CourseId">(r.scopeId) }
        : { kind: "session", id: brandId<"SessionId">(r.scopeId) },
    );
  }

  async promoteScope(input: {
    from: DocumentScope;
    to: DocumentScope;
    source: DocumentScopeSource;
  }): Promise<{ promoted: DocumentId[] }> {
    const ids = await this.listForScope(input.from);
    const result = await this.attachMany({
      scope: input.to,
      documentIds: ids,
      source: input.source,
    });
    return { promoted: result.newlyAttached };
  }
}
```

**Acceptance Criteria**:
- [ ] Service implements `DocumentScopesService` exactly; typecheck
      passes.
- [ ] All 7 methods covered by tests (see Unit 7).

---

### Unit 5: Call-site sweep

Sequential string-edits against each call site. None of these change
semantics — just the shape of the arguments.

**`packages/core/src/services/bootstrap-service.ts:553-566`** —
`attachMany` call:
```typescript
// Before:
await this.deps.courseDocuments.attachMany({
  courseId: result.courseId,
  documentIds: d.documentIds,
  source: "bootstrap",
});
// After:
await this.deps.documentScopes.attachMany({
  scope: { kind: "course", id: result.courseId },
  documentIds: d.documentIds,
  source: "bootstrap",
});
```
Also update `BootstrapServiceImpl` deps type:
`courseDocuments: CourseDocumentsService` → `documentScopes:
DocumentScopesService`.

**`packages/tools/src/course/attach-document.ts:26-33`** — tool handler:
```typescript
const result = await ctx.services.documentScopes.attach({
  scope: { kind: "course", id: ctx.courseId },
  documentId: brandId<"DocumentId">(args.documentId) as DocumentId,
  source: "manual",
});
```

**`packages/core/src/ingestion/service.ts`**:
- Line 32-33: rename `courseDocuments?: CourseDocumentsService` →
  `documentScopes?: DocumentScopesService`.
- `IngestionRequest.courseId?` → `IngestionRequest.scope?:
  DocumentScope` (find the type definition; likely in
  `packages/core/src/types/ingestion.ts` or similar).
- Line 243-252: replace the auto-attach block:
  ```typescript
  if (req.scope !== undefined && this.deps.documentScopes !== undefined) {
    try {
      await this.deps.documentScopes.attach({
        scope: req.scope,
        documentId: brandId<"DocumentId">(documentId) as DocumentId,
        source: "ingestion",
      });
    } catch (err) {
      this.deps.log.warn(
        "auto-attach to scope failed; document still persisted",
        { scope: req.scope, error: String(err) },
      );
    }
  }
  ```

**`packages/desktop/electron/main/services.ts:276`** — registration:
```typescript
const documentScopesService = new DocumentScopesServiceImpl({ db, log });
```
And update the `services` bundle's field name from `courseDocuments` to
`documentScopes`.

**`packages/desktop/electron/main/course-documents-channel.ts`** —
rename file to `document-scopes-channel.ts`. Update channel names from
`praxis.courseDocuments.*` to `praxis.documentScopes.*`. Update method
signatures to take `scope: DocumentScope` instead of `courseId`. The
file's contents replace cleanly — see anchors for current shape; new
shape mirrors the service interface.

**`packages/client/src/services/course-documents-client.ts`** — rename
file to `document-scopes-client.ts`. Update class name to
`DocumentScopesClient`, channel prefix to `praxis.documentScopes`, all
method signatures take `scope`.

**`packages/client/src/client.ts:51`** — registration:
```typescript
documentScopes: new DocumentScopesClient(transport),
```
And update the `PraxisClient` interface field name.

**`packages/desktop/electron/main/services.ts`** — find where
`registerCourseDocumentsHandlers` is called and rename to
`registerDocumentScopesHandlers`.

**Sweep**: after all the above, run `pnpm typecheck` from repo root. Any
remaining references to `courseDocuments`, `CourseDocumentsService`,
`CourseDocumentsServiceImpl`, `CourseDocumentsClient`, or
`praxis.courseDocuments` are stragglers — fix them.

**Acceptance Criteria**:
- [ ] No remaining references to `CourseDocuments*` symbols or
      `courseDocuments` field names anywhere in the repo (except in
      this design doc, which is allowed to reference history).
- [ ] `pnpm typecheck` passes.

---

### Unit 6: Delete dead code

Files to delete:
- `packages/core/src/services/course-documents-service.ts`
- `packages/core/src/services/__tests__/course-documents-service.test.ts`
  (replaced by Unit 7's new test file)

Symbols to remove:
- `CourseDocumentsService` interface from
  `packages/core/src/types/tool.ts` (replaced by `DocumentScopesService`
  in Unit 3)
- `CourseDocumentsClientApi` from wherever it lives (likely
  `packages/core/src/types/`)
- Any `import` of removed symbols

**Acceptance Criteria**:
- [ ] `grep -r "CourseDocuments" packages/` returns nothing.
- [ ] `grep -r "courseDocuments" packages/` returns nothing.

---

### Unit 7: Tests

**File**: `packages/core/src/services/__tests__/document-scopes-service.test.ts`
(new — replaces the deleted `course-documents-service.test.ts`)

Replicate the existing test structure with the new API surface, plus new
tests:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { noopLogger } from "../../../../../tests/helpers/mocks.js";
import { DocumentScopesServiceImpl } from "../document-scopes-service.js";
import type { CourseId, DocumentId, SessionId } from "../../types/index.js";
import { brandId } from "../../types/index.js";

describe("DocumentScopesServiceImpl", () => {
  const ctx = useTempDb();
  let service: DocumentScopesServiceImpl;
  const courseA = brandId<"CourseId">("course-a") as CourseId;
  const sessionA = brandId<"SessionId">("session-a") as SessionId;
  const docA = brandId<"DocumentId">("doc-a") as DocumentId;
  const docB = brandId<"DocumentId">("doc-b") as DocumentId;

  beforeEach(() => {
    service = new DocumentScopesServiceImpl({ db: ctx.db, log: noopLogger() });
    // seed: insert course rows + document rows so FK works
    // (use raw inserts here — that's what the existing test does)
  });

  describe("attach + listForScope", () => {
    it("attaches a document to a course and lists it", async () => { /* ... */ });
    it("attaches a document to a session", async () => { /* ... */ });
    it("is idempotent — re-attaching returns attached:false", async () => { /* ... */ });
    it("allows the same document in multiple scopes simultaneously", async () => {
      await service.attach({
        scope: { kind: "course", id: courseA },
        documentId: docA,
        source: "manual",
      });
      await service.attach({
        scope: { kind: "session", id: sessionA },
        documentId: docA,
        source: "bootstrap",
      });
      const scopes = await service.listScopesForDocument(docA);
      expect(scopes).toHaveLength(2);
    });
  });

  describe("detach", () => { /* mirror of existing tests */ });
  describe("attachMany", () => { /* mirror of existing tests */ });

  describe("listScopesForDocument", () => {
    it("returns empty for an unattached doc", async () => { /* ... */ });
    it("returns all scopes for a multi-scoped doc", async () => { /* ... */ });
  });

  describe("promoteScope", () => {
    it("copies all docs from one scope to another", async () => {
      await service.attachMany({
        scope: { kind: "session", id: sessionA },
        documentIds: [docA, docB],
        source: "bootstrap",
      });
      const result = await service.promoteScope({
        from: { kind: "session", id: sessionA },
        to: { kind: "course", id: courseA },
        source: "bootstrap",
      });
      expect(result.promoted).toHaveLength(2);
      // Both scopes survive
      const fromIds = await service.listForScope({ kind: "session", id: sessionA });
      const toIds = await service.listForScope({ kind: "course", id: courseA });
      expect(fromIds).toHaveLength(2);
      expect(toIds).toHaveLength(2);
    });
    it("is idempotent on re-promote", async () => { /* ... */ });
  });
});
```

**Migration verification test** — covered by the existing migration
infrastructure: `useTempDb()` runs all migrations on a fresh DB. As long
as the migration succeeds and the service tests pass, the schema is
correct. No separate "verify backfill" test is needed beyond a manual
check during development (since fresh test DBs start empty, there's no
backfill to verify in CI). For local verification, `pnpm db:reset` on a
populated dev DB + `pnpm db:show` confirms the row counts match.

**Existing tests to update**: anything in
`packages/core/src/services/__tests__/` and elsewhere that mocks
`courseDocuments` needs to mock `documentScopes`. Grep for
`courseDocuments` under test directories to find them.

**Acceptance Criteria**:
- [ ] New test file passes.
- [ ] All previously-passing tests pass (no regression).
- [ ] `pnpm test` from repo root green.

---

## Implementation Order

1. **Story `…-schema-and-migration`** — Unit 1 (schema) + Unit 2
   (migration). Standalone; no service work yet.
2. **Story `…-service-and-types`** — Unit 3 (types) + Unit 4 (service
   impl) + Unit 6 (delete old service file + interface) + Unit 7 (new
   tests). Depends on story 1.
3. **Story `…-callsite-sweep`** — Unit 5 (all call-site updates,
   including IPC + client) + final typecheck/test sweep. Depends on
   story 2.

## Risks

1. **Migration data loss** (low). The `INSERT … SELECT … FROM
   course_documents` precedes `DROP TABLE course_documents` in the same
   migration; Drizzle runs each migration in a SQLite transaction, so
   if the INSERT fails (e.g., constraint violation) the DROP rolls back.
   Mitigation: when implementing story 1, manually verify the migration
   on a copy of a populated dev DB (`pnpm db:reset` from a `.praxis`
   snapshot if available; or rely on the fact that the existing tests
   exercise the migration on every CI run via `useTempDb()`).
2. **Stale tool prompts** (low). Curriculum prompt fragments may
   reference "course documents" in human-language tool descriptions. A
   quick `grep` during story 3 catches them. Not blocking — wrong
   noun in a prompt is a tutor-quality issue, not a correctness one.
3. **`IngestionRequest.scope` rename surface** (low-medium). The
   request type may be wired through UI ingestion flows. The current
   field is optional, so the rename is mechanical — but searching for
   `req.courseId` usages in the ingestion path is part of the
   call-site sweep. Story 3 must not miss the UI invocation site.
4. **`ServiceDeps` plumbing** (low). The dep is plumbed through
   `bootstrap-service.ts`, `ingestion/service.ts`, possibly
   `session-service.ts` and similar. Each construction site updates;
   `pnpm typecheck` surfaces any miss.

## Testing

### Unit tests
- `packages/core/src/services/__tests__/document-scopes-service.test.ts`
  (new — covers all 7 methods including multi-scope + promotion)
- Existing test files that mocked `courseDocuments` → update to mock
  `documentScopes`.

### Integration / behavioral
- Bootstrap confirm-draft flow still attaches documents to the new
  course (manual smoke via the desktop app, plus existing
  bootstrap-service tests should still pass after Unit 5's mock
  update).
- Ingestion auto-attach with a scope still links the new document.
- IPC roundtrip: `praxis.documentScopes.listForScope` from the renderer
  returns the right data.

### Migration
- `pnpm db:reset` runs cleanly on a fresh DB.
- Manual verification on a populated dev DB during story 1.

## Implementation Notes (orchestrator)

All 3 child stories landed and are at `stage: review`:
- `…-schema-and-migration` (commit `eb0b3d1`)
- `…-service-and-types` (commit `41a7a4e`)
- `…-callsite-sweep` (commit `a36f72c`)

Final verification gates passed: `pnpm typecheck` green, `pnpm test` green
(3013 passed, 20 skipped), all `CourseDocuments*` references removed from
source. The `course_documents` table is gone; the polymorphic
`document_scopes` table is now the SSOT for document scoping. The three
downstream features (`bootstrap-session-scoped-attachment`,
`viewer-tab-scoped-sidebar`, `library-view-tabs-filters`) are unblocked.

## Review (2026-05-13)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- All 3 child stories reviewed individually and at `stage: done`:
  - `…-schema-and-migration` (Approve) — schema + Drizzle migration
  - `…-service-and-types` (Approve) — types + DocumentScopesServiceImpl + tests
  - `…-callsite-sweep` (Approve) — every consumer flipped + integration debt cleaned
- Capability completeness check: ✓ The full `document_scopes` primitive works end-to-end.
  - `documentScopes` schema present with composite PK and indexes.
  - `DocumentScopesService` interface + impl present; 7 methods (incl. `promoteScope` and `listScopesForDocument` for downstream features).
  - All call sites updated (bootstrap-service, ingestion, attach-document tool, IPC channel, client, electron services bundle).
  - `IngestionRequest.courseId` → `IngestionRequest.scope?: DocumentScope` rename complete.
- Foundation-doc alignment: `docs/ARCHITECTURE.md:388-390` describes the polymorphic table — rolled forward at epic-design time and accurately reflects the realized implementation.
- Aggregate verification: `pnpm typecheck && pnpm lint && pnpm test` all green at end of wave 3.
- Decomposition realized as designed: 3 sequentially-dependent stories with each story's typecheck-failure state explicitly documented as expected. The strategy worked — each story shipped a coherent chunk that built on the previous.
- Three downstream features now unblocked: `bootstrap-session-scoped-attachment`, `viewer-tab-scoped-sidebar`, `library-view-tabs-filters`.
