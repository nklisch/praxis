import { notes } from "@praxis/artifacts/schema";
import { conceptMaps, conceptMapVersions, sessions } from "@praxis/memory/schema";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import { configuratorActions, configuratorSnapshots } from "../schema.js";
import type {
  ConceptId,
  ConceptLink,
  ConceptMapDivergence,
  ConceptMapDrawing,
  ConceptMapId,
  ConceptMapService,
  ConceptMapSummary,
  ConceptMapVersion,
  ConfiguratorId,
  CourseId,
  Logger,
  NoteId,
  RippleSummary,
  SessionId,
  StudentId,
  Timestamp,
  TldrawSnapshot,
} from "../types/index.js";
import { brandId } from "../types/index.js";
import { SNAPSHOT_SCHEMA_VERSION } from "./snapshot-capturer.js";

export interface ConceptMapServiceDeps {
  readonly db: PraxisDb;
  readonly log: Logger;
  /**
   * Required for convertFromSketch: records the conversion as a configurator
   * action so the 24h undo window (restoreAction) can delete the new map.
   * If not provided, convertFromSketch omits the audit trail (test/embed mode).
   */
  readonly configuratorId?: () => ConfiguratorId;
}

/** Row shape returned from the concept_maps select. */
interface MapRow {
  id: string;
  studentId: string;
  courseId: string;
  title: string;
  sceneJson: unknown;
  conceptLinksJson: unknown;
  divergencesJson: unknown;
  createdAt: Date;
  updatedAt: Date;
}

function rowToDrawing(row: MapRow): ConceptMapDrawing {
  return {
    id: brandId<"ConceptMapId">(row.id),
    studentId: brandId<"StudentId">(row.studentId),
    courseId: brandId<"CourseId">(row.courseId),
    title: row.title,
    scene: row.sceneJson as TldrawSnapshot,
    conceptLinks: (row.conceptLinksJson as ConceptLink[]) ?? [],
    ...(row.divergencesJson !== null &&
      row.divergencesJson !== undefined && {
        divergences: row.divergencesJson as ConceptMapDivergence[],
      }),
    createdAt: row.createdAt.getTime() as Timestamp,
    updatedAt: row.updatedAt.getTime() as Timestamp,
  };
}

/** Row shape from concept_map_versions. */
interface VersionRow {
  id: string;
  conceptMapId: string;
  sceneJson: unknown;
  conceptLinksJson: unknown;
  sessionId: string | null;
  snapshotAt: Date;
}

function rowToVersion(row: VersionRow): ConceptMapVersion {
  return {
    id: row.id,
    conceptMapId: brandId<"ConceptMapId">(row.conceptMapId),
    scene: row.sceneJson as TldrawSnapshot,
    conceptLinks: (row.conceptLinksJson as ConceptLink[]) ?? [],
    ...(row.sessionId !== null && row.sessionId !== undefined
      ? { sessionId: brandId<"SessionId">(row.sessionId) }
      : {}),
    snapshotAt: row.snapshotAt.getTime() as Timestamp,
  };
}

export class ConceptMapServiceImpl implements ConceptMapService {
  constructor(private readonly deps: ConceptMapServiceDeps) {}

  async create(input: {
    studentId: StudentId;
    courseId: CourseId;
    title: string;
  }): Promise<ConceptMapDrawing> {
    const id = uuidv7();
    const now = new Date();
    // Empty tldraw snapshot — caller populates via updateScene later.
    const emptyScene: TldrawSnapshot = {} as TldrawSnapshot;

    this.deps.db
      .insert(conceptMaps)
      .values({
        id,
        studentId: input.studentId,
        courseId: input.courseId,
        title: input.title,
        sceneJson: emptyScene,
        conceptLinksJson: [],
        divergencesJson: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Write initial version so the version chain is never empty.
    this.deps.db
      .insert(conceptMapVersions)
      .values({
        id: uuidv7(),
        conceptMapId: id,
        sceneJson: emptyScene,
        conceptLinksJson: [],
        sessionId: null,
        snapshotAt: now,
      })
      .run();

    const created = await this.get(brandId<"ConceptMapId">(id));
    if (!created) throw new Error(`ConceptMapService.create: not found after insert: ${id}`);
    return created;
  }

  async get(id: ConceptMapId): Promise<ConceptMapDrawing | null> {
    const row = this.deps.db.select().from(conceptMaps).where(eq(conceptMaps.id, id)).get();
    return row ? rowToDrawing(row as MapRow) : null;
  }

  async list(input: { studentId: StudentId; courseId: CourseId }): Promise<ConceptMapSummary[]> {
    // Join with a subquery to get version counts and existence of divergences.
    const maps = this.deps.db
      .select()
      .from(conceptMaps)
      .where(
        and(eq(conceptMaps.studentId, input.studentId), eq(conceptMaps.courseId, input.courseId)),
      )
      .orderBy(desc(conceptMaps.updatedAt))
      .all();

    if (maps.length === 0) return [];

    // For each map, count versions.
    const summaries: ConceptMapSummary[] = await Promise.all(
      maps.map(async (m) => {
        const countResult = this.deps.db
          .select({ versionCount: count() })
          .from(conceptMapVersions)
          .where(eq(conceptMapVersions.conceptMapId, m.id))
          .get();
        const row = m as MapRow;
        return {
          id: brandId<"ConceptMapId">(row.id),
          studentId: brandId<"StudentId">(row.studentId),
          courseId: brandId<"CourseId">(row.courseId),
          title: row.title,
          versionCount: countResult?.versionCount ?? 0,
          hasDivergences:
            row.divergencesJson !== null &&
            row.divergencesJson !== undefined &&
            Array.isArray(row.divergencesJson) &&
            (row.divergencesJson as ConceptMapDivergence[]).length > 0,
          createdAt: row.createdAt.getTime() as Timestamp,
          updatedAt: row.updatedAt.getTime() as Timestamp,
        } satisfies ConceptMapSummary;
      }),
    );

    return summaries;
  }

  async rename(id: ConceptMapId, title: string): Promise<ConceptMapDrawing> {
    this.deps.db
      .update(conceptMaps)
      .set({ title, updatedAt: new Date() })
      .where(eq(conceptMaps.id, id))
      .run();

    const updated = await this.get(id);
    if (!updated) throw new Error(`ConceptMapService.rename: not found after update: ${id}`);
    return updated;
  }

  async delete(id: ConceptMapId): Promise<void> {
    // FK cascade handles deleting versions.
    this.deps.db.delete(conceptMaps).where(eq(conceptMaps.id, id)).run();
  }

  async updateScene(input: {
    id: ConceptMapId;
    scene: TldrawSnapshot;
    conceptLinks: ConceptLink[];
  }): Promise<ConceptMapDrawing> {
    this.deps.db
      .update(conceptMaps)
      .set({
        sceneJson: input.scene,
        conceptLinksJson: input.conceptLinks,
        updatedAt: new Date(),
      })
      .where(eq(conceptMaps.id, input.id))
      .run();

    const updated = await this.get(input.id);
    if (!updated)
      throw new Error(`ConceptMapService.updateScene: not found after update: ${input.id}`);
    return updated;
  }

  async listVersions(id: ConceptMapId): Promise<ConceptMapVersion[]> {
    const rows = this.deps.db
      .select()
      .from(conceptMapVersions)
      .where(eq(conceptMapVersions.conceptMapId, id))
      .orderBy(asc(conceptMapVersions.snapshotAt))
      .all();
    return rows.map((r) => rowToVersion(r as VersionRow));
  }

  async snapshotIfDirty(input: {
    id: ConceptMapId;
    sessionId: SessionId;
  }): Promise<{ snapshotted: boolean; versionId?: string }> {
    const map = await this.get(input.id);
    if (!map) return { snapshotted: false };

    // Fetch the most recent version.
    const lastVersion = this.deps.db
      .select()
      .from(conceptMapVersions)
      .where(eq(conceptMapVersions.conceptMapId, input.id))
      .orderBy(desc(conceptMapVersions.snapshotAt))
      .limit(1)
      .get() as VersionRow | undefined;

    const liveJson = JSON.stringify({ scene: map.scene, links: map.conceptLinks });
    const lastJson = lastVersion
      ? JSON.stringify({
          scene: lastVersion.sceneJson,
          links: lastVersion.conceptLinksJson,
        })
      : null;

    if (liveJson === lastJson) return { snapshotted: false };

    const versionId = uuidv7();
    this.deps.db
      .insert(conceptMapVersions)
      .values({
        id: versionId,
        conceptMapId: input.id,
        sceneJson: map.scene,
        conceptLinksJson: map.conceptLinks,
        sessionId: input.sessionId,
        snapshotAt: new Date(),
      })
      .run();

    this.deps.log.info("conceptMap.snapshotted", { mapId: input.id, versionId });
    return { snapshotted: true, versionId };
  }

  async setDivergences(id: ConceptMapId, divergences: ConceptMapDivergence[]): Promise<void> {
    this.deps.db
      .update(conceptMaps)
      .set({ divergencesJson: divergences, updatedAt: new Date() })
      .where(eq(conceptMaps.id, id))
      .run();
  }

  async setNodeLink(input: {
    mapId: ConceptMapId;
    elementId: string;
    candidateId: string | null;
    state: "linked" | "best_guess" | "unlinked";
  }): Promise<ConceptMapDrawing> {
    const map = await this.get(input.mapId);
    if (!map) throw new Error(`ConceptMapService.setNodeLink: map not found: ${input.mapId}`);

    const existingLinks = map.conceptLinks as ConceptLink[];

    // Build the updated conceptLinks array.
    // If we're unlinking, remove the element's entry entirely (or set it to unlinked state).
    let updatedLinks: ConceptLink[];

    if (input.state === "unlinked" && input.candidateId === null) {
      // Clear the link — remove the node from conceptLinks.
      updatedLinks = existingLinks.filter((l) => l.elementId !== input.elementId);
    } else {
      const conceptId =
        input.candidateId !== null
          ? (brandId<"ConceptId">(input.candidateId) as ConceptId)
          : // If no candidateId, keep existing conceptId if one exists, else use placeholder.
            (existingLinks.find((l) => l.elementId === input.elementId)?.conceptId ??
            (brandId<"ConceptId">(input.elementId) as ConceptId));

      const confidence = input.state === "linked" ? 1.0 : 0.0;

      const existing = existingLinks.find((l) => l.elementId === input.elementId);
      const updatedLink: ConceptLink = {
        elementId: input.elementId,
        conceptId,
        confidence,
        linkState: input.state,
        // Keep existing candidates when transitioning to/from best_guess.
        ...(existing?.candidates !== undefined && { candidates: existing.candidates }),
      };

      if (existing !== undefined) {
        updatedLinks = existingLinks.map((l) =>
          l.elementId === input.elementId ? updatedLink : l,
        );
      } else {
        updatedLinks = [...existingLinks, updatedLink];
      }
    }

    this.deps.db
      .update(conceptMaps)
      .set({ conceptLinksJson: updatedLinks, updatedAt: new Date() })
      .where(eq(conceptMaps.id, input.mapId))
      .run();

    const updated = await this.get(input.mapId);
    if (!updated) {
      throw new Error(`ConceptMapService.setNodeLink: not found after update: ${input.mapId}`);
    }
    return updated;
  }

  // ─── Sketch → concept-map conversion ────────────────────────────────────────

  async convertFromSketch(
    noteId: NoteId,
    studentId: StudentId,
  ): Promise<{ conceptMapId: ConceptMapId; originalSketchNoteId: NoteId; nodeCount: number }> {
    // 1. Load the sketch note.
    const noteRow = this.deps.db
      .select()
      .from(notes)
      .where(and(eq(notes.id, noteId), eq(notes.studentId, studentId)))
      .get();
    if (!noteRow) throw new Error(`convertFromSketch: note not found: ${noteId}`);
    if (noteRow.format !== "sketch") {
      throw new Error(`convertFromSketch: note is not a sketch (format='${noteRow.format}')`);
    }

    // 2. Resolve courseId from the note context.
    const ctx = noteRow.contextJson as {
      courseId?: string;
      lessonId?: string;
      sessionId?: string;
    } | null;
    const courseId = ctx?.courseId;
    if (!courseId) {
      throw new Error(
        `convertFromSketch: sketch note has no courseId in context — cannot create concept map`,
      );
    }

    // 3. Extract nodes and edges from the tldraw scene JSON.
    const { nodes, edges } = extractFromTldrawScene(noteRow.sketchSceneJson);

    // 4. Build the initial tldraw snapshot for the concept map using extracted data.
    //    We create a minimal scene that positions nodes in a grid and adds edges.
    const mapScene = buildConceptMapScene(nodes, edges);

    // 5. Create the concept map row.
    const mapId = uuidv7();
    const now = new Date();
    this.deps.db
      .insert(conceptMaps)
      .values({
        id: mapId,
        studentId,
        courseId,
        title: `From sketch`,
        sceneJson: mapScene,
        conceptLinksJson: [],
        divergencesJson: null,
        createdAt: now,
        updatedAt: now,
      })
      .run();

    // Write initial version.
    this.deps.db
      .insert(conceptMapVersions)
      .values({
        id: uuidv7(),
        conceptMapId: mapId,
        sceneJson: mapScene,
        conceptLinksJson: [],
        sessionId: null,
        snapshotAt: now,
      })
      .run();

    this.deps.log.info("conceptMap.convertFromSketch", {
      noteId,
      mapId,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    });

    // 6. Record the conversion as a configurator action for undo.
    if (this.deps.configuratorId) {
      const actionId = uuidv7();
      this.deps.db
        .insert(configuratorActions)
        .values({
          id: actionId,
          configuratorId: this.deps.configuratorId(),
          ts: now,
          actionJson: {
            kind: "conceptMap.create",
            conceptMapId: mapId,
            originalSketchNoteId: noteId,
          },
        })
        .run();

      // Snapshot: sentinel "create" — restore = delete the map.
      this.deps.db
        .insert(configuratorSnapshots)
        .values({
          actionId,
          entityKind: "conceptMap.create",
          entityKeyJson: mapId,
          snapshotJson: {
            schemaVersion: SNAPSHOT_SCHEMA_VERSION,
            data: { kind: "create" },
          },
          restoredAt: null,
        })
        .run();
    }

    return {
      conceptMapId: brandId<"ConceptMapId">(mapId),
      originalSketchNoteId: noteId,
      nodeCount: nodes.length,
    };
  }

  async computeRipples(input: {
    mapId: ConceptMapId;
    elementId: string;
    candidateId: ConceptId;
  }): Promise<RippleSummary> {
    const map = await this.get(input.mapId);
    if (!map) {
      return { conceptCountDelta: 0, notesRetagged: 0, tutorRefsAffected: 0 };
    }

    // ── conceptCountDelta ─────────────────────────────────────────────────────
    // Count distinct canonical concept ids currently linked (excluding this node's
    // current mapping, if any). Then determine how many NEW concepts this link adds.
    const currentLinkedConceptIds = new Set(
      map.conceptLinks
        .filter((l) => l.elementId !== input.elementId && l.linkState !== "unlinked")
        .map((l) => l.conceptId as string),
    );
    const candidateStr = input.candidateId as string;
    const conceptCountDelta = currentLinkedConceptIds.has(candidateStr) ? 0 : 1;

    // ── notesRetagged ─────────────────────────────────────────────────────────
    // Notes whose contextJson.conceptIds do NOT currently include this candidate
    // but whose linksJson includes a reference to this map — those notes would
    // gain the canonical concept tag upon link confirmation.
    // v1: we count notes belonging to this map's student that don't already
    // have candidateId in their context.conceptIds. The "would be retagged" heuristic
    // is: notes associated with this course that don't yet carry the candidate concept.
    let notesRetagged = 0;
    try {
      // Query notes for this student + course that lack candidateId in their contextJson.
      // contextJson is { courseId?, lessonId?, sessionId?, conceptIds? }
      // We can't SQL-query inside JSON arrays portably, so we pull all student notes
      // for this course and filter in JS. This is v1 — acceptable for small corpora.
      const studentNotes = this.deps.db
        .select()
        .from(notes)
        .where(eq(notes.studentId, map.studentId))
        .all();

      for (const noteRow of studentNotes) {
        const ctx = noteRow.contextJson as {
          courseId?: string;
          lessonId?: string;
          sessionId?: string;
          conceptIds?: string[];
        } | null;
        // Only count notes associated with this course (or without a specific course).
        const notesCourseId = ctx?.courseId;
        if (notesCourseId !== undefined && notesCourseId !== (map.courseId as string)) {
          continue;
        }
        const conceptIds = ctx?.conceptIds ?? [];
        if (!conceptIds.includes(candidateStr)) {
          notesRetagged++;
        }
      }
    } catch {
      // Non-fatal — ripple count degrades gracefully to 0 if notes query fails.
      notesRetagged = 0;
    }

    // ── tutorRefsAffected ─────────────────────────────────────────────────────
    // Count open (non-ended) teach-mode sessions for this student+course that
    // reference the map's course. These sessions would see the link resolve
    // differently next time the tutor queries the concept map.
    let tutorRefsAffected = 0;
    try {
      const openSessionRows = this.deps.db
        .select({ id: sessions.id })
        .from(sessions)
        .where(
          and(
            eq(sessions.studentId, map.studentId),
            eq(sessions.courseId, map.courseId as string),
            sql`${sessions.endedAt} IS NULL`,
          ),
        )
        .all();
      tutorRefsAffected = openSessionRows.length;
    } catch {
      // Non-fatal.
      tutorRefsAffected = 0;
    }

    return { conceptCountDelta, notesRetagged, tutorRefsAffected };
  }
}

// ─── tldraw scene extraction helpers ─────────────────────────────────────────

/**
 * Known relation-label → canonical edge kind mappings.
 * Arrow labels are lowercased before lookup.
 */
const RELATION_LABEL_MAP: Readonly<Record<string, string>> = {
  "is-a": "is-a",
  "is a": "is-a",
  isa: "is-a",
  "instance of": "is-a",
  "instance-of": "is-a",
  causes: "causes",
  cause: "causes",
  "caused by": "caused-by",
  "caused-by": "caused-by",
  "depends on": "depends-on",
  "depends-on": "depends-on",
  "part of": "part-of",
  "part-of": "part-of",
  "has part": "has-part",
  "has-part": "has-part",
  contains: "contains",
  related: "related",
  "related to": "related",
  "related-to": "related",
};

interface ExtractedNode {
  id: string;
  label: string;
}

interface ExtractedEdge {
  id: string;
  fromId: string;
  toId: string;
  label: string;
  relationKind: string;
}

/**
 * Extract nodes and edges from a tldraw scene JSON.
 *
 * tldraw snapshot shape:
 *   { document: { store: Record<string, TLShape> } }
 *   OR a flat `store` at the top level (v2 snapshot).
 *
 * For each shape:
 *   - type "text" or "geo" with non-empty `props.text` → candidate node.
 *   - type "arrow" with bound start/end shapes → edge between those nodes.
 *     Arrow's label is read from `props.text` or the first bound label shape.
 *
 * Shapes without text labels are silently skipped.
 */
function extractFromTldrawScene(sceneJson: unknown): {
  nodes: ExtractedNode[];
  edges: ExtractedEdge[];
} {
  if (sceneJson === null || typeof sceneJson !== "object") {
    return { nodes: [], edges: [] };
  }

  // Resolve the store map: try document.store first (v2), then top-level store.
  // biome-ignore lint/suspicious/noExplicitAny: tldraw internal JSON shape; validated below
  const scene = sceneJson as any;
  // biome-ignore lint/suspicious/noExplicitAny: tldraw store shape varies per version
  let store: Record<string, any> | null = null;

  if (
    typeof scene.document === "object" &&
    scene.document !== null &&
    typeof scene.document.store === "object"
  ) {
    store = scene.document.store as Record<string, unknown>;
  } else if (typeof scene.store === "object" && scene.store !== null) {
    store = scene.store as Record<string, unknown>;
  } else if (typeof scene === "object") {
    // Flat shape map (some editor.getSnapshot() formats).
    store = scene;
  }

  if (store === null) return { nodes: [], edges: [] };

  const nodeMap = new Map<string, ExtractedNode>();
  const rawArrows: Array<{
    id: string;
    startId: string | null;
    endId: string | null;
    label: string;
  }> = [];

  for (const [key, shape] of Object.entries(store)) {
    if (typeof shape !== "object" || shape === null) continue;
    const shapeId = (shape.id as string | undefined) ?? key;
    const type = shape.type as string | undefined;

    if (type === "text" || type === "geo") {
      const text = ((shape.props?.text as string | undefined) ?? "").trim();
      if (text.length > 0) {
        nodeMap.set(shapeId, { id: shapeId, label: text });
      }
    } else if (type === "arrow") {
      const startId =
        (shape.props?.start?.boundShapeId as string | undefined) ??
        (shape.props?.startShapeId as string | undefined) ??
        null;
      const endId =
        (shape.props?.end?.boundShapeId as string | undefined) ??
        (shape.props?.endShapeId as string | undefined) ??
        null;
      const arrowText = ((shape.props?.text as string | undefined) ?? "").trim();
      rawArrows.push({ id: shapeId, startId, endId, label: arrowText });
    }
  }

  const edges: ExtractedEdge[] = [];
  for (const arrow of rawArrows) {
    if (!arrow.startId || !arrow.endId) continue;
    if (!nodeMap.has(arrow.startId) || !nodeMap.has(arrow.endId)) continue;
    const normalizedLabel = arrow.label.toLowerCase();
    const relationKind = RELATION_LABEL_MAP[normalizedLabel] ?? "related";
    edges.push({
      id: arrow.id,
      fromId: arrow.startId,
      toId: arrow.endId,
      label: arrow.label,
      relationKind,
    });
  }

  return { nodes: Array.from(nodeMap.values()), edges };
}

/**
 * Build a minimal tldraw snapshot for the new concept map.
 * Nodes are laid out in a grid (4 columns); edges are represented as arrows.
 * The resulting snapshot can be loaded directly by the tldraw editor.
 */
function buildConceptMapScene(nodes: ExtractedNode[], edges: ExtractedEdge[]): TldrawSnapshot {
  const COLS = 4;
  const COL_GAP = 220;
  const ROW_GAP = 140;
  const NODE_W = 180;
  const NODE_H = 60;

  // biome-ignore lint/suspicious/noExplicitAny: tldraw shape JSON
  const store: Record<string, any> = {};

  // Place nodes in a grid.
  nodes.forEach((node, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = col * COL_GAP;
    const y = row * ROW_GAP;
    store[node.id] = {
      id: node.id,
      type: "geo",
      typeName: "shape",
      x,
      y,
      rotation: 0,
      isLocked: false,
      opacity: 1,
      meta: {},
      props: {
        geo: "rectangle",
        w: NODE_W,
        h: NODE_H,
        text: node.label,
        align: "middle",
        verticalAlign: "middle",
        growY: 0,
        url: "",
        labelColor: "black",
        color: "blue",
        fill: "solid",
        dash: "draw",
        size: "m",
        font: "draw",
      },
      parentId: "page:page",
      index: `a${i.toString().padStart(5, "0")}`,
    };
  });

  // Add arrows for edges.
  edges.forEach((edge, i) => {
    store[edge.id] = {
      id: edge.id,
      type: "arrow",
      typeName: "shape",
      x: 0,
      y: 0,
      rotation: 0,
      isLocked: false,
      opacity: 1,
      meta: {},
      props: {
        dash: "draw",
        size: "m",
        fill: "none",
        color: "black",
        labelColor: "black",
        bend: 0,
        text: edge.label,
        font: "draw",
        start: {
          type: "binding",
          boundShapeId: edge.fromId,
          normalizedAnchor: { x: 0.5, y: 0.5 },
          isExact: false,
          isPrecise: false,
        },
        end: {
          type: "binding",
          boundShapeId: edge.toId,
          normalizedAnchor: { x: 0.5, y: 0.5 },
          isExact: false,
          isPrecise: false,
        },
        arrowheadStart: "none",
        arrowheadEnd: "arrow",
      },
      parentId: "page:page",
      index: `z${i.toString().padStart(5, "0")}`,
    };
  });

  // Add the page record.
  store["page:page"] = {
    id: "page:page",
    typeName: "page",
    name: "Page 1",
    index: "a1",
    meta: {},
  };

  return { store } as unknown as TldrawSnapshot;
}
