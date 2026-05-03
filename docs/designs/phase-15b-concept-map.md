# Design: Phase 15b — Concept Map

## Overview

Student-authored concept maps with auto-versioning, agent-driven divergence detection
against the canonical concept graph, and toggleable canonical-hint overlay. Builds on
the `<SketchCanvas>` primitive from Phase 15a; introduces concept-linking (drawing
element ↔ canonical concept), version snapshots at session-end, and a new indexer that
joins the Phase 7 orchestrator.

What lands:
- **`concept_maps` + `concept_map_versions` tables** with auto-snapshot on session-end when dirty.
- **`ConceptMapService`** in core + IPC + `ConceptMapClient` in `@praxis/client`.
- **Concept-linking** — when the student types a node label, fuzzy-match against the course's canonical concepts and offer a one-click link. Linked nodes get a subtle visual marker.
- **`/courses/$courseId/concept-maps`** route — list of maps for the course (multi-map per course).
- **`/courses/$courseId/concept-maps/$conceptMapId`** route — the editor itself.
- **Canonical hints toggle** — when on, ghost shapes appear on the canvas for canonical concepts the student hasn't drawn. v1: simple grid layout in unused canvas area.
- **`ConceptMapDivergenceIndexer`** — agent-driven session-end pass that compares student's map vs canonical, writes `divergences[]` back to the row. Mirrors Phase 7's `MisconceptionIndexer`.
- **Course-detail integration** — courses page shows the count of concept maps + a "+ new map" affordance.

## Decisions baked into this design (per user)

| Decision | Choice | Why |
|---|---|---|
| Versioning | Auto-snapshot at session-end if dirty | No save-button friction; aligns with editorial restraint |
| Multiplicity | Many maps per course | Whole-course map plus chapter / topic side maps |
| Divergence | Agent-driven indexer (Phase 7 pattern) | Nuanced; catches mislabeled-direction cases that deterministic comparison misses |
| Hints UX | Ghosted shapes on canvas | Most spatial; aligns with the "discovery surface" framing in UX.md |
| Concept-linking trigger | Typeahead on node label edit (recommended fuzzy threshold ≥ 0.7) | Low friction; student stays in flow |
| Route placement | `/courses/$courseId/concept-maps[/$conceptMapId]` (nested under existing courses URL space) | Matches existing `/courses/$courseId/map` (React Flow progress map) and back-compat URL stability |
| `<SketchCanvas variant="full">` reuse | Yes — same primitive, with concept-link overlay + canonical-hints overlay layered on top | Single canvas implementation |

---

## Implementation Units

### Unit 1: `concept_maps` + `concept_map_versions` tables

**File**: `packages/memory/src/schema.ts` (modify)

```typescript
export const conceptMaps = sqliteTable(
  "concept_maps",
  {
    id: text("id").primaryKey(), // uuidv7
    studentId: text("student_id").notNull(),
    /** Course the map is anchored to. NOT optional in v1. */
    courseId: text("course_id").notNull(),
    /** Display title. e.g. "whole course", "linear equations", "word problems". */
    title: text("title").notNull(),
    /** Live tldraw snapshot — the editable working copy. */
    sceneJson: text("scene_json", { mode: "json" }).notNull(),
    /**
     * Element-to-concept bindings. Array of { elementId, conceptId, confidence }.
     * Stored as JSON for v1 (single-row, small N). A separate table is overkill.
     */
    conceptLinksJson: text("concept_links_json", { mode: "json" }).notNull().default("[]"),
    /**
     * ConceptMapDivergence[] from the most-recent indexer run. Null until first
     * session-end indexer pass after the map is created.
     */
    divergencesJson: text("divergences_json", { mode: "json" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    studentCourseIdx: index("concept_maps_student_course_idx").on(t.studentId, t.courseId),
  }),
);

export const conceptMapVersions = sqliteTable(
  "concept_map_versions",
  {
    id: text("id").primaryKey(), // uuidv7
    conceptMapId: text("concept_map_id")
      .notNull()
      .references(() => conceptMaps.id, { onDelete: "cascade" }),
    /** Snapshot of the scene + links at this version. */
    sceneJson: text("scene_json", { mode: "json" }).notNull(),
    conceptLinksJson: text("concept_links_json", { mode: "json" }).notNull(),
    /** Set when auto-snapshot fires; null when this is the very first row. */
    sessionId: text("session_id"),
    snapshotAt: integer("snapshot_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => ({
    mapTimeIdx: index("concept_map_versions_map_time_idx").on(t.conceptMapId, t.snapshotAt),
  }),
);
```

Add both to `memorySchema` barrel.

Run `pnpm db:generate` to produce the migration. Commit the SQL.

**Implementation Notes**:
- `concept_map_versions.sessionId` is nullable because the very first version (created when the map is created) has no associated session. Auto-snapshots from session-end always have a sessionId.
- `divergencesJson` lives on `concept_maps` (not on each version) — it represents the most-recent indexer findings. Versions are immutable history of the map; divergences are mutable annotations.
- Foreign key + cascade-delete on the version → concept map: if a map is deleted, its versions go too.
- `conceptLinksJson` stored as a string column with default `"[]"` so empty maps work without explicit init.

**Acceptance Criteria**:
- [ ] Both tables exist after migration.
- [ ] `pnpm db:show` lists them with the expected columns.
- [ ] Cascade-delete: deleting a `concept_maps` row removes its `concept_map_versions` rows (verify via SQL test).

---

### Unit 2: Update `ConceptMapDrawing` type + add helpers

**File**: `packages/core/src/types/artifacts.ts` (modify the existing type)

The existing `ConceptMapDrawing` is close. Update for parity with the schema:

```typescript
export interface ConceptMapDrawing {
  id: ConceptMapId;
  studentId: StudentId;
  courseId: CourseId;          // NOT optional anymore
  title: string;                // NEW: display title
  scene: TldrawSnapshot;
  conceptLinks: ConceptLink[];  // typed array, see below
  divergences?: ConceptMapDivergence[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** Link from a tldraw shape id to a canonical concept. */
export interface ConceptLink {
  elementId: string;       // tldraw shape id (e.g. "shape:abc123")
  conceptId: ConceptId;    // canonical concept this element represents
  /** 0..1 — fuzzy match score from the typeahead, 1.0 if user explicitly linked. */
  confidence: number;
}

/** A historical snapshot of a concept map. */
export interface ConceptMapVersion {
  id: string;                  // version row id
  conceptMapId: ConceptMapId;
  scene: TldrawSnapshot;
  conceptLinks: ConceptLink[];
  /** The session this snapshot was captured at end-of. Null for the initial create. */
  sessionId?: SessionId;
  snapshotAt: Timestamp;
}

/** ConceptMapDivergence already exists; verify it matches: */
export interface ConceptMapDivergence {
  kind: "missing-edge" | "extra-edge" | "mislabeled-direction" | "missing-concept";
  description: string;
  elementIds: string[];   // student-side elements involved (empty for missing-concept)
}
```

Add a new `ConceptMapSummary` for list views (without the heavy `scene` payload):

```typescript
export interface ConceptMapSummary {
  readonly id: ConceptMapId;
  readonly studentId: StudentId;
  readonly courseId: CourseId;
  readonly title: string;
  readonly versionCount: number;
  readonly hasDivergences: boolean;
  readonly createdAt: Timestamp;
  readonly updatedAt: Timestamp;
}
```

**Acceptance Criteria**:
- [ ] `ConceptMapDrawing` includes the new `title` field; `courseId` is required.
- [ ] `ConceptLink`, `ConceptMapVersion`, `ConceptMapSummary` exported.
- [ ] No existing consumers of the type break (the only stub is `client.artifacts.conceptMaps()` which returns `[]`).

---

### Unit 3: `ConceptMapService` interface

**File**: `packages/core/src/types/concept-map-service.ts` (new)

```typescript
import type { ConceptId, ConceptMapDrawing, ConceptMapId, ConceptMapSummary, ConceptMapVersion, CourseId, SessionId, StudentId, TldrawSnapshot } from "./index.js";

export interface ConceptMapService {
  /** Create a new empty map for (student, course). Title required. */
  create(input: { studentId: StudentId; courseId: CourseId; title: string }): Promise<ConceptMapDrawing>;

  /** Read by id. Returns null if not found. */
  get(id: ConceptMapId): Promise<ConceptMapDrawing | null>;

  /**
   * List summaries for a (student, course) — many-maps-per-course model.
   * Ordered by updatedAt descending.
   */
  list(input: { studentId: StudentId; courseId: CourseId }): Promise<ConceptMapSummary[]>;

  /** Rename a map. Bumps updatedAt. */
  rename(id: ConceptMapId, title: string): Promise<ConceptMapDrawing>;

  /** Delete map + cascading versions. */
  delete(id: ConceptMapId): Promise<void>;

  /**
   * Update the live scene + conceptLinks. Bumps updatedAt. Does NOT create a
   * version snapshot — versions only happen at session-end.
   */
  updateScene(input: {
    id: ConceptMapId;
    scene: TldrawSnapshot;
    conceptLinks: ConceptLink[];
  }): Promise<ConceptMapDrawing>;

  /**
   * List all version snapshots for a map, oldest first.
   */
  listVersions(id: ConceptMapId): Promise<ConceptMapVersion[]>;

  /**
   * Snapshot the current scene+links of a single map. Called by the
   * IndexerOrchestrator at session-end. Idempotent: if the live scene equals
   * the most recent version, no new row is written.
   */
  snapshotIfDirty(input: { id: ConceptMapId; sessionId: SessionId }): Promise<{ snapshotted: boolean; versionId?: string }>;

  /**
   * Persist divergences (output of the indexer) onto the live row.
   */
  setDivergences(id: ConceptMapId, divergences: ConceptMapDivergence[]): Promise<void>;
}
```

Re-export from `packages/core/src/types/index.ts`.

**Implementation Notes**:
- `updateScene` is the high-frequency op (the editor calls it on debounced changes). It must be cheap.
- `snapshotIfDirty` compares `JSON.stringify(scene+links) === lastVersion.scene+links` to decide. For larger maps a hash would be faster, but JSON equality is fine for v1.

**Acceptance Criteria**:
- [ ] All methods specified with correct return types.
- [ ] Re-exported from the `types/index.ts` barrel.

---

### Unit 4: `ConceptMapServiceImpl`

**File**: `packages/core/src/services/concept-map-service.ts` (new)

Standard impl following the `TabsServiceImpl` / `LockServiceImpl` patterns:

```typescript
export interface ConceptMapServiceDeps {
  readonly db: PraxisDb;
  readonly log: Logger;
}

export class ConceptMapServiceImpl implements ConceptMapService {
  constructor(private readonly deps: ConceptMapServiceDeps) {}

  async create(input): Promise<ConceptMapDrawing> {
    const id = brandId<"ConceptMapId">(uuidv7());
    const now = new Date();
    const emptyScene: TldrawSnapshot = {}; // empty tldraw snapshot
    this.deps.db.insert(conceptMaps).values({
      id, studentId: input.studentId, courseId: input.courseId, title: input.title,
      sceneJson: emptyScene, conceptLinksJson: [], createdAt: now, updatedAt: now,
    }).run();
    // Initial version record so the chain isn't empty
    this.deps.db.insert(conceptMapVersions).values({
      id: uuidv7(), conceptMapId: id, sceneJson: emptyScene, conceptLinksJson: [],
      sessionId: null, snapshotAt: now,
    }).run();
    return this.get(id) as Promise<ConceptMapDrawing>;  // safe: we just inserted
  }

  // ... other methods

  async snapshotIfDirty(input): Promise<{ snapshotted: boolean; versionId?: string }> {
    const map = await this.get(input.id);
    if (!map) return { snapshotted: false };
    const versions = this.deps.db.select(/* ... */).orderBy(desc(conceptMapVersions.snapshotAt)).limit(1).all();
    const last = versions[0];
    const liveJson = JSON.stringify({ scene: map.scene, links: map.conceptLinks });
    const lastJson = last ? JSON.stringify({ scene: last.sceneJson, links: last.conceptLinksJson }) : null;
    if (liveJson === lastJson) return { snapshotted: false };
    const versionId = uuidv7();
    this.deps.db.insert(conceptMapVersions).values({
      id: versionId, conceptMapId: input.id, sceneJson: map.scene, conceptLinksJson: map.conceptLinks,
      sessionId: input.sessionId, snapshotAt: new Date(),
    }).run();
    return { snapshotted: true, versionId };
  }
}
```

**Implementation Notes**:
- `create` writes both the `concept_maps` row and an initial `concept_map_versions` row so the version chain isn't empty. Deleting the v0 row later is a no-op (cascade handles it).
- `snapshotIfDirty` is the only path that adds version rows after creation. No other mutator does.
- All paths use direct Drizzle calls (no `loadOrThrow` helper exists in this codebase).

**Acceptance Criteria**:
- [ ] `create` returns a ConceptMapDrawing with empty scene + empty links + 1 version.
- [ ] `updateScene` bumps `updatedAt` and persists scene/links; does NOT add a version.
- [ ] `snapshotIfDirty` adds a version when scene+links changed; returns `{ snapshotted: false }` when not.
- [ ] `delete` removes both the map row and all version rows (cascade).
- [ ] `listVersions` returns rows ordered by `snapshotAt` ascending.

---

### Unit 5: Wire `ConceptMapServiceImpl` into Services + ServiceDeps

**File**: `packages/desktop/electron/main/services.ts` (modify)

Three additive changes (mirror `TabsServiceImpl` from Phase 14):

1. Import `ConceptMapServiceImpl` from `@praxis/core/services`.
2. Construct: `const conceptMapService = new ConceptMapServiceImpl({ db, log });`
3. Add to `Services` interface and the returned object: `conceptMaps: conceptMapService`.
4. Add to `ServiceDeps.toolServices` so future tools can read concept maps via `ctx.services.conceptMaps`.

**Acceptance Criteria**:
- [ ] `services.conceptMaps.create({...})` callable after `buildServices`.

---

### Unit 6: IPC handlers + `ConceptMapClient`

**File**: `packages/desktop/electron/main/ipc-server.ts` (modify) — new section after the sketches section

```typescript
// ── Concept maps ─────────────────────────────────────────────────────────

handle("praxis.conceptMaps.create", async (_event, opts: { courseId: string; title: string }) => {
  const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
  return services.conceptMaps.create({
    studentId,
    courseId: opts.courseId as CourseId,
    title: opts.title,
  });
});

handle("praxis.conceptMaps.get", async (_event, id: string) => {
  return services.conceptMaps.get(id as ConceptMapId);
});

handle("praxis.conceptMaps.list", async (_event, opts: { courseId: string }) => {
  const studentId = brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
  return services.conceptMaps.list({ studentId, courseId: opts.courseId as CourseId });
});

handle("praxis.conceptMaps.rename", async (_event, opts: { id: string; title: string }) => {
  return services.conceptMaps.rename(opts.id as ConceptMapId, opts.title);
});

handle("praxis.conceptMaps.delete", async (_event, id: string) => {
  return services.conceptMaps.delete(id as ConceptMapId);
});

handle("praxis.conceptMaps.updateScene", async (_event, opts: {
  id: string;
  scene: TldrawSnapshot;
  conceptLinks: ConceptLink[];
}) => {
  return services.conceptMaps.updateScene({
    id: opts.id as ConceptMapId,
    scene: opts.scene,
    conceptLinks: opts.conceptLinks,
  });
});

handle("praxis.conceptMaps.listVersions", async (_event, id: string) => {
  return services.conceptMaps.listVersions(id as ConceptMapId);
});
```

**File**: `packages/client/src/services/concept-map-client.ts` (new)

```typescript
const C = "praxis.conceptMaps" as const;

export class ConceptMapClient implements ConceptMapClientApi {
  constructor(private readonly transport: ClientTransport) {}

  create(input: { courseId: CourseId; title: string }): Promise<ConceptMapDrawing> {
    return this.transport.invoke<ConceptMapDrawing>(`${C}.create`, input);
  }
  get(id: ConceptMapId): Promise<ConceptMapDrawing | null> {
    return this.transport.invoke<ConceptMapDrawing | null>(`${C}.get`, id);
  }
  list(input: { courseId: CourseId }): Promise<ConceptMapSummary[]> {
    return this.transport.invoke<ConceptMapSummary[]>(`${C}.list`, input);
  }
  rename(id: ConceptMapId, title: string): Promise<ConceptMapDrawing> {
    return this.transport.invoke<ConceptMapDrawing>(`${C}.rename`, { id, title });
  }
  delete(id: ConceptMapId): Promise<void> {
    return this.transport.invoke<void>(`${C}.delete`, id);
  }
  updateScene(input: { id: ConceptMapId; scene: TldrawSnapshot; conceptLinks: ConceptLink[] }): Promise<ConceptMapDrawing> {
    return this.transport.invoke<ConceptMapDrawing>(`${C}.updateScene`, input);
  }
  listVersions(id: ConceptMapId): Promise<ConceptMapVersion[]> {
    return this.transport.invoke<ConceptMapVersion[]>(`${C}.listVersions`, id);
  }
}
```

`ConceptMapClientApi` interface in `packages/core/src/types/client.ts` — drops `studentId` param (server resolves), same shape as the renderer-facing tabs/sketches APIs.

Add `conceptMaps: ConceptMapClientApi` to `PraxisClient` (required).

Wire `conceptMaps: new ConceptMapClient(transport)` in `packages/client/src/client.ts`.

Update `makeFakeClient` in `__tests__/helpers/fake-client.ts` to include the new field.

**Implementation Notes**:
- The existing `client.artifacts.conceptMaps(courseId?)` stub at `packages/client/src/services/artifacts-client.ts:80` is now superseded — remove it from `ArtifactsClientSurface` (and from `client.artifacts`) since the dedicated client takes over. The legacy stub returned `[]`; no real consumers depend on it.

**Acceptance Criteria**:
- [ ] `client.conceptMaps.list({ courseId })` round-trips through IPC.
- [ ] `client.artifacts.conceptMaps` is removed.
- [ ] `makeFakeClient` includes the new field.

---

### Unit 7: Auto-snapshot at session-end via IndexerOrchestrator

**File**: `packages/core/src/services/concept-map-snapshotter.ts` (new)

A small Indexer-shaped helper that snapshots all concept maps for the (student, course) in the active session:

```typescript
import type { Indexer, IndexerContext, ConceptMapService, Logger, PraxisDb } from "../types/index.js";
import { sessions } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";

export interface ConceptMapSnapshotterDeps {
  readonly db: PraxisDb;
  readonly log: Logger;
  readonly conceptMaps: ConceptMapService;
}

/**
 * Indexer that snapshots every concept map for the session's (student, course)
 * if dirty since the last snapshot. Runs at session-end.
 */
export class ConceptMapSnapshotter implements Indexer {
  readonly id = "concept-map-snapshotter";
  readonly trigger = "session-end" as const;

  constructor(private readonly deps: ConceptMapSnapshotterDeps) {}

  async run(ctx: IndexerContext): Promise<void> {
    const session = this.deps.db.select().from(sessions).where(eq(sessions.id, ctx.sessionId)).get();
    if (!session?.courseId) return;  // sessions without a courseId can't snapshot maps
    const maps = await this.deps.conceptMaps.list({
      studentId: ctx.studentId,
      courseId: session.courseId as CourseId,
    });
    for (const summary of maps) {
      const result = await this.deps.conceptMaps.snapshotIfDirty({
        id: summary.id,
        sessionId: ctx.sessionId,
      });
      if (result.snapshotted) {
        this.deps.log.info("conceptMap.snapshotted", { mapId: summary.id, versionId: result.versionId });
      }
    }
  }
}
```

**File**: `packages/desktop/electron/main/services.ts` (modify) — add the snapshotter to the indexers list passed to `IndexerOrchestratorImpl`:

```typescript
const conceptMapSnapshotter = new ConceptMapSnapshotter({
  db, log, conceptMaps: conceptMapService,
});

const indexerOrchestrator = new IndexerOrchestratorImpl({
  db,
  log,
  indexers: [masteryIndexer, misconceptionIndexer, conceptMapSnapshotter, /* divergenceIndexer added in Unit 8 */],
});
```

**Implementation Notes**:
- The Phase 7 `Indexer` interface — verify shape by reading `packages/core/src/services/indexers/orchestrator.ts`. If `trigger` and `run(ctx)` don't match exactly, adapt.
- Snapshotting runs BEFORE the divergence indexer (Unit 8) so the divergence pass sees the latest scene.

**Acceptance Criteria**:
- [ ] After a session ends with at least one dirty map, a new `concept_map_versions` row exists for that map.
- [ ] If the map didn't change, no new version row is added.
- [ ] Sessions without a `courseId` are no-op.

---

### Unit 8: `ConceptMapDivergenceIndexer`

**Files**:
- `packages/core/src/services/indexers/concept-map-divergence-indexer.ts` (new)
- `packages/core/src/services/indexers/concept-map-divergence-prompt.ts` (new)

Mirror the `MisconceptionIndexer` pattern (`packages/core/src/services/indexers/misconception-indexer.ts`):

```typescript
export interface ConceptMapDivergenceIndexerDeps {
  readonly db: PraxisDb;
  readonly log: Logger;
  readonly conceptMaps: ConceptMapService;
  readonly engineResolver: () => Engine;
  readonly courseStateReader: CourseStateReader;  // for fetching canonical concepts/edges
}

export class ConceptMapDivergenceIndexer implements Indexer {
  readonly id = "concept-map-divergence";
  readonly trigger = "session-end" as const;

  async run(ctx: IndexerContext): Promise<void> {
    const session = this.deps.db.select().from(sessions).where(eq(sessions.id, ctx.sessionId)).get();
    if (!session?.courseId) return;
    const maps = await this.deps.conceptMaps.list({ studentId: ctx.studentId, courseId: session.courseId as CourseId });
    if (maps.length === 0) return;
    const courseSnapshot = await this.deps.courseStateReader.read({ studentId: ctx.studentId, courseId: session.courseId });
    if (!courseSnapshot) return;
    for (const summary of maps) {
      const map = await this.deps.conceptMaps.get(summary.id);
      if (!map) continue;
      try {
        const divergences = await this.runOneShotComparison(map, courseSnapshot);
        await this.deps.conceptMaps.setDivergences(map.id, divergences);
      } catch (err) {
        this.deps.log.warn("conceptMap.divergence.indexer_failed", { mapId: map.id, error: String(err) });
      }
    }
  }

  private async runOneShotComparison(map: ConceptMapDrawing, course: CourseSnapshot): Promise<ConceptMapDivergence[]> {
    // Build a structured prompt with: canonical concepts (id + name), canonical edges, student's conceptLinks, student's scene (compressed shape inventory).
    // One-shot via runOneShot.
    // Parse + Zod-validate.
    // Return.
  }
}
```

**Prompt** (in the sibling file):
- System prompt establishes role: "You are reviewing a student's concept map vs the canonical concept graph for this course."
- Output schema: `{ divergences: Array<{ kind: "missing-edge" | "extra-edge" | "mislabeled-direction" | "missing-concept"; description: string; elementIds: string[] }> }`
- Tone instruction: "Productive disagreements only. Prefer 'consider connecting X and Y' over 'you missed X'. Skip trivia."
- Cap at 5 divergences per pass to keep tutor mentions focused.

**Implementation Notes**:
- The compressed shape inventory: extract from `tldraw scene` only the text labels + their connections (arrows). Strip styling, positions. Keeps the prompt concise.
- The `engineResolver` — same pattern as `MisconceptionIndexer` uses (bootstrap engine resolver).
- This indexer runs AFTER `ConceptMapSnapshotter` so the divergences reflect the latest snapshot.
- Failures don't throw — the orchestrator should keep going. Log + skip.

**Acceptance Criteria**:
- [ ] `divergences[]` field on the concept map row gets populated after a session-end pass.
- [ ] Divergences validate against the Zod schema.
- [ ] If the LLM call fails, the row's existing divergences are NOT cleared (preserve last-known-good).
- [ ] Capped at 5 divergences.

---

### Unit 9: Concept-link service helper — fuzzy match

**File**: `packages/core/src/services/concept-link-matcher.ts` (new)

```typescript
import type { Concept } from "../types/index.js";

export interface ConceptMatch {
  conceptId: ConceptId;
  conceptName: string;
  confidence: number;  // 0..1
}

/**
 * Fuzzy-match a label against a list of canonical concept names. Returns
 * matches with confidence ≥ minConfidence (default 0.7), sorted descending.
 *
 * Uses a normalized token-overlap + Levenshtein blend. Pure function for tests.
 */
export function matchConceptByLabel(
  label: string,
  canonicalConcepts: ReadonlyArray<Concept>,
  minConfidence = 0.7,
): ConceptMatch[];
```

**Implementation Notes**:
- Strategy: lowercase + trim + drop punctuation; compute `(matching tokens / max(student tokens, concept tokens))` as the token-overlap score; combine with normalized Levenshtein distance on the full normalized strings.
- For v1: a small dependency-free implementation (~40 lines). The `fast-levenshtein` package is fine if a dep is preferred — verify nothing similar exists already.
- This isn't used server-side directly; it's used by the renderer (Unit 12) when the student types/edits a node label. Exporting from `@praxis/core/services` makes it available to the IPC layer if a future tool needs it.

**Acceptance Criteria**:
- [ ] `matchConceptByLabel("Linear Eqs", concepts)` ranks "Linear Equations" first with confidence ≥ 0.7.
- [ ] Empty label returns `[]`.
- [ ] No matches above threshold returns `[]`.
- [ ] Pure function — same input always same output.

---

### Unit 10: Concept-maps routes

**Files**:
- `packages/ui/src/router.tsx` (modify) — add two new routes
- `packages/ui/src/routes/concept-maps-list.tsx` + `.module.css` (new)
- `packages/ui/src/routes/concept-map-editor.tsx` + `.module.css` (new)

Routes:

```typescript
const conceptMapsListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/courses/$courseId/concept-maps",
  component: ConceptMapsListRoute,
});

const conceptMapEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/courses/$courseId/concept-maps/$conceptMapId",
  component: ConceptMapEditorRoute,
});
```

**`<ConceptMapsListRoute />`** — uses `<RouteHeader ornament="§" kicker="CONCEPT MAPS" title="concept maps" deck="how concepts connect">` + `useResource(() => client.conceptMaps.list({ courseId }))` + `<EmptyState message={COPY.empty.conceptMaps} action={{ label: "+ new map", onClick: handleCreate }} />`.

Each list item: title + version count + "open" affordance.

**`<ConceptMapEditorRoute />`** — uses `useResource(() => client.conceptMaps.get(conceptMapId))` to load. Renders:

```tsx
<div className={styles.layout}>
  <RouteHeader ornament="§" kicker="CONCEPT MAP" title={map.title} deck={`${versionCount} versions · last edit ${ago}`} />
  <div className={styles.toolbar}>
    <button onClick={() => setShowHints(s => !s)}>{showHints ? "Hide" : "Show"} canonical hints</button>
    <button onClick={handleRename}>Rename</button>
  </div>
  <div className={styles.canvas}>
    <SketchCanvas
      variant="full"
      initialSnapshot={map.scene}
      onChange={handleSceneChange}  // debounced 500ms; calls client.conceptMaps.updateScene
      handleRef={canvasHandleRef}
    />
    {showHints && <CanonicalHintsOverlay courseId={courseId} drawnConceptIds={drawnIds} canvasHandle={canvasHandleRef} />}
    <ConceptLinkOverlay map={map} canvasHandle={canvasHandleRef} courseId={courseId} onLink={handleLink} />
  </div>
</div>
```

**Implementation Notes**:
- The editor uses `<SketchCanvas variant="full">` from Phase 15a.
- `onChange` debounce 500ms → `client.conceptMaps.updateScene({ id, scene, conceptLinks })`.
- The `<CanonicalHintsOverlay />` and `<ConceptLinkOverlay />` are children of the canvas container with `position: absolute` overlays. They observe the canvas state via the `handleRef`.

**Acceptance Criteria**:
- [ ] `/courses/$courseId/concept-maps` lists maps; "+ new map" creates and navigates to the editor.
- [ ] `/courses/$courseId/concept-maps/$conceptMapId` shows the editor with the current scene.
- [ ] Editing the canvas updates `client.conceptMaps.updateScene` (debounced, verify via spy).
- [ ] Toggling "Show canonical hints" mounts/unmounts the overlay.

---

### Unit 11: `<ConceptLinkOverlay />` — typeahead on node label edit

**File**: `packages/ui/src/components/concept-link-overlay.tsx` + `.module.css` (new)

When the student edits a tldraw text shape label, this overlay watches the label and:
1. Fuzzy-matches against the course's canonical concepts (using `matchConceptByLabel`).
2. Shows a small floating typeahead near the shape with the top 3 matches.
3. Clicking a match writes the link `{ elementId, conceptId, confidence }` and updates the live conceptLinks; the linked shape gets a small marker (a § ornament floating in the corner).

```typescript
export interface ConceptLinkOverlayProps {
  map: ConceptMapDrawing;
  canvasHandle: RefObject<SketchCanvasHandle | null>;
  courseId: CourseId;
  onLink: (link: ConceptLink) => void;
}
```

**Implementation Notes**:
- Subscribe to tldraw's editor.store events to detect text-shape label changes — use `editor.store.listen()` with a filter for shape updates with `type: "text"`.
- Fetch canonical concepts: `client.artifacts.concepts(courseId)` (verified to exist from Phase 10).
- Cache the canonical concepts list for the editor session (one fetch on mount).
- Position the typeahead near the editing shape — convert tldraw page coords to screen coords via `editor.pageToScreen(point)`.
- Don't suggest already-linked concepts (filter them out).
- Linked shape marker: render as a tldraw shape decoration OR an absolute-positioned `<span>` overlay. Pick whichever is less invasive — for v1 the `<span>` overlay is simpler.

**Acceptance Criteria**:
- [ ] Typing "Linear" in a text shape shows "Linear Equations" suggestion.
- [ ] Clicking a suggestion calls `onLink({ elementId, conceptId, confidence })`.
- [ ] Linked shapes show a § marker.
- [ ] Already-linked concepts don't appear in suggestions.

---

### Unit 12: `<CanonicalHintsOverlay />` — ghost shapes when toggled on

**File**: `packages/ui/src/components/canonical-hints-overlay.tsx` + `.module.css` (new)

When toggled on, render ghost shapes for canonical concepts the student hasn't drawn (or hasn't linked any element to). v1 layout: simple 3-column grid in the canvas's right margin.

```typescript
export interface CanonicalHintsOverlayProps {
  courseId: CourseId;
  /** Concept ids the student has linked (so we don't ghost what they have). */
  drawnConceptIds: ReadonlyArray<ConceptId>;
  canvasHandle: RefObject<SketchCanvasHandle | null>;
}
```

**Implementation Notes**:
- Fetch canonical concepts + edges: `client.artifacts.concepts(courseId)` for nodes; for edges, expose a new `client.artifacts.prerequisiteEdges(courseId)` if it doesn't exist (verify in `packages/core/src/types/client.ts`'s `ArtifactsClientSurface`).
- Filter to concepts NOT in `drawnConceptIds`.
- Render as React elements positioned over the canvas — NOT as tldraw shapes. They're a separate overlay layer with `pointer-events: none` so the canvas remains usable.
- Each ghost: muted gray text in a dashed border, with a "+ add to map" button on hover that creates a real tldraw shape on the canvas at the ghost's position (linked to the canonical concept by default).
- v1 layout: the overlay div is positioned at the canvas's right edge (computed from canvas bounds via `editor.getViewportPageBounds()` if needed); ghosts are stacked top-to-bottom.

**Acceptance Criteria**:
- [ ] When toggled on, ghosts appear for concepts not in `drawnConceptIds`.
- [ ] When toggled off, ghosts unmount.
- [ ] Clicking "+ add to map" creates a tldraw text shape with the concept name AND a `ConceptLink` is emitted upward.

---

### Unit 13: Course-detail integration

**File**: `packages/ui/src/routes/course-detail.tsx` (modify)

Add a "Concept maps" section to the course detail page (below the existing lessons section):

```tsx
<section className={styles.section}>
  <h2 className={styles.sectionTitle}>§ Concept maps</h2>
  {conceptMapsLoading && <LoadingState />}
  {conceptMaps && conceptMaps.length === 0 && (
    <EmptyState
      message={COPY.empty.conceptMaps}
      action={{ label: "+ new map", onClick: handleNewMap }}
      compact
    />
  )}
  {conceptMaps && conceptMaps.length > 0 && (
    <ul>
      {conceptMaps.map(m => (
        <li key={m.id}>
          <Link to="/courses/$courseId/concept-maps/$conceptMapId" params={{ courseId, conceptMapId: m.id }}>
            {m.title}
          </Link>
          <span className={styles.versionCount}>{m.versionCount} versions</span>
          {m.hasDivergences && <span className={styles.divergenceBadge}>discussion points</span>}
        </li>
      ))}
    </ul>
  )}
</section>
```

`handleNewMap`: call `client.conceptMaps.create({ courseId, title: "untitled" })`, then `navigate({ to: "/courses/$courseId/concept-maps/$conceptMapId", params: ... })`.

**Acceptance Criteria**:
- [ ] Course detail page lists concept maps below lessons.
- [ ] Empty state offers "+ new map".
- [ ] Maps with divergences show a "discussion points" badge.
- [ ] Clicking a map navigates to the editor.

---

### Unit 14: COPY additions

**File**: `packages/ui/src/lib/copy.ts` (modify)

```typescript
empty: {
  // ... existing
  conceptMaps: "No concept maps yet. Sketch one to externalize how the ideas connect — your tutor will compare it to the canonical graph and discuss productive differences with you.",
},
```

---

## Implementation Order

Backend → indexers → UI → integration. Each step independently shippable.

1. **Unit 1** — schema + migration.
2. **Unit 2** — type updates (ConceptMapDrawing, ConceptLink, ConceptMapVersion, ConceptMapSummary).
3. **Unit 3** — `ConceptMapService` interface.
4. **Unit 4** — `ConceptMapServiceImpl` + tests.
5. **Unit 5** — wire into Services + ServiceDeps.
6. **Unit 6** — IPC + `ConceptMapClient` + PraxisClient additions; remove the legacy `client.artifacts.conceptMaps` stub; update `makeFakeClient`.
7. **Unit 7** — `ConceptMapSnapshotter` indexer + register.
8. **Unit 9** — `matchConceptByLabel` pure helper + tests.
9. **Unit 10** — routes + skeleton (loading, error, empty); `<SketchCanvas variant="full">` integrated; debounced `updateScene`.
10. **Unit 11** — `<ConceptLinkOverlay />`.
11. **Unit 12** — `<CanonicalHintsOverlay />`.
12. **Unit 13** — course-detail section.
13. **Unit 14** — COPY additions.
14. **Unit 8** — `ConceptMapDivergenceIndexer` (last because the prompt + LLM integration is the most intricate; the rest of the system is usable without it).

Stop points:
- After **Unit 7**: maps can be created and edited; auto-snapshot at session-end works; no divergences yet (just empty `divergencesJson`).
- After **Unit 12**: full editor experience including hints + linking. Coach commentary still inert.
- After **Unit 8**: divergences appear in `divergencesJson` after session-end; the teach-mode agent can read them via `conceptMaps.get(id)` (existing prompt fragments don't reference these — adding a reference is a Phase 15b.x prompt-fragment edit).

---

## Testing

### Unit 4 (ConceptMapServiceImpl) — `packages/core/src/services/__tests__/concept-map-service.test.ts`
- `useTempDb` for isolated SQLite.
- `create` writes a row + initial version.
- `updateScene` bumps `updatedAt`; does NOT add a version.
- `snapshotIfDirty` adds a version when scene changed; returns `{ snapshotted: false }` when not.
- `delete` cascades to versions.
- `listVersions` ordered by `snapshotAt` ascending.
- `setDivergences` persists and round-trips.

### Unit 6 (Client) — extend `packages/client/src/__tests__/client.test.ts`
- `client.conceptMaps.list({ courseId })` invokes `praxis.conceptMaps.list`.
- `client.conceptMaps.create({...})` round-trips.

### Unit 7 (Snapshotter) — `packages/core/src/services/__tests__/concept-map-snapshotter.test.ts`
- After running the snapshotter at end of a session that touched a map, a new version exists.
- After running again with no changes, no new version.

### Unit 8 (Divergence indexer) — `packages/core/src/services/indexers/__tests__/concept-map-divergence-indexer.test.ts`
- Fake engine returns a known divergence list; verify it persists onto the row.
- Fake engine throws; verify the row's divergences are unchanged (preserve last-known-good).
- Cap at 5 — input with 8 divergences trimmed to 5.

### Unit 9 (matcher) — `packages/core/src/services/__tests__/concept-link-matcher.test.ts`
- "Linear Eqs" → "Linear Equations" with confidence ≥ 0.7.
- "Slope" → "Slope" with confidence 1.0 (exact match).
- "Banana" → no matches.
- Empty label → `[]`.

### Unit 10 (routes) — `packages/ui/src/__tests__/concept-maps-list-route.test.tsx` + `concept-map-editor-route.test.tsx`
- List route: empty state shows "+ new map"; clicking creates + navigates.
- Editor route: loads existing map; debounced edits call `updateScene`.
- Toggle hints button shows/hides the overlay.

### Unit 11 (link overlay) — `packages/ui/src/__tests__/concept-link-overlay.test.tsx`
- Editing a text shape's label triggers a fuzzy match.
- Clicking a suggestion fires `onLink` with the correct shape.
- Already-linked concepts excluded from suggestions.

### Unit 12 (hints overlay) — `packages/ui/src/__tests__/canonical-hints-overlay.test.tsx`
- When `drawnConceptIds` is empty, all canonical concepts ghost.
- When drawnConceptIds includes one, that concept doesn't ghost.
- "+ add to map" creates a tldraw shape and emits a link.

---

## Verification Checklist

```bash
cd /home/nathan/dev/praxis
pnpm db:migrate
pnpm --filter @praxis/memory test
pnpm --filter @praxis/core test
pnpm --filter @praxis/client test
pnpm --filter @praxis/ui test
pnpm --filter @praxis/desktop typecheck
npx tsgo --noEmit | grep -v "^tests/\|^scripts/"
```

Manual smoke (after Unit 13):
1. Open a course → "+ new concept map" → editor opens.
2. Draw a few text nodes connected by arrows.
3. Type "Slope" in a node → typeahead suggests the canonical concept; click to link.
4. Toggle "Show canonical hints" → ghost shapes appear for missing concepts.
5. Click "+ add to map" on a ghost → it becomes a real shape, linked.
6. End the session → restart app → revisit the map → version count increased by 1.
7. (After divergence indexer) Revisit after a session → "discussion points" badge appears.

---

## Risks and Open Questions

1. **Concept-link cleanup on shape delete** — when the student deletes a tldraw shape that has a `ConceptLink`, the link should be removed. The editor needs to listen for shape-deleted events from tldraw and update conceptLinks accordingly. If it doesn't, links accumulate referencing dead shape ids. Worth testing explicitly.

2. **Canonical hints layout** — v1 places ghosts in a fixed grid in the right margin. If the canvas is panned, the ghost overlay should NOT pan (it's screen-anchored, not page-anchored). Use `position: absolute` on the canvas container, not on tldraw's transform layer.

3. **Many-maps + indexer cost** — at session-end, the divergence indexer makes one LLM call per map for that course. A student with 5 maps incurs 5 LLM calls. For v1 that's acceptable; if costs balloon, add a "skip if not edited this session" check to the indexer (only run for maps that the snapshotter actually snapshotted in this run).

4. **Auto-snapshot scope** — the snapshotter snapshots every map for the session's course. If the student opened map A but didn't touch it, no snapshot (snapshotIfDirty is true to its name). If they touched map B AND map C, both get snapshots. Acceptable but worth surfacing.

5. **Divergences persisting on map edits** — when the student edits a map after a divergence pass, the `divergencesJson` becomes stale. v1 doesn't clear it on edit; the next session-end pass refreshes it. This means the "discussion points" badge can be misleading briefly after a major edit. Acceptable trade-off.

6. **No tldraw shared-canvas (tutor draws too)** — the UX.md "v1.x: tutor shared canvas" feature explicitly stays out. Phase 15b is student-only authoring.

7. **Coach commentary inline mention** — the divergences are persisted but no Phase 15b prompt-fragment edits make the teach-mode agent reference them. A small follow-up (Phase 15b.x or part of Phase 17 study-skills) should add: "If the student has unread divergences on a concept map for this course, mention one as a conversation starter early in the session."
