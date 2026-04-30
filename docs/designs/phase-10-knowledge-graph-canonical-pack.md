# Design: Phase 10 — Knowledge Graph + Canonical Math Pack + Adaptive Routing

## Overview

Phase 10 ships three things that fit together: **a curated math knowledge pack** (Algebra 1 + Geometry, ~200 concepts, CCSS-tagged), **the import flow** that brings packs into a student's local install, and **adaptive routing** that uses mastery + decay + course position to pick the *right* concept to teach next (not just the next-in-order). It also closes the Phase 9 UI gaps — concept names and per-concept mastery now render on the progress map.

After Phase 10: a student can choose "Use canonical pack" during bootstrap (instead of extracting from documents), instantly create an Algebra 1 course with a vetted concept graph + prerequisite edges + CCSS tags + initial gates; the agent's `course.current_concept` tool returns adaptive suggestions (frontier of mastery, spaced reviews, interleaved practice) instead of linear next-in-order; the progress map shows real concept names and per-concept mastery scores; `pnpm db:packs` lists imported packs.

**Key design moves (from user discussion):**

1. **`course.current_concept` becomes adaptive** (Option B from the design conversation). The existing tool's behavior changes: instead of "next un-studied concept in current lesson," it returns the **adaptively-routed** concept selection — including reason (`frontier` / `review` / `interleave` / `next-in-order`) and optional companion concepts (decayed concepts due for review, earlier concepts to interleave). Fewer tools; the agent's prompt fragments reinforce the new behavior. Phase 6/7/8/9 callers that depend on the old shape get an **additive output schema** — old fields stay, new fields are optional.

2. **Pack imports the graph; bootstrap auto-detects subject + offers pack option.** Packs ship as JSON in `packages/curriculum/packs/`. A new `PackImportService` loads them into `concept_graphs` + `concepts` + `prerequisite_edges` + concept embeddings. The bootstrap-mode flow (Phase 6) now offers the agent a tool — `course.list_canonical_packs(subject)` — so when a student says "I want to learn Algebra 1," the agent can offer "I have a curated pack for that — want to use it instead of building from your textbook?" Choosing the pack creates a course pointing at the canonical `conceptGraphId` with no extraction. The conversational stance is preserved.

3. **Concept embeddings via existing Phase 5 infrastructure.** Reuse `LocalEmbeddingService` (bge-small-en-v1.5, 384d) and the `sqlite-vec` extension. Add a second virtual table `concept_embeddings`. Embeddings produced at pack import time (and at Phase 6 bootstrap concept-extraction time, for symmetry). Phase 11 configure-mode "merge with canonical" surface uses these — out of v1 scope but unblocked.

4. **Phase 9 UI gaps closed**. New `client.artifacts.concepts(courseId)` IPC returns the course's full concept list with names + descriptions. Progress map fetches it on mount; concept nodes display real names. Per-concept mastery wired through `client.memory.studentModel()` — already exists in IPC since Phase 7, just consumed in UI now.

5. **Pack content authoring approach: LLM-drafted-then-curated.** The roadmap commits to ~200 concepts (Algebra 1 + Geometry, CCSS-tagged). Hand-authoring 200 concepts is multi-week work. The Phase 6 concept-extractor already exists; we use it offline to draft concepts from CCSS standard text + a small set of well-known curriculum sources, then a `pnpm pack:curate` CLI walks the draft for hand-review. The pack format spec ships first; the content fills in iteratively. **Phase 10's engineering ships when the import flow + adaptive routing work end-to-end against a starter pack of ≥30 concepts; the full 200-concept curation continues post-Phase-10 as content work.** This is documented as a deliberate split.

**What ships:**

- **Pack JSON format** specified by Zod schema (`PackManifestSchema`). Packs live in `packages/curriculum/packs/`. Versioned. Manifest declares `id`, `version`, `subject`, `gradeLevel`, `standardsRef`, plus `concepts[]` and `edges[]`.
- **Schema additions** (`@praxis/curriculum/src/schema.ts`):
  - `pack_imports` table — tracks which packs have been imported, when, and the resulting `conceptGraphId`. Used to detect "already imported" + version updates.
- **Schema additions** (`@praxis/core/src/db/vector-init.ts`):
  - `concept_embeddings` virtual table (sqlite-vec). 384-dim vectors keyed on `concept_id`. Populated at pack import + extraction time.
- **`PackImportServiceImpl`** (`@praxis/curriculum/src/packs/import-service.ts`):
  - `listAvailablePacks()` — read pack JSONs from disk; return manifest summaries.
  - `importPack(packId)` — load + validate manifest; insert `concept_graph` + `concepts` + `prerequisite_edges` + `concept_embeddings`; record in `pack_imports`. Idempotent (re-import same version → no-op).
  - `listImportedPacks(studentId)` — read `pack_imports` joined to `concept_graphs`.
  - `findPackBySubject(subject)` — used by bootstrap-mode flow to detect available packs.
- **`ConceptEmbeddingsStore`** (`@praxis/curriculum/src/packs/concept-embeddings.ts`):
  - Thin port over `sqlite-vec`. `upsert(conceptId, embedding)`, `findSimilar(embedding, topK)`.
  - Used by import service (writes) + future Phase 11 "merge with canonical" UI (reads).
- **Adaptive router** in `@praxis/curriculum/src/router/`:
  - `RouterImpl` — pure function `suggestNext(input): RouterSuggestion`. Reads course state, mastery, recent practice events. Outputs primary concept + optional reviews + optional interleaves + reasons.
  - Algorithm: frontier-of-uncertainty for primary; decay-driven for reviews; rotating from earlier mastered concepts for interleaves.
- **`course.current_concept` updated** to call the router and return its richer output (Option B). New optional fields on the result: `reason`, `masteryNow`, `reviews`, `interleaves`. Existing fields (`conceptId`, `name`, `description`, `lessonId`) preserved for backward compatibility.
- **Bootstrap-mode tools** (`@praxis/tools/src/course/`):
  - `course.list_canonical_packs(subject?)` — surfaces imported packs to the agent during bootstrap.
  - `course.use_canonical_pack(packId, courseTitle, gradeLevel)` — creates a course pointing at the canonical `conceptGraphId` with skeleton gates (per Phase 6 pattern). Bypasses the extractor.
- **Bootstrap-mode role fragment update** — instructs the agent to call `list_canonical_packs` early when the student names a subject, and offer the pack option if a match exists.
- **`praxis.artifacts.concepts(courseId)` IPC** — new read endpoint. Returns the full concept list for a course (names + descriptions + standardsTags).
- **Progress map UI cleanup** (Phase 9 follow-up):
  - Concept nodes show real names (via the new `client.artifacts.concepts` call).
  - Concept nodes color-coded by per-concept `effectivePKnown` (via `client.memory.studentModel()`).
  - Side panel shows mastery score + practice history (count of evidence event IDs from Phase 7).
- **`pnpm db:packs` CLI** — list imported packs, list available pack JSONs in repo, optionally trigger import.
- **`pnpm pack:curate` CLI** (helper, not user-facing) — runs the existing concept extractor against CCSS standards text to draft concept JSON; outputs to `packages/curriculum/packs/drafts/`. Used to author content; not part of the runtime.
- **`/packs` UI route** (small) — list imported packs, "Import" button per available pack. Settings-style page. The bootstrap flow doesn't require visiting this page; it's there for explicit imports + visibility.
- **Doc updates**: `docs/ROADMAP.md` Phase 10 description tightened; `docs/CURRICULUM.md` adaptive-routing section v1 details; `docs/CONTRACT.md` adds pack-format note + adaptive-routing change to `course.current_concept`.

**What does not ship (deferred):**

- **Cross-graph concept merging UI** — Phase 11 configure mode. Embeddings ship in v1; the merge surface is editor-mode work.
- **Pack signing / signed updates** — SPEC.md commits to "signed updates" for pedagogy packs; v1 ships in-repo unsigned. Out-of-band update / signing pipeline is post-v1.
- **Biology canonical pack** — Phase 15.
- **User-authored / community packs** — Phase 11 + post-v1.
- **Spaced-review scheduling against decay (FSRS)** — Phase 12. Phase 10's router does *opportunistic* review insertion (when decay is high enough); FSRS-driven scheduling lands with flashcards.
- **A/B routing strategies** — Phase 14 evals. Phase 10 ships one router with the algorithm in CURRICULUM.md.
- **Per-student router parameter overrides** — Phase 11. Phase 10 ships globally tuned defaults.
- **Full 200-concept content curation** — engineering ships in Phase 10; content authoring continues iteratively. Algebra 1 minimum (~50 concepts) ships as a starter; rest fills in.
- **CCSS standards alignment beyond tagging** — concepts carry `standardsTags`; deeper alignment work (e.g., automatic standards-coverage reporting) deferred.

## Why these choices (decision rationale)

**Why replace `course.current_concept` (Option B) instead of adding a new tool.** Tool surface is precious. Adding `course.suggest_next` alongside the simple version doubles the agent's decision space ("which tool right now?") and risks the agent calling the simple one when it should call the smart one. Replacing the existing tool with adaptive logic — and updating the tools fragment to teach the new behavior — keeps the agent's choice space narrow. The output schema is *additive* (new optional fields), so Phase 6/7/8/9 callers that read `conceptId, name, description, lessonId` still work; new callers can read `reason, masteryNow, reviews, interleaves` for the richer story.

**Why pack import is a service, not a CLI-only flow.** The agent in bootstrap mode needs to call into pack-related logic during a conversation. Service + tool wiring lets the conversational flow drive imports. CLI is a convenience for power users + scripts; the service is the primary path.

**Why packs ship in-repo as JSON.** Three reasons: (a) v1 is local-first — no remote pack registry needed; (b) JSON is reviewable in PRs (content quality matters); (c) packs are versioned by file path + manifest version, no auxiliary infrastructure. Future signed-update pipeline is a Phase 14+ concern.

**Why content authoring is split from engineering.** 200 concepts hand-authored is multi-week content work. The engineering scope (format, import, embeddings, router, UI, IPC, tests) is a phase-sized engineering chunk. Conflating them means the engineering can't ship until the content is done. The split: ship engineering + a starter pack (~30-50 concepts) that exercises the full flow; commit to iterative content fill-in. The roadmap test checkpoint ("Import math pack. Create course. Verify router selects concepts in valid prerequisite order, interleaves earlier concepts, inserts decayed-concept reviews") works against any non-trivial pack — the starter content is sufficient for the test checkpoint.

**Why LLM-drafted-then-curated for content authoring.** The Phase 6 concept-extractor already runs against documents to produce concept graphs. Pointing it at CCSS standards text plus a known curriculum source produces a credible 200-concept draft in minutes. Hand-curation removes mistakes; the spec for what makes a good pack lives in `docs/CURRICULUM.md`. Cost: 30 minutes of LLM time + a few hours of curation per pack vs weeks of from-scratch authoring. The LLM-drafted output IS the deliverable; we don't ship it without review, but we don't pretend it's hand-typed either.

**Why concept embeddings live in `concept_embeddings` (a separate virtual table) rather than denormalized into `concepts.embedding`.** The Drizzle schema for `concepts` already declares `aliasesJson` and `standardsTagsJson` — adding an `embedding` blob column would force every concept query to load a 384-float vector when most queries don't need it. The sqlite-vec virtual table pattern (already used for documents in Phase 5) keeps embeddings co-located with the relational data but only loaded when needed. Same pattern, two virtual tables.

**Why the adaptive router is a pure function in `@praxis/curriculum`.** Following the gate-evaluator precedent (Phase 9): routing is curriculum logic, not infrastructure. Pure function = testable in isolation; clear separation from Drizzle / IPC / UI. The tool layer (`course.current_concept`) is the integration point that pulls inputs from services and calls the router.

**Why fix Phase 9 UI gaps now instead of in Phase 11.** They're noticeable. The progress map currently shows UUIDs; per-concept mastery is gate-derived not real. Both are short-IPC-method-and-call additions — adding them in Phase 10 alongside the pack work is cheap, and the resulting Phase 10 demo is much more compelling. Phase 11 was always going to add the memory inspector for configurators; the student-facing progress map just needs the basic name + mastery wiring, which doesn't require a configurator.

**Why the bootstrap flow auto-detects packs but doesn't auto-import.** Importing a pack writes ~200 rows + 200 embeddings — visible action with cost. Doing it silently during the bootstrap conversation feels invisible. Better: on first install, the user explicitly imports packs they want (a few clicks in `/packs`); thereafter, the bootstrap flow can offer "use the imported Algebra 1 pack" as a conversational option.

## Scope and assumptions

- **Single-student per install** (v1).
- **Pack JSON files live in `packages/curriculum/packs/`.** Build pipeline copies them into the desktop app's resources. The runtime reads them via `import.meta.url` resolution + filesystem read (Electron main process has filesystem access).
- **One pack per subject in v1** — Algebra 1 + Geometry are separate packs, but a course points at one `conceptGraphId`. A future "combined-Algebra-Geometry" pack would be a third pack.
- **Embeddings are 384-dim bge-small** (matches Phase 5 — same model, same `LocalEmbeddingService` instance via `buildServices`).
- **Pack import is idempotent.** Re-running `importPack(packId)` for an already-imported version is a no-op (logged at debug). Importing a NEW version of a pack creates a new `conceptGraphId` (versioned); existing courses keep their old graph; new courses use the new one.
- **Concept IDs are stable across pack versions** for concepts that don't substantially change. Pack manifest declares concept IDs explicitly (e.g., `algebra-1-v1.linear-equations`). Cross-graph linking via embeddings is a *suggestion* layer, not automatic merge.
- **Adaptive router runs at every `course.current_concept` call.** Cheap (<5ms typical). No caching; reads from current DB state every time.
- **Router's algorithm**: see Unit 6 for the exact specification. Tunable parameters live in `packages/curriculum/src/router/config.ts` as a single source of truth (per Single Source of Truth principle).
- **Pack "starter content" minimum**: 30 concepts. Below this, the router has too few options to demonstrate interleaving. The starter Algebra 1 pack ships with at least 30 concepts covering numbers + expressions + equations + functions to demo all router behaviors.
- **`course.current_concept` output schema is additive** — existing consumers (Phase 6/7/8/9) keep working without changes.
- **Concept embeddings are computed at import time** — synchronous in `importPack` (200 concepts × ~5ms/embed = ~1 second per pack). Acceptable.
- **Bootstrap auto-detect uses `findPackBySubject(subject)`** with subject-id matching (e.g., `"math.algebra-1"` matches the Algebra 1 pack's `subject` field). Fuzzy matching via embedding similarity is deferred to Phase 11.
- **Slow tests gated** behind `PRAXIS_RUN_SLOW_TESTS=1` (real embedding generation; integration test that imports a real pack and runs the router).

## Dependency direction (Phase 10 additions)

```
@praxis/curriculum/packs/
  ├─ algebra-1-v1.json (content — starter ~30+ concepts; iterates to 100+)
  ├─ geometry-v1.json (content — starter ~30+ concepts; iterates to 100+)
  └─ schema.ts (Zod manifest schema)

@praxis/curriculum/src/
  ├─ packs/
  │   ├─ types.ts (PackManifest, PackSummary, ImportedPack)
  │   ├─ schema.ts (Zod PackManifestSchema)
  │   ├─ import-service.ts (PackImportServiceImpl)
  │   ├─ concept-embeddings.ts (ConceptEmbeddingsStore)
  │   └─ index.ts (barrel)
  └─ router/
      ├─ types.ts (RouterInput, RouterSuggestion, ConceptCandidate)
      ├─ config.ts (RouterConfig — single source of truth for tunable params)
      ├─ router.ts (RouterImpl + pure function suggestNext)
      └─ index.ts (barrel)

@praxis/curriculum/src/schema.ts
  └─ MODIFIED: add pack_imports table

@praxis/core/src/db/vector-init.ts
  └─ MODIFIED: add concept_embeddings virtual table init

@praxis/core/src/types
  ├─ MODIFIED: tool.ts — extended ArtifactsService.concepts; PackImportService port
  └─ MODIFIED: client.ts — extended ArtifactsClient.concepts + PacksClient

@praxis/core/src/services
  ├─ MODIFIED: artifacts-service.ts — concepts(courseId) method
  └─ NEW: packs-service-binding.ts (thin wrapper exposing PackImportServiceImpl on Services)

@praxis/tools/src/course/
  ├─ MODIFIED: current-concept.ts — calls router; richer output (Option B)
  ├─ NEW: list-canonical-packs.ts
  ├─ NEW: use-canonical-pack.ts
  └─ MODIFIED: index.ts — export new tools

@praxis/curriculum/src/modes/
  ├─ MODIFIED: bootstrap.ts — toolNames adds list_canonical_packs + use_canonical_pack
  ├─ MODIFIED: fragments/bootstrap-role.ts — instruct agent to offer pack option
  └─ MODIFIED: fragments/tools.ts — teach.ts mode tools fragment updated for new current_concept behavior

@praxis/desktop/electron/main/
  ├─ MODIFIED: services.ts — wire PackImportServiceImpl + ConceptEmbeddingsStore
  └─ MODIFIED: ipc-server.ts — praxis.artifacts.concepts + praxis.packs.* handlers

@praxis/client/src/services/
  ├─ MODIFIED: artifacts-client.ts — concepts(courseId)
  └─ NEW: packs-client.ts

@praxis/ui/src/
  ├─ NEW: routes/packs.tsx + .module.css
  ├─ NEW: hooks/use-packs.ts
  ├─ MODIFIED: hooks/use-course-gates.ts — also fetch concepts + mastery for naming
  ├─ MODIFIED: routes/course-map.tsx — render real concept names + per-concept mastery
  ├─ MODIFIED: components/concept-side-panel.tsx — show practice history
  └─ MODIFIED: router.tsx — register /packs route

scripts/
  ├─ NEW: db-packs.ts
  └─ NEW: pack-curate.ts (CLI wrapper around the extractor for content authoring; not user-facing)

docs/
  ├─ MODIFIED: ROADMAP.md (Phase 10 description tightened)
  ├─ MODIFIED: CURRICULUM.md (adaptive-routing v1 details + pack-content authoring approach)
  └─ MODIFIED: CONTRACT.md (pack-format note + course.current_concept output schema change)
```

No Python in Phase 10.

---

## Implementation Units

### Unit 1: Pack format + types

**Files**:
- `packages/curriculum/src/packs/types.ts` (new)
- `packages/curriculum/src/packs/schema.ts` (new — Zod manifest schema)

```typescript
// types.ts

import type { ConceptId, ConceptGraphId } from "@praxis/core/types";

/** Pack manifest — the JSON file shape. */
export interface PackManifest {
  /** Stable id, e.g., "algebra-1" */
  id: string;
  /** Semver-compatible version; new versions create new conceptGraphIds. */
  version: string;
  /** Display name. */
  name: string;
  /** Subject id used for bootstrap-mode auto-detect, e.g., "math.algebra-1". */
  subject: string;
  /** Grade level — `GradeBand`. */
  gradeLevel: string;
  /** Optional standards reference. */
  standardsRef?: { body: string; version: string };
  /** Authoring metadata. */
  authoredBy: string;
  /** ISO-8601 date the pack was last modified in source. */
  authoredAt: string;
  /** Concepts in the pack — ordered by intended teaching sequence. */
  concepts: PackConcept[];
  /** Prerequisite edges. */
  edges: PackEdge[];
}

export interface PackConcept {
  /** Stable concept id, e.g., "algebra-1.linear-equations". Stable across pack versions. */
  id: string;
  name: string;
  description: string;
  aliases: string[];
  /** CCSS or other standards tags, e.g., ["CCSS.Math.Content.HSA-CED.A.1"]. */
  standardsTags: string[];
}

export interface PackEdge {
  /** Concept id of the prerequisite. */
  fromId: string;
  /** Concept id of the dependent. */
  toId: string;
  /** 0..1; how strongly fromId is required for toId. */
  strength: number;
}

/** Compact summary used by the agent / UI for pack picker. */
export interface PackSummary {
  id: string;
  version: string;
  name: string;
  subject: string;
  gradeLevel: string;
  conceptCount: number;
  edgeCount: number;
  /** True when this pack version has been imported on the current install. */
  imported: boolean;
}

/** Record of an imported pack. Persisted in pack_imports table. */
export interface ImportedPack {
  packId: string;
  version: string;
  conceptGraphId: ConceptGraphId;
  importedAt: number;
}
```

```typescript
// schema.ts

import { z } from "zod";

export const PackConceptSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+(\.[a-z0-9-]+)*$/, "concept id must be kebab-case dotted"),
  name: z.string().min(1),
  description: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  standardsTags: z.array(z.string()).default([]),
});

export const PackEdgeSchema = z.object({
  fromId: z.string().min(1),
  toId: z.string().min(1),
  strength: z.number().min(0).max(1),
});

export const PackManifestSchema = z.object({
  id: z.string().min(1).regex(/^[a-z0-9-]+$/, "pack id must be lowercase kebab-case"),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver"),
  name: z.string().min(1),
  subject: z.string().min(1),
  gradeLevel: z.string().min(1),
  standardsRef: z.object({ body: z.string(), version: z.string() }).optional(),
  authoredBy: z.string().min(1),
  authoredAt: z.string().datetime(),
  concepts: z.array(PackConceptSchema).min(1),
  edges: z.array(PackEdgeSchema).default([]),
}).superRefine((manifest, ctx) => {
  // Cross-validate: every edge endpoint must be a known concept id.
  const conceptIds = new Set(manifest.concepts.map((c) => c.id));
  for (const e of manifest.edges) {
    if (!conceptIds.has(e.fromId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["edges"],
        message: `edge fromId references unknown concept: ${e.fromId}`,
      });
    }
    if (!conceptIds.has(e.toId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["edges"],
        message: `edge toId references unknown concept: ${e.toId}`,
      });
    }
  }
  // Cycle detection: simple DFS.
  // ...
});
```

**Implementation notes**:
- Pack concept ids include the pack id as a prefix (`algebra-1.linear-equations`) so cross-pack collisions are impossible.
- `superRefine` cycle detection: build adjacency, DFS with white/gray/black coloring; report cycle as a Zod issue.
- The Zod schema is the single source of truth. The TypeScript types in `types.ts` match the Zod inferred types.

**Acceptance criteria**:
- [ ] `PackManifestSchema.parse(validPack)` succeeds.
- [ ] Edge with unknown `fromId` fails validation with descriptive message.
- [ ] Cyclic prerequisite chain fails validation.
- [ ] Concept id matching `^[a-z0-9-]+(\.[a-z0-9-]+)*$` accepted; non-kebab rejected.
- [ ] Inferred TypeScript type matches `PackManifest` interface.

---

### Unit 2: Schema additions

**Files**:
- `packages/curriculum/src/schema.ts` (modified — add `pack_imports` table)
- `packages/core/src/db/vector-init.ts` (modified — add `concept_embeddings` virtual table)

```typescript
// curriculum/schema.ts — addition

export const packImports = sqliteTable(
  "pack_imports",
  {
    /** Composite key per-version of a pack. */
    packId: text("pack_id").notNull(),
    version: text("version").notNull(),
    conceptGraphId: text("concept_graph_id")
      .notNull()
      .references(() => conceptGraphs.id, { onDelete: "cascade" }),
    importedAt: integer("imported_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.packId, t.version] }),
    graphIdx: index("pack_imports_graph_idx").on(t.conceptGraphId),
  }),
);

export const curriculumSchema = {
  conceptGraphs,
  concepts,
  prerequisiteEdges,
  packImports,  // ← Phase 10
};
```

```typescript
// vector-init.ts — addition

const CONCEPT_EMBEDDING_DIMENSION = 384;

export function initConceptEmbeddingStore(
  sqlite: Database.Database,
  dimension: number = CONCEPT_EMBEDDING_DIMENSION,
): void {
  // sqlite-vec already loaded by initVectorStore; if not, load lazily.
  loadSqliteVecIfNeeded(sqlite);
  sqlite.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS concept_embeddings USING vec0(
      concept_id TEXT PRIMARY KEY,
      graph_id TEXT,
      embedding FLOAT[${dimension}],
      +concept_name TEXT
    );
  `);
}

// Refactor existing loadSqliteVec to be idempotent (track whether loaded):
let _vecLoaded = false;
function loadSqliteVecIfNeeded(sqlite: Database.Database): void {
  if (_vecLoaded) return;
  // ... existing loadSqliteVec logic, set _vecLoaded = true on success.
}
```

The `openDb` function calls both `initVectorStore` and `initConceptEmbeddingStore` (after Drizzle migrations).

**Implementation notes**:
- `pack_imports` is a small table (1-10 rows typical). Composite PK on `(packId, version)` lets multiple versions of a pack coexist if needed.
- Concept embedding virtual table mirrors the document_embeddings shape but keys on concept_id. The `+concept_name` is an unindexed auxiliary column for debug-friendly queries.
- The lazy-load idempotent guard for `sqlite-vec` prevents the existing `vector-init.ts` issue where `pnpm db:migrate` fails. Worth fixing while we're here.

**Acceptance criteria**:
- [ ] `pnpm db:generate` produces a migration adding `pack_imports`.
- [ ] `pnpm db:migrate` applies cleanly on a fresh DB and idempotently on an existing DB.
- [ ] After `openDb()`, both `document_embeddings` and `concept_embeddings` virtual tables exist.
- [ ] Re-opening DB doesn't crash on already-loaded sqlite-vec extension (idempotent guard works).

---

### Unit 3: `ConceptEmbeddingsStore`

**File**: `packages/curriculum/src/packs/concept-embeddings.ts` (new)

```typescript
import type Database from "better-sqlite3";
import type { Logger } from "@praxis/core/types";

export interface ConceptEmbeddingUpsertInput {
  conceptId: string;
  graphId: string;
  conceptName: string;
  embedding: number[];
}

export interface ConceptEmbeddingMatch {
  conceptId: string;
  graphId: string;
  conceptName: string;
  /** Cosine distance; lower = more similar. */
  distance: number;
}

export interface ConceptEmbeddingsStore {
  upsert(input: ConceptEmbeddingUpsertInput): Promise<void>;
  upsertBatch(inputs: ConceptEmbeddingUpsertInput[]): Promise<void>;
  /** Find concepts whose embeddings are nearest the given vector. */
  findSimilar(input: { embedding: number[]; topK: number; excludeGraphIds?: string[] }): Promise<ConceptEmbeddingMatch[]>;
  deleteByGraphId(graphId: string): Promise<void>;
}

export class SqliteConceptEmbeddingsStore implements ConceptEmbeddingsStore {
  constructor(
    private readonly sqlite: Database.Database,
    private readonly log: Logger,
  ) {}

  async upsert(input: ConceptEmbeddingUpsertInput): Promise<void> {
    return this.upsertBatch([input]);
  }

  async upsertBatch(inputs: ConceptEmbeddingUpsertInput[]): Promise<void> {
    if (inputs.length === 0) return;
    const stmt = this.sqlite.prepare(`
      INSERT OR REPLACE INTO concept_embeddings(concept_id, graph_id, embedding, concept_name)
      VALUES (?, ?, ?, ?)
    `);
    const tx = this.sqlite.transaction((rows: ConceptEmbeddingUpsertInput[]) => {
      for (const r of rows) {
        stmt.run(r.conceptId, r.graphId, vectorToBuffer(r.embedding), r.conceptName);
      }
    });
    tx(inputs);
  }

  async findSimilar(input: { embedding: number[]; topK: number; excludeGraphIds?: string[] }): Promise<ConceptEmbeddingMatch[]> {
    const exclude = input.excludeGraphIds ?? [];
    let sql = `
      SELECT concept_id, graph_id, concept_name, distance
      FROM concept_embeddings
      WHERE embedding MATCH ? AND k = ?
    `;
    const params: unknown[] = [vectorToBuffer(input.embedding), input.topK];
    if (exclude.length > 0) {
      sql += ` AND graph_id NOT IN (${exclude.map(() => "?").join(",")})`;
      params.push(...exclude);
    }
    sql += " ORDER BY distance";
    const rows = this.sqlite.prepare(sql).all(...params) as Array<{
      concept_id: string;
      graph_id: string;
      concept_name: string;
      distance: number;
    }>;
    return rows.map((r) => ({
      conceptId: r.concept_id,
      graphId: r.graph_id,
      conceptName: r.concept_name,
      distance: r.distance,
    }));
  }

  async deleteByGraphId(graphId: string): Promise<void> {
    this.sqlite.prepare(`DELETE FROM concept_embeddings WHERE graph_id = ?`).run(graphId);
  }
}

function vectorToBuffer(vec: number[]): Buffer {
  const buf = Buffer.alloc(vec.length * 4);
  for (let i = 0; i < vec.length; i++) buf.writeFloatLE(vec[i]!, i * 4);
  return buf;
}
```

**Implementation notes**:
- Follows the same `vectorToBuffer` pattern as `SqliteVecStore` (Phase 5).
- Batch upsert in a transaction for fast import (200 inserts in one batch).
- `findSimilar` exposes `excludeGraphIds` so Phase 11 "merge with canonical" can find similar concepts in OTHER graphs (excluding the current one).

**Acceptance criteria**:
- [ ] `upsertBatch` writes 200 concepts in one transaction.
- [ ] `findSimilar` returns concepts ordered by distance; respects `topK`.
- [ ] `excludeGraphIds` filter works correctly.
- [ ] `deleteByGraphId` removes only that graph's rows.

---

### Unit 4: `PackImportServiceImpl`

**File**: `packages/curriculum/src/packs/import-service.ts` (new)

```typescript
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { conceptGraphs, concepts, packImports, prerequisiteEdges } from "../schema.js";
import { eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { EmbeddingService, Logger } from "@praxis/core/types";
import type { PraxisDb } from "@praxis/core/db";
import { PackManifestSchema } from "./schema.js";
import type { ImportedPack, PackManifest, PackSummary } from "./types.js";
import type { ConceptEmbeddingsStore } from "./concept-embeddings.js";

export interface PackImportServiceDeps {
  db: PraxisDb;
  log: Logger;
  embeddings: EmbeddingService;
  conceptEmbeddings: ConceptEmbeddingsStore;
  /**
   * Filesystem directory containing pack JSON files. Default: a path resolved
   * relative to this file (../../../packs).
   */
  packsDir?: string;
}

export class PackImportServiceImpl {
  private readonly packsDir: string;

  constructor(private readonly deps: PackImportServiceDeps) {
    this.packsDir = deps.packsDir ?? defaultPacksDir();
  }

  /** Read all .json files in the packs directory; return summaries. */
  async listAvailablePacks(): Promise<PackSummary[]> {
    let entries: string[];
    try {
      entries = readdirSync(this.packsDir).filter((f) => f.endsWith(".json"));
    } catch (err) {
      this.deps.log.warn("packs.dir_not_found", { dir: this.packsDir });
      return [];
    }
    const summaries: PackSummary[] = [];
    for (const entry of entries) {
      try {
        const manifest = this.loadManifest(join(this.packsDir, entry));
        const imported = await this.isImported(manifest.id, manifest.version);
        summaries.push({
          id: manifest.id,
          version: manifest.version,
          name: manifest.name,
          subject: manifest.subject,
          gradeLevel: manifest.gradeLevel,
          conceptCount: manifest.concepts.length,
          edgeCount: manifest.edges.length,
          imported,
        });
      } catch (err) {
        this.deps.log.warn("pack.invalid", { file: entry, error: String(err) });
      }
    }
    return summaries;
  }

  /** Idempotent. Returns existing import record if version already imported. */
  async importPack(packId: string): Promise<ImportedPack> {
    const file = join(this.packsDir, `${packId}.json`);
    const manifest = this.loadManifest(file);

    const existing = this.deps.db
      .select()
      .from(packImports)
      .where(eq(packImports.packId, packId))
      .all();
    const matchingVersion = existing.find((e) => e.version === manifest.version);
    if (matchingVersion) {
      this.deps.log.debug("pack.already_imported", { packId, version: manifest.version });
      return rowToImportedPack(matchingVersion);
    }

    // Generate embeddings for all concepts (passage encoding).
    const embeddings = await this.deps.embeddings.embedBatch(
      manifest.concepts.map((c) => `${c.name}: ${c.description}`),
    );

    const conceptGraphId = uuidv7();
    const now = new Date();

    // Persist in one transaction.
    this.deps.db.transaction((tx) => {
      tx.insert(conceptGraphs).values({
        id: conceptGraphId,
        source: "canonical",
        standardsBody: manifest.standardsRef?.body ?? null,
        standardsVersion: manifest.standardsRef?.version ?? null,
        name: manifest.name,
        version: manifest.version,
        createdAt: now,
      }).run();

      tx.insert(concepts).values(
        manifest.concepts.map((c) => ({
          id: c.id,
          graphId: conceptGraphId,
          name: c.name,
          description: c.description,
          aliasesJson: c.aliases,
          standardsTagsJson: c.standardsTags,
        })),
      ).run();

      if (manifest.edges.length > 0) {
        tx.insert(prerequisiteEdges).values(
          manifest.edges.map((e) => ({
            fromId: e.fromId,
            toId: e.toId,
            strengthMilli: Math.round(e.strength * 1000),
            source: "canonical" as const,
          })),
        ).run();
      }

      tx.insert(packImports).values({
        packId: manifest.id,
        version: manifest.version,
        conceptGraphId,
        importedAt: now,
      }).run();
    });

    // Embeddings are written outside the transaction (different store).
    await this.deps.conceptEmbeddings.upsertBatch(
      manifest.concepts.map((c, i) => ({
        conceptId: c.id,
        graphId: conceptGraphId,
        conceptName: c.name,
        embedding: embeddings[i]!,
      })),
    );

    this.deps.log.info("pack.imported", { packId, version: manifest.version, conceptGraphId, conceptCount: manifest.concepts.length });
    return {
      packId: manifest.id,
      version: manifest.version,
      conceptGraphId: conceptGraphId as ImportedPack["conceptGraphId"],
      importedAt: now.getTime(),
    };
  }

  /** Look up imported packs (across all subjects). */
  async listImportedPacks(): Promise<ImportedPack[]> {
    const rows = this.deps.db.select().from(packImports).all();
    return rows.map(rowToImportedPack);
  }

  /** Find a pack manifest by subject. Used by bootstrap-mode auto-detect. */
  async findPackBySubject(subject: string): Promise<PackSummary | null> {
    const all = await this.listAvailablePacks();
    return all.find((p) => p.subject === subject) ?? null;
  }

  /** Find the conceptGraphId for an imported pack (latest version). */
  async getConceptGraphForPack(packId: string): Promise<string | null> {
    const rows = this.deps.db
      .select()
      .from(packImports)
      .where(eq(packImports.packId, packId))
      .all();
    if (rows.length === 0) return null;
    // Return latest version.
    const latest = rows.sort((a, b) => b.importedAt.getTime() - a.importedAt.getTime())[0]!;
    return latest.conceptGraphId;
  }

  private async isImported(packId: string, version: string): Promise<boolean> {
    const rows = this.deps.db.select().from(packImports).where(eq(packImports.packId, packId)).all();
    return rows.some((r) => r.version === version);
  }

  private loadManifest(filePath: string): PackManifest {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    const result = PackManifestSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`pack manifest validation failed for ${filePath}: ${result.error.message}`);
    }
    return result.data;
  }
}

function rowToImportedPack(row: typeof packImports.$inferSelect): ImportedPack {
  return {
    packId: row.packId,
    version: row.version,
    conceptGraphId: row.conceptGraphId as ImportedPack["conceptGraphId"],
    importedAt: row.importedAt.getTime(),
  };
}

function defaultPacksDir(): string {
  // Resolve to <repo>/packages/curriculum/packs/ at runtime.
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "../../packs");
}
```

**Implementation notes**:
- Pack JSON files live in `packages/curriculum/packs/`. The default packs dir is resolved from `import.meta.url`.
- Embeddings are computed in batch (one `embedBatch` call) for performance.
- The relational write (`concept_graphs` + `concepts` + `prerequisite_edges` + `pack_imports`) is one Drizzle transaction.
- The embedding write is OUTSIDE the transaction because it goes through a separate store. If embedding write fails after the transaction commits, the pack is partially imported. **Recovery**: re-running `importPack` is a no-op for the relational rows but re-attempts the embedding write. Acceptable trade-off for v1.
- For Electron production builds, the `packs` directory needs to be packaged into the app's resources. Configure electron-builder to copy `packages/curriculum/packs/` → app resources.

**Acceptance criteria**:
- [ ] `listAvailablePacks` returns summaries for all valid pack JSONs in the directory; logs warnings for invalid files.
- [ ] `importPack(validPackId)` creates conceptGraph + concepts + edges + concept_embeddings + pack_imports row.
- [ ] Re-importing same version is a no-op (returns existing record).
- [ ] Importing new version creates a NEW conceptGraphId.
- [ ] Pack with cyclic edges fails validation cleanly (does not partially import).
- [ ] `findPackBySubject` returns the right summary for a subject match.

---

### Unit 5: Starter pack content

**Files**:
- `packages/curriculum/packs/algebra-1.json` (new)
- `packages/curriculum/packs/geometry.json` (new)
- `scripts/pack-curate.ts` (new — content-authoring helper)

**Pack content scope**: Algebra 1 starter ships with **at least 30 concepts** covering:
- Numbers and operations (~5 concepts)
- Variables and expressions (~5)
- Equations and inequalities (~10)
- Linear functions (~5)
- Systems of equations (~5)

Geometry starter ships with **at least 30 concepts** covering:
- Points, lines, planes (~3)
- Angles and angle relationships (~5)
- Triangles (~7)
- Quadrilaterals (~5)
- Circles (~5)
- Coordinate geometry (~5)

**Authoring approach (LLM-drafted then curated):**

`scripts/pack-curate.ts` is a Node CLI:

```typescript
// Input: a CCSS standards excerpt + curriculum source notes (file path).
// Output: a draft pack JSON with concepts + edges.

// Process:
//   1. Read input file.
//   2. Call Phase 6's runConceptExtractor with a tweaked prompt:
//      "Generate a concept graph for [subject]. Return PackManifest JSON."
//   3. Validate the output via PackManifestSchema.
//   4. Write to packages/curriculum/packs/drafts/<subject>-draft.json.
// Reviewer copies + edits the draft, removes from /drafts/, commits to packs/.
```

Production pack JSONs follow the manifest format. Example fragment:

```json
{
  "id": "algebra-1",
  "version": "1.0.0",
  "name": "Algebra 1 (CCSS)",
  "subject": "math.algebra-1",
  "gradeLevel": "9-12",
  "standardsRef": { "body": "CCSS-Math", "version": "2010" },
  "authoredBy": "Praxis curriculum team",
  "authoredAt": "2026-04-29T00:00:00Z",
  "concepts": [
    {
      "id": "algebra-1.real-numbers",
      "name": "Real Numbers",
      "description": "Rational and irrational numbers; the real number line; properties of operations.",
      "aliases": ["real number system"],
      "standardsTags": ["CCSS.Math.Content.HSN-RN.B.3"]
    },
    {
      "id": "algebra-1.variables",
      "name": "Variables",
      "description": "Symbols that represent quantities; using variables in expressions; literal coefficients.",
      "aliases": ["unknowns"],
      "standardsTags": ["CCSS.Math.Content.HSA-SSE.A.1"]
    }
    // ... ~28 more starter concepts ...
  ],
  "edges": [
    { "fromId": "algebra-1.real-numbers", "toId": "algebra-1.variables", "strength": 0.7 },
    { "fromId": "algebra-1.variables", "toId": "algebra-1.expressions", "strength": 0.9 }
    // ... edges ...
  ]
}
```

**Implementation notes**:
- The implementer's job is the FORMAT and the CLI; the implementer drafts the starter content using `scripts/pack-curate.ts` against a CCSS source. Hand-curation can iterate.
- The content quality bar for v1: every concept has a description (not just a name); every concept appears in at least one edge (no orphans); the dependency graph is acyclic; standards tags are real CCSS codes.
- Full 200-concept curation is a content task that continues post-Phase-10. The starter is enough for the test checkpoint.
- Add `pack:curate` to root `package.json` scripts.

**Acceptance criteria**:
- [ ] `algebra-1.json` validates against `PackManifestSchema` with ≥30 concepts.
- [ ] `geometry.json` validates against `PackManifestSchema` with ≥30 concepts.
- [ ] Both packs have non-empty edges and pass cycle detection.
- [ ] `scripts/pack-curate.ts` runs and produces a valid draft JSON.
- [ ] `pnpm pack:curate <input>.txt` writes a draft to `packages/curriculum/packs/drafts/`.

---

### Unit 6: Adaptive router

**Files**:
- `packages/curriculum/src/router/types.ts` (new)
- `packages/curriculum/src/router/config.ts` (new)
- `packages/curriculum/src/router/router.ts` (new)
- `packages/curriculum/src/router/index.ts` (new)

```typescript
// types.ts

import type { ConceptId, CourseStateSnapshot, LessonId, Timestamp } from "@praxis/core/types";

/** Inputs the router needs to make a suggestion. */
export interface RouterInput {
  snapshot: CourseStateSnapshot;
  /** Per-concept effective decay-aware mastery (0..1). Concepts not in the map default to 0. */
  masteryByConceptId: ReadonlyMap<string, number>;
  /** Per-concept BKT uncertainty (0..1). Concepts not in the map default to 0.5 (max). */
  uncertaintyByConceptId: ReadonlyMap<string, number>;
  /** Per-concept last-practiced timestamp. Concepts not in the map have never been practiced. */
  lastPracticedByConceptId: ReadonlyMap<string, Timestamp>;
  /** Wall clock now. */
  now: Timestamp;
  /** Decay constant from the active course's threshold config. */
  decayDays: number;
}

export type RouterReason =
  | "next-in-order"          // current lesson, next un-studied concept
  | "frontier"               // current lesson, highest uncertainty among partially-known
  | "review"                 // earlier concept whose mastery has decayed below threshold
  | "interleave"             // earlier concept maintained at high mastery, due for practice
  | "all-complete";          // course-wide nothing remains

/** A specific concept the router recommends. */
export interface ConceptCandidate {
  conceptId: ConceptId;
  name: string;
  description: string;
  lessonId: LessonId;
  reason: RouterReason;
  /** Numeric score the router used to pick this; useful for debugging + Phase 14 evals. */
  score: number;
  masteryNow: number;
  uncertainty: number;
}

export interface RouterSuggestion {
  /** The single concept the router recommends teaching/practicing now. Null when course is fully complete. */
  primary: ConceptCandidate | null;
  /** Up to N decayed concepts to review before / during the primary. */
  reviews: ConceptCandidate[];
  /** Up to N earlier concepts to interleave during practice. */
  interleaves: ConceptCandidate[];
}
```

```typescript
// config.ts — Single Source of Truth for router params

export interface RouterConfig {
  /** How aggressively to weight uncertainty when picking primary. 0..1, default 0.6. */
  frontierWeight: number;
  /** Mastery floor below which a concept is eligible for review (after decay applied). Default 0.5. */
  reviewThreshold: number;
  /** Maximum number of review concepts in a single suggestion. Default 1. */
  maxReviews: number;
  /** Maximum number of interleave concepts. Default 1. */
  maxInterleaves: number;
  /** Minimum mastery to be eligible for interleaving (concept is "strong but might fade"). Default 0.7. */
  interleaveMinMastery: number;
  /** Days since last practice to qualify as "due for interleave". Default 5. */
  interleaveMinDays: number;
}

export const DEFAULT_ROUTER_CONFIG: RouterConfig = {
  frontierWeight: 0.6,
  reviewThreshold: 0.5,
  maxReviews: 1,
  maxInterleaves: 1,
  interleaveMinMastery: 0.7,
  interleaveMinDays: 5,
};
```

```typescript
// router.ts — pure function

import type { RouterConfig } from "./config.js";
import { DEFAULT_ROUTER_CONFIG } from "./config.js";
import type { ConceptCandidate, RouterInput, RouterSuggestion } from "./types.js";
import type { ConceptStateRow } from "@praxis/core/types";

/**
 * Suggest the next concept(s) for the student.
 *
 * Algorithm:
 *   1. Build a flat list of candidate concepts: all concepts in the course, with
 *      mastery / uncertainty / last-practiced annotations.
 *   2. Identify the current lesson's eligible (unlocked, not fully mastered) concepts.
 *   3. Pick PRIMARY:
 *      - If current lesson has un-studied concepts: pick highest uncertainty (default to next-in-order).
 *      - Else if all in lesson are partially mastered: pick highest uncertainty as "frontier".
 *      - Else course is complete; primary = null.
 *   4. Pick REVIEWS: from earlier lessons (lessonIndex < current), concepts with effectivePKnown < reviewThreshold,
 *      sorted by decay magnitude. Take up to maxReviews.
 *   5. Pick INTERLEAVES: from earlier lessons, concepts with effectivePKnown >= interleaveMinMastery,
 *      lastPracticed > interleaveMinDays ago, sorted by days-since-last-practice. Take up to maxInterleaves.
 *
 * Deterministic; pure function. Same inputs always produce same output.
 */
export function suggestNext(
  input: RouterInput,
  config: RouterConfig = DEFAULT_ROUTER_CONFIG,
): RouterSuggestion {
  const candidates = buildCandidates(input);

  if (input.snapshot.currentLesson === null) {
    return { primary: null, reviews: [], interleaves: [] };
  }

  const currentLessonId = input.snapshot.currentLesson.id;
  const currentLessonCandidates = candidates.filter((c) => c.lessonId === currentLessonId);
  const earlierLessonCandidates = candidates.filter((c) => {
    const idx = input.snapshot.lessons.findIndex((l) => l.id === c.lessonId);
    const currentIdx = input.snapshot.lessons.findIndex((l) => l.id === currentLessonId);
    return idx >= 0 && idx < currentIdx;
  });

  const primary = pickPrimary(currentLessonCandidates, config);
  const reviews = pickReviews(earlierLessonCandidates, input, config);
  const interleaves = pickInterleaves(earlierLessonCandidates, input, config, reviews);

  return { primary, reviews, interleaves };
}

interface AnnotatedCandidate extends ConceptCandidate {
  studiedFlag: boolean;
}

function buildCandidates(input: RouterInput): AnnotatedCandidate[] {
  const out: AnnotatedCandidate[] = [];
  for (const lesson of input.snapshot.lessons) {
    const conceptRows = input.snapshot.conceptsByLesson.get(lesson.id) ?? [];
    for (const row of conceptRows) {
      out.push({
        conceptId: row.conceptId,
        name: row.name,
        description: row.description,
        lessonId: row.lessonId,
        reason: "next-in-order", // overwritten by pickers
        score: 0,
        masteryNow: input.masteryByConceptId.get(row.conceptId) ?? 0,
        uncertainty: input.uncertaintyByConceptId.get(row.conceptId) ?? 0.5,
        studiedFlag: row.studied,
      });
    }
  }
  return out;
}

function pickPrimary(
  current: AnnotatedCandidate[],
  config: RouterConfig,
): ConceptCandidate | null {
  // Eligible for primary: NOT already mastered (mastery < 0.85).
  const eligible = current.filter((c) => c.masteryNow < 0.85);
  if (eligible.length === 0) return null;

  // Prefer un-studied next-in-order if any.
  const unstudied = eligible.filter((c) => !c.studiedFlag);
  if (unstudied.length > 0) {
    const pick = unstudied[0]!;
    return { ...pick, reason: "next-in-order", score: 1.0 };
  }

  // All studied; pick frontier — highest uncertainty (or lowest mastery as tiebreak).
  const sorted = [...eligible].sort((a, b) => {
    const aScore = a.uncertainty * config.frontierWeight + (1 - a.masteryNow) * (1 - config.frontierWeight);
    const bScore = b.uncertainty * config.frontierWeight + (1 - b.masteryNow) * (1 - config.frontierWeight);
    return bScore - aScore;
  });
  const pick = sorted[0]!;
  return { ...pick, reason: "frontier", score: pick.uncertainty * config.frontierWeight + (1 - pick.masteryNow) * (1 - config.frontierWeight) };
}

function pickReviews(
  earlier: AnnotatedCandidate[],
  input: RouterInput,
  config: RouterConfig,
): ConceptCandidate[] {
  // A concept is "due for review" when its effective mastery has decayed below threshold.
  const dueForReview = earlier.filter((c) => c.masteryNow < config.reviewThreshold && c.studiedFlag);
  if (dueForReview.length === 0) return [];

  // Sort by lowest mastery first.
  const sorted = [...dueForReview].sort((a, b) => a.masteryNow - b.masteryNow);
  return sorted.slice(0, config.maxReviews).map((c) => ({
    ...c,
    reason: "review" as const,
    score: 1 - c.masteryNow,
  }));
}

function pickInterleaves(
  earlier: AnnotatedCandidate[],
  input: RouterInput,
  config: RouterConfig,
  alreadyPickedAsReview: ConceptCandidate[],
): ConceptCandidate[] {
  const reviewIds = new Set(alreadyPickedAsReview.map((r) => r.conceptId));
  const eligible = earlier.filter((c) => {
    if (reviewIds.has(c.conceptId)) return false;
    if (c.masteryNow < config.interleaveMinMastery) return false;
    const lastPracticed = input.lastPracticedByConceptId.get(c.conceptId);
    if (!lastPracticed) return false;
    const daysSince = (input.now - lastPracticed) / (1000 * 60 * 60 * 24);
    return daysSince >= config.interleaveMinDays;
  });
  if (eligible.length === 0) return [];

  const sorted = [...eligible].sort((a, b) => {
    const aLast = input.lastPracticedByConceptId.get(a.conceptId)!;
    const bLast = input.lastPracticedByConceptId.get(b.conceptId)!;
    return aLast - bLast; // oldest first
  });
  return sorted.slice(0, config.maxInterleaves).map((c) => ({
    ...c,
    reason: "interleave" as const,
    score: (input.now - input.lastPracticedByConceptId.get(c.conceptId)!) / (1000 * 60 * 60 * 24),
  }));
}
```

```typescript
// index.ts — barrel
export { suggestNext } from "./router.js";
export { DEFAULT_ROUTER_CONFIG, type RouterConfig } from "./config.js";
export type { ConceptCandidate, RouterInput, RouterReason, RouterSuggestion } from "./types.js";
```

**Implementation notes**:
- Pure function. Tests construct `RouterInput` directly; no DB dependency.
- The "next-in-order" path is the Phase 6 behavior; the router still produces it for un-studied current-lesson concepts. Adaptive logic kicks in when the student is mid-lesson with partially-mastered concepts, when earlier concepts have decayed, or when interleaving is due.
- `lastPracticedByConceptId` is built from Phase 7's `student_mastery.lastPracticedAt` column. Concepts never practiced (only "studied") have undefined here — they're not eligible for interleaving.
- BKT uncertainty (`uncertainty`) comes from Phase 7's `student_mastery.uncertainty` (millified, divided to 0..1 in the integration layer).

**Acceptance criteria**:
- [ ] Course in early state (lesson 1, no mastery): primary = first concept with reason `next-in-order`; reviews and interleaves empty.
- [ ] Mid-lesson with all studied but not all mastered: primary = highest-uncertainty concept with reason `frontier`.
- [ ] Earlier-lesson concept decayed below `reviewThreshold`: appears in `reviews`.
- [ ] Earlier-lesson concept at high mastery, last practiced > 5 days ago: appears in `interleaves`.
- [ ] Course fully mastered: primary = null, reviews = [], interleaves = [].
- [ ] Reviews and interleaves are mutually exclusive (same concept can't appear in both).

---

### Unit 7: `course.current_concept` rewrite

**File**: `packages/tools/src/course/current-concept.ts` (modified — Option B)

```typescript
import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { suggestNext, type RouterReason } from "@praxis/curriculum/router";
import { z } from "zod";

const InputSchema = z.object({
  courseId: z
    .string()
    .optional()
    .describe("The course ID to query. Omit to use the session's active course."),
});

const OutputSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("ok"),
    /** Existing fields (Phase 6 callers continue to work). */
    conceptId: z.string(),
    name: z.string(),
    description: z.string(),
    lessonId: z.string(),
    /** Phase 10: new optional fields. */
    reason: z.enum(["next-in-order", "frontier", "review", "interleave"]),
    masteryNow: z.number().min(0).max(1),
    uncertainty: z.number().min(0).max(1),
    /** Suggested companion concepts: decayed concepts to review before/during. */
    reviews: z.array(z.object({
      conceptId: z.string(),
      name: z.string(),
      reason: z.literal("review"),
      masteryNow: z.number(),
    })).default([]),
    /** Suggested companion concepts: earlier concepts to interleave for retention. */
    interleaves: z.array(z.object({
      conceptId: z.string(),
      name: z.string(),
      reason: z.literal("interleave"),
      masteryNow: z.number(),
    })).default([]),
  }),
  z.object({ kind: z.literal("all_complete"), courseId: z.string() }),
  z.object({ kind: z.literal("no_active_lesson"), courseId: z.string() }),
]);

export const currentConceptTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.current_concept",
  description:
    "Suggest the right concept for the student to work on now. Returns the primary concept (with reason: next-in-order / frontier / review / interleave) plus optional companion concepts the student should review or interleave for retention. The router considers mastery, uncertainty, decay, and course position — not just lesson order. Call at the start of each major teaching chunk.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx: ToolContext): Promise<z.infer<typeof OutputSchema>> {
    const rawId = args.courseId ?? (ctx.courseId ? ctx.courseId : null);
    if (!rawId) {
      throw new Error(
        "course.current_concept requires either an explicit courseId argument or a session started with a courseId",
      );
    }
    const courseId = brandId<"CourseId">(rawId);

    // Read inputs in parallel.
    const [snapshot, studentModel] = await Promise.all([
      ctx.services.courseState.read({ studentId: ctx.studentId, courseId }),
      ctx.services.memory.studentModel(ctx.studentId),
    ]);

    if (!snapshot) throw new Error(`Course not found for this student: ${rawId}`);
    if (!snapshot.currentLesson) {
      return { kind: "all_complete", courseId: snapshot.course.id };
    }

    // Build router input maps.
    const masteryByConceptId = new Map<string, number>();
    const uncertaintyByConceptId = new Map<string, number>();
    const lastPracticedByConceptId = new Map<string, number>();
    for (const [conceptId, m] of studentModel.conceptMastery.entries()) {
      masteryByConceptId.set(conceptId, m.effectivePKnown);
      uncertaintyByConceptId.set(conceptId, m.uncertainty);
      if (m.lastPracticedAt) lastPracticedByConceptId.set(conceptId, m.lastPracticedAt);
    }

    const decayDays = snapshot.course.thresholds.decayDays;
    const suggestion = suggestNext({
      snapshot,
      masteryByConceptId,
      uncertaintyByConceptId,
      lastPracticedByConceptId,
      now: Date.now() as never,
      decayDays,
    });

    if (!suggestion.primary) {
      return { kind: "all_complete", courseId: snapshot.course.id };
    }

    return {
      kind: "ok",
      conceptId: suggestion.primary.conceptId,
      name: suggestion.primary.name,
      description: suggestion.primary.description,
      lessonId: suggestion.primary.lessonId,
      reason: suggestion.primary.reason as Exclude<RouterReason, "all-complete">,
      masteryNow: suggestion.primary.masteryNow,
      uncertainty: suggestion.primary.uncertainty,
      reviews: suggestion.reviews.map((r) => ({
        conceptId: r.conceptId,
        name: r.name,
        reason: "review" as const,
        masteryNow: r.masteryNow,
      })),
      interleaves: suggestion.interleaves.map((i) => ({
        conceptId: i.conceptId,
        name: i.name,
        reason: "interleave" as const,
        masteryNow: i.masteryNow,
      })),
    };
  },
};
```

**Implementation notes**:
- Output schema is **additive** — old fields preserved; new fields default to `[]` for `reviews` / `interleaves`. Existing tests that mock the tool's output keep working with old shape; new tests can assert the new fields.
- The handler reads from both `courseState` and `memory.studentModel` in parallel for performance.
- The `decayDays` from `snapshot.course.thresholds.decayDays` is the per-course config.

**Update the `tools.ts` prompt fragment** (`packages/curriculum/src/modes/fragments/tools.ts`) to teach the new behavior:

```typescript
template: `Tools available:
  - course.current_concept — get the right concept to teach now. Returns the primary
    concept with a reason (next-in-order, frontier, review, interleave) plus optional
    review / interleave companions. The router considers mastery decay and the
    student's history. **Call this at the start of each major teaching chunk** — don't
    assume linear lesson order.
  ...`
```

**Acceptance criteria**:
- [ ] `course.current_concept` returns the new fields.
- [ ] When the router suggests a frontier concept, `reason: "frontier"` appears.
- [ ] When earlier concepts have decayed, `reviews` array is non-empty.
- [ ] When earlier mastered concepts haven't been practiced in a while, `interleaves` is non-empty.
- [ ] Existing tests asserting `kind: "ok", conceptId, name, description, lessonId` still pass (additive).

---

### Unit 8: Bootstrap-mode pack tools

**Files**:
- `packages/tools/src/course/list-canonical-packs.ts` (new)
- `packages/tools/src/course/use-canonical-pack.ts` (new)
- `packages/tools/src/course/index.ts` (modified — export new tools)
- `packages/curriculum/src/modes/bootstrap.ts` (modified — add tools to toolNames)
- `packages/curriculum/src/modes/fragments/bootstrap-role.ts` (modified — instruct agent to offer pack)
- `packages/core/src/types/tool.ts` (modified — `ToolServices.packs: PackImportService` port)

```typescript
// list-canonical-packs.ts

import type { ToolContext, ToolDefinition } from "@praxis/core/types";
import { z } from "zod";

const InputSchema = z.object({
  subject: z.string().optional().describe("Filter by subject id (e.g., 'math.algebra-1'). Omit for all."),
});

const OutputSchema = z.object({
  packs: z.array(z.object({
    id: z.string(),
    version: z.string(),
    name: z.string(),
    subject: z.string(),
    gradeLevel: z.string(),
    conceptCount: z.number().int(),
    edgeCount: z.number().int(),
    imported: z.boolean(),
  })),
});

export const listCanonicalPacksTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.list_canonical_packs",
  description:
    "List available canonical knowledge packs (curated concept graphs for specific subjects). Use this in bootstrap mode when the student names a subject — if a matching pack exists, you can offer it as an alternative to extracting concepts from documents.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["none"],
  async handler(args, ctx) {
    const all = await ctx.services.packs.listAvailablePacks();
    const filtered = args.subject ? all.filter((p) => p.subject === args.subject) : all;
    return { packs: filtered };
  },
};
```

```typescript
// use-canonical-pack.ts

const InputSchema = z.object({
  packId: z.string(),
  courseTitle: z.string().min(1),
  gradeLevel: z.string().min(1),
});

const OutputSchema = z.object({
  ok: z.literal(true),
  courseId: z.string(),
  conceptGraphId: z.string(),
  conceptCount: z.number().int(),
});

export const useCanonicalPackTool: ToolDefinition<typeof InputSchema, typeof OutputSchema> = {
  name: "course.use_canonical_pack",
  description:
    "Create a course from a canonical pack instead of running the bootstrap extractor. The pack's concept graph + prerequisite edges become the course's structure. Use this when the student wants a curated curriculum rather than building from their own materials.",
  input: InputSchema,
  output: OutputSchema,
  tier: "grounded",
  effects: ["artifact.mutate"],
  async handler(args, ctx) {
    // 1. Ensure pack is imported (idempotent).
    const imported = await ctx.services.packs.importPack(args.packId);
    // 2. Create a course pointing at the canonical conceptGraphId.
    //    Reuse Phase 6's bootstrap.confirmDraft logic structurally — just skip the extraction step.
    //    Implementation: call into a new helper `createCourseFromPack(...)` in BootstrapServiceImpl.
    const course = await ctx.services.bootstrap.createCourseFromPack({
      studentId: ctx.studentId,
      packId: args.packId,
      conceptGraphId: imported.conceptGraphId,
      courseTitle: args.courseTitle,
      gradeLevel: args.gradeLevel,
    });
    return { ok: true, courseId: course.courseId, conceptGraphId: imported.conceptGraphId, conceptCount: course.conceptCount };
  },
};
```

```typescript
// curriculum/src/modes/fragments/bootstrap-role.ts (modified — append to template)

template: `... existing role text ...

When the student names a subject (e.g., "Algebra 1", "Geometry"), call course.list_canonical_packs with the matching subject id (e.g., "math.algebra-1"). If a curated pack exists, offer it as an option:
  "I have a curated Algebra 1 curriculum that maps to Common Core standards. Want me to use that as the foundation, or would you rather I extract concepts from your textbook?"

If the student picks the canonical pack, call course.use_canonical_pack to create the course directly. If they pick their materials, run the standard extractor flow.`,
```

`packages/core/src/types/tool.ts` adds `packs: PackImportService` to `ToolServices`. The interface is the same shape as `PackImportServiceImpl` (port, not concrete class).

**Implementation notes**:
- `BootstrapServiceImpl.createCourseFromPack(...)` is a NEW method that creates a course + lessons + skeleton gates pointing at the existing canonical graph. It's a simplified version of `confirmDraft` — no concept extraction, no edges to write (already exist), just course + lesson grouping (one lesson per N concepts? or one lesson per logical chunk per the pack's intent?). For v1 simplicity: one lesson per group of 5-10 sequential concepts in pack order. **A future iteration can let pack manifests declare lesson groupings explicitly**; v1 does flat 1-per-concept-or-cluster.
- The bootstrap-mode prompt now has two paths to course creation; the agent picks based on student input.

**Acceptance criteria**:
- [ ] `course.list_canonical_packs` returns available packs (filtered by subject if provided).
- [ ] `course.use_canonical_pack` imports the pack (idempotent), creates a course pointing at the canonical conceptGraphId, returns courseId.
- [ ] The created course has lessons + initial skeleton gates per Phase 6.
- [ ] Bootstrap mode's `toolNames` includes the two new tools.

---

### Unit 9: Phase 9 UI cleanup — concept names + per-concept mastery

**Files**:
- `packages/core/src/types/client.ts` (modified — `ArtifactsClient.concepts(courseId)`)
- `packages/core/src/types/tool.ts` (modified — server-side `ArtifactsService.concepts`)
- `packages/core/src/services/artifacts-service.ts` (modified — add `concepts` method)
- `packages/desktop/electron/main/ipc-server.ts` (modified — `praxis.artifacts.concepts`)
- `packages/client/src/services/artifacts-client.ts` (modified)
- `packages/ui/src/hooks/use-course-gates.ts` (modified — fetch concepts + mastery)
- `packages/ui/src/routes/course-map.tsx` (modified — render real names + per-concept mastery)
- `packages/ui/src/components/concept-side-panel.tsx` (modified — show practice history)

```typescript
// types/tool.ts — addition

export interface ArtifactsService {
  // ... existing ...
  /** ← Phase 10 NEW. */
  concepts(courseId: CourseId): Promise<Array<{
    id: string;
    graphId: string;
    name: string;
    description: string;
    aliases: string[];
    standardsTags: string[];
  }>>;
}
```

```typescript
// types/client.ts — addition (ArtifactsClient interface)

export interface ArtifactsClient {
  // ... existing ...
  concepts(courseId: CourseId): Promise<Concept[]>;
}
```

```typescript
// services/artifacts-service.ts — addition

async concepts(courseId: CourseId) {
  const course = await this.course(courseId);
  if (!course) return [];
  const rows = this.deps.db
    .select()
    .from(concepts)
    .where(eq(concepts.graphId, course.conceptGraphId))
    .all();
  return rows.map((r) => ({
    id: r.id,
    graphId: r.graphId,
    name: r.name,
    description: r.description,
    aliases: r.aliasesJson as string[],
    standardsTags: r.standardsTagsJson as string[],
  }));
}
```

```typescript
// ui/hooks/use-course-gates.ts — augment to also load concepts + mastery

export function useCourseGates(courseId: CourseId | undefined) {
  const client = usePraxisClient();
  const [gates, setGates] = useState<GateView[]>([]);
  const [conceptsByName, setConceptsByName] = useState<Map<string, { name: string; description: string }>>(new Map());
  const [masteryByConceptId, setMasteryByConceptId] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(false);
  // ...

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    Promise.all([
      client.artifacts.gateView(courseId),
      client.artifacts.concepts(courseId),
      client.memory.studentModel(),
    ]).then(([g, c, sm]) => {
      setGates(g);
      setConceptsByName(new Map(c.map((co) => [co.id, { name: co.name, description: co.description }])));
      setMasteryByConceptId(new Map([...sm.conceptMastery.entries()].map(([id, m]) => [id as string, m.effectivePKnown])));
    }).finally(() => setLoading(false));
  }, [client, courseId]);

  return { gates, conceptsByName, masteryByConceptId, loading };
}
```

```tsx
// ui/routes/course-map.tsx — buildGraph now uses real names + mastery

function buildGraph(args: {
  courseStateSnapshot: CourseStateSnapshot;
  conceptsByName: Map<string, { name: string; description: string }>;
  masteryByConceptId: Map<string, number>;
  gates: GateView[];
}): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  for (const lesson of args.courseStateSnapshot.lessons) {
    const conceptRows = args.courseStateSnapshot.conceptsByLesson.get(lesson.id) ?? [];
    for (const row of conceptRows) {
      const conceptInfo = args.conceptsByName.get(row.conceptId);
      const mastery = args.masteryByConceptId.get(row.conceptId) ?? 0;
      const lockedByGate = /* check if lesson's gate is locked */;
      nodes.push({
        id: row.conceptId,
        type: "concept",
        data: {
          name: conceptInfo?.name ?? row.conceptId,  // fallback to id when concept not found
          mastery,
          studied: row.studied,
          locked: lockedByGate,
        },
        position: { x: 0, y: 0 }, // computed by dagre
      });
    }
  }
  // ... edge building unchanged ...
}
```

**Implementation notes**:
- The UI hook now does a 3-call parallel fetch. ~50ms total for typical courses; acceptable.
- Concept names + mastery flow through to `<ConceptNode>` via the data prop. No component API changes.
- The fallback (`conceptInfo?.name ?? row.conceptId`) handles the rare case where the concepts call fails — UI degrades gracefully.

**Acceptance criteria**:
- [ ] `client.artifacts.concepts(courseId)` returns the course's concept list.
- [ ] Progress map nodes display real concept names (not UUIDs).
- [ ] Concept nodes color-coded by per-concept `effectivePKnown` from `studentModel()`.
- [ ] Side panel shows mastery score + practice count.

---

### Unit 10: IPC + client extensions

**Files**:
- `packages/desktop/electron/main/ipc-server.ts` (modified)
- `packages/client/src/services/artifacts-client.ts` (modified)
- `packages/client/src/services/packs-client.ts` (new)
- `packages/core/src/types/client.ts` (modified — extend `PraxisClient` with `packs`)

```typescript
// ipc-server.ts — additions

ipcMain.handle("praxis.artifacts.concepts", async (_e, courseId: string) => {
  return services.artifacts.concepts(brandId<"CourseId">(courseId));
});

// Pack channels:
ipcMain.handle("praxis.packs.listAvailable", async () => {
  return services.packs.listAvailablePacks();
});

ipcMain.handle("praxis.packs.listImported", async () => {
  return services.packs.listImportedPacks();
});

ipcMain.handle("praxis.packs.import", async (_e, packId: string) => {
  return services.packs.importPack(packId);
});
```

```typescript
// client/services/packs-client.ts (new)

import type { PackSummary, ImportedPack } from "@praxis/curriculum/packs";
import type { ClientTransport } from "../transport/types.js";

export interface PacksClient {
  listAvailable(): Promise<PackSummary[]>;
  listImported(): Promise<ImportedPack[]>;
  import(packId: string): Promise<ImportedPack>;
}

export class PacksClientImpl implements PacksClient {
  constructor(private readonly transport: ClientTransport) {}

  listAvailable(): Promise<PackSummary[]> {
    return this.transport.invoke("praxis.packs.listAvailable");
  }

  listImported(): Promise<ImportedPack[]> {
    return this.transport.invoke("praxis.packs.listImported");
  }

  import(packId: string): Promise<ImportedPack> {
    return this.transport.invoke("praxis.packs.import", packId);
  }
}
```

```typescript
// types/client.ts — extend PraxisClient

export interface PraxisClient {
  // ... existing ...
  artifacts: ArtifactsClient;
  packs: PacksClient;  // ← Phase 10 NEW
}
```

`packages/client/src/client.ts` instantiates `new PacksClientImpl(transport)` and assigns to `client.packs`.

**Acceptance criteria**:
- [ ] `client.artifacts.concepts(courseId)` returns the concept list.
- [ ] `client.packs.listAvailable()` returns pack summaries.
- [ ] `client.packs.import(packId)` triggers an import.

---

### Unit 11: ServiceDeps + buildServices wiring

**Files**:
- `packages/core/src/services/types.ts` (modified — `ServiceDeps.toolServices.packs`)
- `packages/desktop/electron/main/services.ts` (modified)

```typescript
// services/types.ts — addition

export interface ServiceDeps {
  // ... existing ...
  toolServices: {
    // ... existing ...
    packs: PackImportService;
  };
}
```

```typescript
// desktop/electron/main/services.ts — additions

import { PackImportServiceImpl, SqliteConceptEmbeddingsStore } from "@praxis/curriculum/packs";

const conceptEmbeddings = new SqliteConceptEmbeddingsStore(sqlite, log);
const packImportService = new PackImportServiceImpl({
  db,
  log,
  embeddings: localEmbeddingService, // already constructed for Phase 5 documents
  conceptEmbeddings,
});

const deps: ServiceDeps = {
  // ... existing ...
  toolServices: {
    // ... existing ...
    packs: packImportService,
  },
};

return {
  // ... existing services ...
  packs: packImportService,  // exposed for IPC
  conceptEmbeddings,           // exposed for Phase 11 use
};
```

**Acceptance criteria**:
- [ ] `buildServices` exposes `packs` on the `Services` interface.
- [ ] First-run boot still works (no packs imported yet → empty list).

---

### Unit 12: `pnpm db:packs` CLI

**File**: `scripts/db-packs.ts` (new)

```typescript
import { openDb } from "@praxis/core/db";
import { conceptGraphs, packImports } from "@praxis/curriculum/schema";
import { eq } from "drizzle-orm";

const args = process.argv.slice(2);
const importFlag = args.indexOf("--import");
const importPackId = importFlag >= 0 ? args[importFlag + 1] : null;

const { db } = openDb({ readonly: !importPackId });

if (importPackId) {
  // Import the named pack — call into PackImportServiceImpl.
  // ...
  console.log(`Imported pack: ${importPackId}`);
}

const rows = db.select({ ...packImports, graphName: conceptGraphs.name })
  .from(packImports)
  .innerJoin(conceptGraphs, eq(packImports.conceptGraphId, conceptGraphs.id))
  .all();

console.table(
  rows.map((r) => ({
    packId: r.packId,
    version: r.version,
    name: r.graphName,
    importedAt: r.importedAt.toISOString(),
  })),
);
```

Add `db:packs` script entry to root `package.json`.

**Acceptance criteria**:
- [ ] `pnpm db:packs` runs without error on empty DB (no rows).
- [ ] `pnpm db:packs --import algebra-1` imports the pack and lists it.
- [ ] After import, second run shows the imported pack.

---

### Unit 13: `/packs` UI route

**Files**:
- `packages/ui/src/routes/packs.tsx` + `.module.css` (new)
- `packages/ui/src/hooks/use-packs.ts` (new)
- `packages/ui/src/router.tsx` (modified — register route)
- `packages/ui/src/components/nav.tsx` (modified — add Packs link)

```tsx
// routes/packs.tsx (sketch)

export function PacksRoute() {
  const { available, imported, refresh, importing, importPack } = usePacks();
  return (
    <div className={styles.layout}>
      <header>
        <h1>Knowledge Packs</h1>
        <p>Curated concept graphs for specific subjects.</p>
      </header>
      <section>
        <h2>Available</h2>
        <ul>
          {available.map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong> v{p.version} — {p.conceptCount} concepts ({p.subject}, {p.gradeLevel})
              {p.imported ? (
                <span className={styles.importedBadge}>Imported</span>
              ) : (
                <button onClick={() => importPack(p.id)} disabled={importing === p.id}>
                  {importing === p.id ? "Importing..." : "Import"}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
```

**Acceptance criteria**:
- [ ] `/packs` lists available packs.
- [ ] "Import" button triggers import; UI updates to show "Imported" badge.
- [ ] Nav has "Packs" link.

---

### Unit 14: Documentation updates

**Files**:
- `docs/ROADMAP.md` (modified — Phase 10 verbatim per design)
- `docs/CURRICULUM.md` (modified — adaptive routing v1 section)
- `docs/CONTRACT.md` (modified — pack format + course.current_concept change)

```markdown
<!-- ROADMAP.md Phase 10 update -->
## Phase 10: Knowledge graph + canonical math pack + adaptive routing

**Goal:** Curated math concept graph (Algebra 1 + Geometry, CCSS-tagged); pack imports into install; adaptive routing replaces linear concept ordering; progress map shows real concept names + per-concept mastery.

**Build:**
- Pack JSON format (Zod manifest schema) + `PackImportServiceImpl` + `pack_imports` schema
- Concept embedding store (sqlite-vec virtual table; bge-small 384d)
- Adaptive router (pure function in @praxis/curriculum/router): frontier-of-uncertainty for primary, decay-driven reviews, rotation-based interleaving
- `course.current_concept` rewritten to use the router; output schema additive (existing fields preserved)
- Bootstrap mode auto-detects packs by subject; new `course.list_canonical_packs` + `course.use_canonical_pack` tools
- `/packs` UI route + `pnpm db:packs` CLI
- `praxis.artifacts.concepts(courseId)` IPC for progress-map naming
- Per-concept mastery wired into progress-map color coding (closes Phase 9 gap)
- Algebra 1 + Geometry starter packs (≥30 concepts each); full ~200-concept curation continues iteratively

**Test checkpoint:** Import math pack. Create course via `course.use_canonical_pack`. Verify `course.current_concept` returns concepts with adaptive reasons (next-in-order at start; frontier mid-lesson; review when earlier concepts decay; interleave when earlier mastered concepts haven't been practiced in a while).
```

**CURRICULUM.md** — extend the adaptive routing section with the v1 algorithm specification (frontier-of-uncertainty, review threshold, interleave rules, config defaults).

**CONTRACT.md** — note the `course.current_concept` output schema change (additive new fields) + pack manifest format.

**Acceptance criteria**:
- [ ] ROADMAP.md Phase 10 reflects the v2 stance (pack import, adaptive routing, Phase 9 cleanup).
- [ ] CURRICULUM.md describes router algorithm + tunable params.
- [ ] CONTRACT.md notes the additive change to current_concept and the pack format.

---

### Unit 15: Tests

| Test file | Type | What it tests |
|---|---|---|
| `packages/curriculum/src/packs/__tests__/schema.test.ts` | unit, fast | Manifest validation: valid pack, edge with unknown id, cyclic edges, kebab-case ids. |
| `packages/curriculum/src/packs/__tests__/import-service.test.ts` | unit, fast (real DB via useTempDb; mocked embeddings) | Import creates rows; idempotent re-import; new version creates new graph; embeddings persisted. |
| `packages/curriculum/src/packs/__tests__/concept-embeddings.test.ts` | unit, fast (real sqlite-vec) | upsert + findSimilar; excludeGraphIds filter; deleteByGraphId. |
| `packages/curriculum/src/router/__tests__/router.test.ts` | unit, fast | Pure function: next-in-order, frontier, review, interleave; mutual exclusion; all-complete; deterministic. |
| `packages/tools/src/course/__tests__/current-concept-adaptive.test.ts` | unit, fast (mocked services) | Tool returns new fields; reason populated; reviews + interleaves arrays correct. |
| `packages/tools/src/course/__tests__/list-canonical-packs.test.ts` | unit, fast | Returns packs filtered by subject; empty when no match. |
| `packages/tools/src/course/__tests__/use-canonical-pack.test.ts` | unit, fast | Calls importPack idempotently; creates course; returns courseId. |
| `packages/core/src/__tests__/artifacts-service-concepts.test.ts` | unit, fast (real DB) | concepts(courseId) returns full concept list joined by graphId. |
| `packages/desktop/src/__tests__/ipc-server-packs.test.ts` | unit | All pack IPC channels route correctly. |
| `packages/client/src/__tests__/packs-client.test.ts` | unit | Client invokes correct channels. |
| `packages/ui/src/__tests__/use-packs.test.tsx` | unit (jsdom) | Hook loads packs; import triggers re-fetch. |
| `packages/ui/src/__tests__/concept-node-naming.test.tsx` | unit (jsdom) | Node renders real concept name when conceptsByName provides one; falls back to id. |
| `tests/pack-import-end-to-end.test.ts` | integration, fast (real DB; mocked embeddings) | Import a starter pack → verify all rows persisted → use_canonical_pack creates a course → course.current_concept returns the first concept with reason "next-in-order". |
| `tests/adaptive-routing-end-to-end.test.ts` | integration, fast (real DB; mocked embeddings) | Set up a course mid-progression (mastery rows simulating a student halfway through a course). Call current_concept and assert: primary has frontier reason; reviews include earlier decayed concepts; interleaves include earlier mastered concepts last-practiced > 5 days ago. |

Slow tests (real embedding generation against a real pack JSON) gated behind `PRAXIS_RUN_SLOW_TESTS=1`.

---

## Implementation Order

1. **Unit 1** — Pack format + types.
2. **Unit 2** — Schema (`pack_imports` table + `concept_embeddings` virtual table).
3. **Unit 3** — `ConceptEmbeddingsStore`.
4. **Unit 6** — Adaptive router (pure function; no DB dependency).
5. **Unit 4** — `PackImportServiceImpl` (depends on Units 1, 2, 3).
6. **Unit 5** — Starter pack content + `pack-curate.ts` CLI.
7. **Unit 7** — `course.current_concept` rewrite (depends on Unit 6).
8. **Unit 9** — Phase 9 UI cleanup (concept names + per-concept mastery — backend pieces only; UI in 13).
9. **Unit 8** — Bootstrap-mode pack tools (depends on Units 4, 7 partial).
10. **Unit 11** — ServiceDeps + buildServices wiring.
11. **Unit 10** — IPC + client extensions.
12. **Unit 13** — `/packs` UI route + progress map cleanup.
13. **Unit 12** — `pnpm db:packs` CLI.
14. **Unit 14** — Doc updates.
15. **Unit 15** — Tests interspersed.

Units 1, 2, 3, 6 are parallelizable.

---

## Verification

```bash
pnpm install
pnpm rebuild better-sqlite3
pnpm db:generate
pnpm typecheck
pnpm lint
pnpm test
pnpm db:packs
pnpm db:packs --import algebra-1
PRAXIS_RUN_SLOW_TESTS=1 pnpm test

# Manual checkpoint (Phase 10)
pnpm desktop:build && pnpm dev
# 1. /packs — see Algebra 1 + Geometry available, click "Import" on Algebra 1.
# 2. /courses → "New course" → bootstrap mode.
# 3. Tell the tutor: "I want to learn Algebra 1."
# 4. Tutor calls course.list_canonical_packs("math.algebra-1") → finds the imported pack.
# 5. Tutor offers: "I have a curated Algebra 1 pack. Want to use that or build from your own materials?"
# 6. Pick "use the pack" → tutor calls course.use_canonical_pack(...) → course created.
# 7. /courses → see the new course with the canonical conceptGraph.
# 8. /courses/<id>/map → progress map renders real concept names + per-concept mastery (still 0 since no practice yet).
# 9. Start a teach session → tutor calls course.current_concept → returns first concept with reason "next-in-order".
# 10. Work through several concepts; end session.
# 11. New session → tutor calls course.current_concept again — now the suggestion includes mastery, possibly with reason "frontier" if all current-lesson concepts are partially mastered.
# 12. Skip 2 weeks (mock by editing student_mastery.lastPracticedAt) → call current_concept → reviews array contains earlier concepts now decayed below threshold.
```
