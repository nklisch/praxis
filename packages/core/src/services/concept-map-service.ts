import { notes } from "@praxis/artifacts/schema";
import { conceptMaps, conceptMapVersions, sessions } from "@praxis/memory/schema";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import type {
  ConceptId,
  ConceptLink,
  ConceptMapDivergence,
  ConceptMapDrawing,
  ConceptMapId,
  ConceptMapService,
  ConceptMapSummary,
  ConceptMapVersion,
  CourseId,
  Logger,
  RippleSummary,
  SessionId,
  StudentId,
  Timestamp,
  TldrawSnapshot,
} from "../types/index.js";
import { brandId } from "../types/index.js";

export interface ConceptMapServiceDeps {
  readonly db: PraxisDb;
  readonly log: Logger;
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
