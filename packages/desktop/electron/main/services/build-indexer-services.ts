import type { PraxisDb } from "@praxis/core/db";
import {
  ActivityRegistryImpl,
  AffectiveIndexer,
  ArtifactsServiceImpl,
  ConceptMapDivergenceIndexer,
  ConceptMapServiceImpl,
  ConceptMapSnapshotter,
  IndexerOrchestratorImpl,
  MasteryIndexer,
  MisconceptionIndexer,
  ProceduralIndexer,
} from "@praxis/core/services";
import type { ConfiguratorId, Engine } from "@praxis/core/types";
import { PedagogyPackServiceImpl } from "@praxis/curriculum/pedagogy";
import { sessions } from "@praxis/memory/schema";
import { eq } from "drizzle-orm";
import type { MainLogger } from "../logger.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IndexerServiceDeps {
  db: PraxisDb;
  log: MainLogger;
  artifactsService: ArtifactsServiceImpl;
  bootstrapEngineResolver: () => Engine;
  pedagogyPackService: PedagogyPackServiceImpl;
  activityRegistry: ActivityRegistryImpl;
}

export interface IndexerServices {
  conceptMapService: ConceptMapServiceImpl;
  /** The singleton configurator-id thunk — also used by AuthoringServiceImpl. */
  conceptMapConfiguratorId: () => ConfiguratorId;
  indexerOrchestrator: IndexerOrchestratorImpl;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Constructs the memory projection pipeline: concept map service, all six
 * indexers (mastery, misconception, affective, procedural, concept-map
 * snapshotter, concept-map divergence), and the indexer orchestrator.
 *
 * `readSessionCourseId` is factory-internal — indexers that need it receive
 * it as a closure captured here; it is not exported.
 *
 * `conceptMapService` and `conceptMapConfiguratorId` are returned because
 * downstream steps (step 8 workspace services, step 9 session assembly)
 * consume them independently.
 *
 * Construction ordering requirement: `artifactsService` must be live before
 * calling this factory (mastery/misconception/procedural indexers read from it).
 */
export function buildIndexerServices(deps: IndexerServiceDeps): IndexerServices {
  const { db, log, artifactsService, bootstrapEngineResolver, pedagogyPackService, activityRegistry } = deps;

  // -------------------------------------------------------------------------
  // Internal helper — look up the courseId for a given session.
  // Kept local; never exported.
  // -------------------------------------------------------------------------
  const readSessionCourseId = (sessionId: string): string | null => {
    const row = db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
    return row?.courseId ?? null;
  };

  // -------------------------------------------------------------------------
  // Phase 7: Indexers
  // -------------------------------------------------------------------------
  const masteryIndexer = new MasteryIndexer({
    db,
    log,
    courseStateReader: artifactsService,
    sessionCourseId: readSessionCourseId,
  });

  const misconceptionIndexer = new MisconceptionIndexer({
    db,
    log,
    engineResolver: bootstrapEngineResolver,
    courseStateReader: artifactsService,
    sessionCourseId: readSessionCourseId,
  });

  // -------------------------------------------------------------------------
  // Phase 15b: Concept map services + indexers.
  // v1: single configurator, always "default" (shared with AuthoringServiceImpl).
  // -------------------------------------------------------------------------
  const conceptMapConfiguratorId = () => "default" as ConfiguratorId;
  const conceptMapService = new ConceptMapServiceImpl({
    db,
    log,
    configuratorId: conceptMapConfiguratorId,
  });

  const conceptMapSnapshotter = new ConceptMapSnapshotter({
    log,
    conceptMaps: conceptMapService,
    sessionCourseId: readSessionCourseId,
  });

  const conceptMapDivergenceIndexer = new ConceptMapDivergenceIndexer({
    db,
    log,
    conceptMaps: conceptMapService,
    engineResolver: bootstrapEngineResolver,
    sessionCourseId: readSessionCourseId,
    courseStateReader: artifactsService,
  });

  // -------------------------------------------------------------------------
  // Phase 18: Affective + Procedural indexers
  // -------------------------------------------------------------------------
  const affectiveIndexer = new AffectiveIndexer({
    db,
    log,
    engineResolver: bootstrapEngineResolver,
  });

  const proceduralIndexer = new ProceduralIndexer({
    db,
    log,
    sessionCourseId: readSessionCourseId,
    courseStateReader: artifactsService,
    pedagogyPack: pedagogyPackService,
  });

  // -------------------------------------------------------------------------
  // Orchestrator — constructed last, after all indexers are ready.
  // -------------------------------------------------------------------------
  const indexerOrchestrator = new IndexerOrchestratorImpl({
    db,
    log,
    indexers: [
      masteryIndexer,
      misconceptionIndexer,
      affectiveIndexer, // Phase 18
      proceduralIndexer, // Phase 18
      conceptMapSnapshotter,
      conceptMapDivergenceIndexer,
    ],
    activity: activityRegistry,
  });

  return {
    conceptMapService,
    conceptMapConfiguratorId,
    indexerOrchestrator,
  };
}
