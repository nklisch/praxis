import type {
  ConceptId,
  ConceptLink,
  ConceptMapId,
  CourseId,
  Logger,
  NoteId,
  TldrawSnapshot,
} from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { getStudentId } from "./student-id.js";

/**
 * IPC handlers for the conceptMaps service.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.conceptMaps.create
 *   praxis.conceptMaps.get
 *   praxis.conceptMaps.list
 *   praxis.conceptMaps.rename
 *   praxis.conceptMaps.delete
 *   praxis.conceptMaps.updateScene
 *   praxis.conceptMaps.listVersions
 *   praxis.conceptMaps.setNodeLink
 *   praxis.conceptMaps.computeRipples
 *   praxis.conceptMaps.convertFromSketch
 */
export function registerConceptMapsHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  handle(
    "praxis.conceptMaps.create",
    handleEnvelope(
      "praxis.conceptMaps.create",
      log,
      z.object({
        courseId: z.string().min(1, "courseId"),
        title: z.string().min(1, "title"),
      }),
      async (opts) => {
        const studentId = getStudentId(services);
        return services.conceptMaps.create({
          studentId,
          courseId: opts.courseId as CourseId,
          title: opts.title,
        });
      },
    ),
  );

  const conceptMapIdSchema = z.string().min(1, "id");

  handle(
    "praxis.conceptMaps.get",
    handleEnvelope("praxis.conceptMaps.get", log, conceptMapIdSchema, async (id) => {
      return services.conceptMaps.get(id as ConceptMapId);
    }),
  );

  handle(
    "praxis.conceptMaps.list",
    handleEnvelope(
      "praxis.conceptMaps.list",
      log,
      z.object({ courseId: z.string().min(1, "courseId") }),
      async (opts) => {
        const studentId = getStudentId(services);
        return services.conceptMaps.list({
          studentId,
          courseId: opts.courseId as CourseId,
        });
      },
    ),
  );

  handle(
    "praxis.conceptMaps.rename",
    handleEnvelope(
      "praxis.conceptMaps.rename",
      log,
      z.object({
        id: z.string().min(1, "id"),
        title: z.string().min(1, "title"),
      }),
      async (opts) => {
        return services.conceptMaps.rename(opts.id as ConceptMapId, opts.title);
      },
    ),
  );

  handle(
    "praxis.conceptMaps.delete",
    handleEnvelope("praxis.conceptMaps.delete", log, conceptMapIdSchema, async (id) => {
      return services.conceptMaps.delete(id as ConceptMapId);
    }),
  );

  const conceptMapUpdateSceneSchema = z.object({
    id: z.string().min(1, "id"),
    scene: z.unknown(),
    conceptLinks: z.array(z.unknown()),
  });

  handle(
    "praxis.conceptMaps.updateScene",
    handleEnvelope(
      "praxis.conceptMaps.updateScene",
      log,
      conceptMapUpdateSceneSchema,
      async (opts) =>
        services.conceptMaps.updateScene({
          id: opts.id as ConceptMapId,
          scene: opts.scene as TldrawSnapshot,
          conceptLinks: opts.conceptLinks as ConceptLink[],
        }),
    ),
  );

  handle(
    "praxis.conceptMaps.listVersions",
    handleEnvelope("praxis.conceptMaps.listVersions", log, conceptMapIdSchema, async (id) => {
      return services.conceptMaps.listVersions(id as ConceptMapId);
    }),
  );

  const conceptMapSetNodeLinkSchema = z.object({
    mapId: z.string().min(1, "mapId"),
    elementId: z.string().min(1, "elementId"),
    candidateId: z.string().nullable(),
    state: z.enum(["linked", "best_guess", "unlinked"]),
  });

  handle(
    "praxis.conceptMaps.setNodeLink",
    handleEnvelope(
      "praxis.conceptMaps.setNodeLink",
      log,
      conceptMapSetNodeLinkSchema,
      async (opts) =>
        services.conceptMaps.setNodeLink({
          mapId: opts.mapId as ConceptMapId,
          elementId: opts.elementId,
          candidateId: opts.candidateId,
          state: opts.state,
        }),
    ),
  );

  const conceptMapComputeRipplesSchema = z.object({
    mapId: z.string().min(1, "mapId"),
    elementId: z.string().min(1, "elementId"),
    candidateId: z.string().min(1, "candidateId"),
  });

  handle(
    "praxis.conceptMaps.computeRipples",
    handleEnvelope(
      "praxis.conceptMaps.computeRipples",
      log,
      conceptMapComputeRipplesSchema,
      async (opts) =>
        services.conceptMaps.computeRipples({
          mapId: opts.mapId as ConceptMapId,
          elementId: opts.elementId,
          candidateId: opts.candidateId as ConceptId,
        }),
    ),
  );

  // Phase 15b: Sketch → concept-map conversion
  handle(
    "praxis.conceptMaps.convertFromSketch",
    handleEnvelope(
      "praxis.conceptMaps.convertFromSketch",
      log,
      z.object({ sketchNoteId: z.string().min(1, "sketchNoteId") }),
      async (opts) => {
        const studentId = getStudentId(services);
        return services.conceptMaps.convertFromSketch(opts.sketchNoteId as NoteId, studentId);
      },
    ),
  );
}
