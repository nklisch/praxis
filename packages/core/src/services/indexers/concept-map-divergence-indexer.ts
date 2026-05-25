/**
 * ConceptMapDivergenceIndexer — agent-driven session-end divergence detection.
 *
 * For each concept map that belongs to the session's course, calls the LLM
 * with a compressed scene inventory and the canonical concept graph to produce
 * a list of pedagogically significant divergences (max 5 per map).
 *
 * Mirrors the MisconceptionIndexer pattern:
 * - Uses runOneShot for the LLM call.
 * - Failures are non-fatal (log + skip; last-known-good divergences preserved).
 * - Runs at session-end, AFTER ConceptMapSnapshotter.
 */

import { courses } from "@praxis/artifacts/schema";
import { concepts, prerequisiteEdges } from "@praxis/curriculum/schema";
import { noopDispatch, runOneShot } from "@praxis/engines";
import { eq, inArray } from "drizzle-orm";
import type { PraxisDb } from "../../db/index.js";
import type {
  ConceptMapDivergence,
  ConceptMapDrawing,
  ConceptMapService,
  CourseId,
  CourseStateReader,
  Engine,
  Indexer,
  IndexerContext,
  Logger,
} from "../../types/index.js";
import { brandId } from "../../types/index.js";
import {
  DIVERGENCE_SYSTEM_PROMPT,
  DivergenceOutputSchema,
} from "./concept-map-divergence-prompt.js";

/** Maximum divergences persisted per map per indexer pass. */
const MAX_DIVERGENCES = 5;

export interface ConceptMapDivergenceIndexerDeps {
  readonly db: PraxisDb;
  readonly log: Logger;
  readonly conceptMaps: ConceptMapService;
  /** Resolves the active engine for one-shot LLM calls. */
  readonly engineResolver: () => Engine;
  /**
   * Resolves the courseId for the given sessionId.
   * Returns null when the session has no associated course.
   */
  readonly sessionCourseId: (sessionId: string) => string | null;
  /** Used to read canonical course state (concepts, course name, etc.). */
  readonly courseStateReader: CourseStateReader;
}

export class ConceptMapDivergenceIndexer implements Indexer {
  readonly id = "concept-map-divergence";
  readonly schedule = "session-end" as const;

  constructor(private readonly deps: ConceptMapDivergenceIndexerDeps) {}

  async run(ctx: IndexerContext): Promise<void> {
    const rawCourseId = this.deps.sessionCourseId(ctx.sessionId);
    if (!rawCourseId) return;

    const courseId = brandId<"CourseId">(rawCourseId) as CourseId;

    // Get the course row for name + conceptGraphId.
    const courseRow = this.deps.db.select().from(courses).where(eq(courses.id, courseId)).get();
    if (!courseRow) return;

    // Verify the course state is accessible (snapshot provides student context).
    const snapshot = await this.deps.courseStateReader.read({
      studentId: ctx.studentId,
      courseId,
    });
    if (!snapshot) return;

    // Fetch canonical concepts via the course's conceptGraphId.
    const canonicalConcepts = this.deps.db
      .select()
      .from(concepts)
      .where(eq(concepts.graphId, courseRow.conceptGraphId))
      .all();
    if (canonicalConcepts.length === 0) return;

    const conceptIds = canonicalConcepts.map((c) => c.id);

    // Fetch edges where the source concept is in this graph.
    // Filter in-memory to also verify the target belongs to the same graph.
    const idSet = new Set(conceptIds);
    const edgeRows = this.deps.db
      .select()
      .from(prerequisiteEdges)
      .where(inArray(prerequisiteEdges.fromId, conceptIds))
      .all()
      .filter((e) => idSet.has(e.toId));

    // Build a name lookup for prompt rendering.
    const conceptNameById = new Map(canonicalConcepts.map((c) => [c.id, c.name]));

    const canonicalEdges = edgeRows.map((e) => ({
      fromName: conceptNameById.get(e.fromId) ?? e.fromId,
      toName: conceptNameById.get(e.toId) ?? e.toId,
      strength: e.strengthMilli / 1000,
    }));

    // List maps for this (student, course).
    let maps: Awaited<ReturnType<ConceptMapService["list"]>>;
    try {
      maps = await this.deps.conceptMaps.list({
        studentId: ctx.studentId,
        courseId,
      });
    } catch (err) {
      this.deps.log.warn("conceptMap.divergence.list_failed", {
        courseId,
        error: String(err),
      });
      return;
    }

    if (maps.length === 0) return;

    for (const summary of maps) {
      const map = await this.deps.conceptMaps.get(summary.id);
      if (!map) continue;

      try {
        const divergences = await this.runOneShotComparison(map, {
          courseTitle: courseRow.title,
          canonicalConcepts: canonicalConcepts.map((c) => ({
            id: c.id,
            name: c.name,
            description: c.description,
          })),
          canonicalEdges,
        });
        await this.deps.conceptMaps.setDivergences(map.id, divergences);
        this.deps.log.info("conceptMap.divergence.indexed", {
          mapId: map.id,
          count: divergences.length,
        });
      } catch (err) {
        // Failure preserves last-known-good divergences — do NOT clear them.
        this.deps.log.warn("conceptMap.divergence.indexer_failed", {
          mapId: map.id,
          error: String(err),
        });
      }
    }
  }

  private async runOneShotComparison(
    map: ConceptMapDrawing,
    courseContext: {
      courseTitle: string;
      canonicalConcepts: Array<{ id: string; name: string; description: string }>;
      canonicalEdges: Array<{ fromName: string; toName: string; strength: number }>;
    },
  ): Promise<ConceptMapDivergence[]> {
    const userMessage = buildUserMessage(map, courseContext);

    const events = runOneShot(
      this.deps.engineResolver(),
      {
        systemPrompt: DIVERGENCE_SYSTEM_PROMPT,
        tools: {
          list: () => [],
          dispatch: noopDispatch("concept-map-divergence-indexer"),
        },
        maxSteps: 1,
      },
      userMessage,
    );

    let assistantText = "";
    for await (const ev of events) {
      if (ev.type === "model_message") {
        assistantText += ev.content;
      }
      if (ev.type === "error") {
        throw new Error(`engine error: ${ev.error.message}`);
      }
    }

    if (!assistantText.trim()) {
      this.deps.log.warn("conceptMap.divergence.empty_response", { mapId: map.id });
      return [];
    }

    return parseDivergenceOutput(assistantText, this.deps.log, map.id);
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Extract a compressed inventory from the tldraw scene JSON:
 * text labels + arrow connections by element id. Strips positions and styling
 * to keep the prompt concise.
 */
function compressScene(map: ConceptMapDrawing): {
  labels: Array<{ id: string; text: string }>;
  arrows: Array<{ id: string; fromId?: string; toId?: string }>;
} {
  const labels: Array<{ id: string; text: string }> = [];
  const arrows: Array<{ id: string; fromId?: string; toId?: string }> = [];

  // biome-ignore lint/suspicious/noExplicitAny: tldraw scene is opaque JSON
  const scene = map.scene as any;
  if (!scene || typeof scene !== "object") return { labels, arrows };

  // biome-ignore lint/suspicious/noExplicitAny: tldraw shape records are opaque
  const shapes: Record<string, any> = scene.shapes ?? {};
  for (const [id, shape] of Object.entries(shapes)) {
    if (!shape || typeof shape !== "object") continue;

    const type = shape.type ?? shape.typeName;

    if (type === "text" || type === "geo") {
      const text =
        shape.props?.text ?? shape.text ?? (typeof shape.label === "string" ? shape.label : "");
      if (text) {
        labels.push({ id, text: String(text) });
      }
    } else if (type === "arrow" || type === "line") {
      arrows.push({
        id,
        fromId: shape.props?.start?.boundShapeId ?? shape.start?.boundShapeId,
        toId: shape.props?.end?.boundShapeId ?? shape.end?.boundShapeId,
      });
    }
  }

  return { labels, arrows };
}

function buildUserMessage(
  map: ConceptMapDrawing,
  ctx: {
    courseTitle: string;
    canonicalConcepts: Array<{ id: string; name: string; description: string }>;
    canonicalEdges: Array<{ fromName: string; toName: string; strength: number }>;
  },
): string {
  const conceptLines = ctx.canonicalConcepts
    .map((c) => `- id: ${c.id}, name: ${c.name}`)
    .join("\n");

  const edgeLines =
    ctx.canonicalEdges.length > 0
      ? ctx.canonicalEdges
          .map((e) => `- "${e.fromName}" → "${e.toName}" (strength: ${e.strength.toFixed(2)})`)
          .join("\n")
      : "(none)";

  const linkLines =
    map.conceptLinks.length > 0
      ? map.conceptLinks
          .map(
            (l) =>
              `- elementId: ${l.elementId}, canonicalConceptId: ${l.conceptId}, confidence: ${l.confidence.toFixed(2)}`,
          )
          .join("\n")
      : "(none — student has not linked any shapes to canonical concepts)";

  const { labels, arrows } = compressScene(map);

  const labelLines =
    labels.length > 0 ? labels.map((l) => `- ${l.id}: "${l.text}"`).join("\n") : "(none)";

  const arrowLines =
    arrows.length > 0
      ? arrows.map((a) => `- ${a.id}: ${a.fromId ?? "?"} → ${a.toId ?? "?"}`).join("\n")
      : "(none)";

  return `Course: ${ctx.courseTitle}

Canonical concepts (${ctx.canonicalConcepts.length} total):
${conceptLines}

Canonical prerequisite edges:
${edgeLines}

Student's concept-link bindings (shape id → canonical concept id):
${linkLines}

Student's map — text labels (shape id → text):
${labelLines}

Student's map — arrows (shape id → from shape id → to shape id):
${arrowLines}

Map title: "${map.title}"

Please identify up to ${MAX_DIVERGENCES} pedagogically significant divergences.`;
}

function parseDivergenceOutput(text: string, log: Logger, mapId: string): ConceptMapDivergence[] {
  // Extract fenced JSON block.
  const fence = text.match(/```json\n?([\s\S]*?)\n?```/);
  let jsonText: string | null = null;

  if (fence?.[1]) {
    jsonText = fence[1].trim();
  } else {
    // Fallback: find a JSON object { ... } in the text.
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end > start) {
      jsonText = text.slice(start, end + 1);
    }
  }

  if (!jsonText) {
    log.warn("conceptMap.divergence.no_json_block", { mapId });
    return [];
  }

  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    log.warn("conceptMap.divergence.json_parse_error", { mapId });
    return [];
  }

  const parsed = DivergenceOutputSchema.safeParse(raw);
  if (!parsed.success) {
    log.warn("conceptMap.divergence.schema_validation_failed", {
      mapId,
      errors: parsed.error.flatten(),
    });
    return [];
  }

  // Cap at MAX_DIVERGENCES (schema already enforces .max(5); be explicit here too).
  return parsed.data.divergences.slice(0, MAX_DIVERGENCES) as ConceptMapDivergence[];
}
