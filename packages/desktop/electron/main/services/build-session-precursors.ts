import type { PraxisDb } from "@praxis/core/db";
import {
  AuthoringServiceImpl,
  ConceptMapServiceImpl,
  PromptCustomizationServiceImpl,
  SessionPromotionRegistryImpl,
  SessionServiceImpl,
  getOrCreateDefaultStudentId,
} from "@praxis/core/services";
import type { ArtifactsServiceImpl, MemoryServiceImpl } from "@praxis/core/services";
import type { ConfiguratorId, StudentId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import type { MainLogger } from "../logger.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SessionPrecursorDeps {
  db: PraxisDb;
  log: MainLogger;
  artifactsService: ArtifactsServiceImpl;
  memoryService: MemoryServiceImpl;
  conceptMapService: ConceptMapServiceImpl;
  conceptMapConfiguratorId: () => ConfiguratorId;
}

export interface SessionPrecursorServices {
  sessionPromotionRegistry: SessionPromotionRegistryImpl;
  /**
   * Call after `SessionServiceImpl` is constructed to close the ref-cell.
   * The registry's `engineSessionManager` thunk resolves from this point on.
   * Must be called before `sessionSweepIndexer.start()`.
   */
  setSessionServiceRef: (svc: SessionServiceImpl) => void;
  promptCustomizationService: PromptCustomizationServiceImpl;
  authoringService: AuthoringServiceImpl;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Constructs the services that must exist before `SessionServiceImpl` is
 * instantiated — the session promotion registry (with its ref-cell), the
 * prompt customization service, and the authoring service.
 *
 * Ref-cell pattern: `sessionServiceRef` is a module-internal `let` declared
 * inside this factory body. The registry's `engineSessionManager` thunk closes
 * over it and defers resolution until after `SessionServiceImpl` is live.
 * The orchestrator (`buildServices`) calls `setSessionServiceRef(sessionService)`
 * immediately after constructing `SessionServiceImpl`, before starting the
 * sweep indexer.
 *
 * Construction ordering requirements:
 * - `artifactsService` must be live (step 6).
 * - `memoryService` must be live (step 6).
 * - `conceptMapService` must be live (step 7 / indexer bundle).
 */
export function buildSessionPrecursors(deps: SessionPrecursorDeps): SessionPrecursorServices {
  const { db, log, artifactsService, memoryService, conceptMapService, conceptMapConfiguratorId } =
    deps;

  // -------------------------------------------------------------------------
  // Session promotion registry ref-cell.
  // SessionPromotionRegistryImpl is constructed BEFORE SessionServiceImpl
  // (ordering: promotion registry → session service). We bridge the dependency
  // with a mutable ref-cell that starts undefined and is filled in by the
  // orchestrator after SessionServiceImpl is live. The thunk is only called
  // from discard() or promote(), which happen after buildServices() returns.
  // -------------------------------------------------------------------------
  let sessionServiceRef: SessionServiceImpl | undefined;

  const setSessionServiceRef = (svc: SessionServiceImpl): void => {
    sessionServiceRef = svc;
  };

  // Session promotion registry — in-memory map of sessions opened but not yet
  // persisted to the `sessions` table.
  const sessionPromotionRegistry = new SessionPromotionRegistryImpl({
    db,
    log,
    engineSessionManager: () => {
      // Safety: the thunk is only called from discard() or promote(), which
      // happen after buildServices() returns and sessionService is live.
      if (!sessionServiceRef) {
        throw new Error("SessionPromotionRegistry: sessionService not yet initialised");
      }
      return sessionServiceRef.engineManager;
    },
  });

  // Prompt customization service — global fragment + per-mode appends.
  // Single dep: db. Constructed here because AuthoringServiceImpl needs it.
  const promptCustomizationService = new PromptCustomizationServiceImpl({ db });

  // Phase 11: AuthoringServiceImpl — orchestration layer for configurator
  // writes. Depends on artifacts, memory, conceptMaps, and promptCustomization,
  // all of which are in scope from factory parameters or local construction.
  const authoringService = new AuthoringServiceImpl({
    db,
    log,
    artifacts: artifactsService,
    memory: memoryService,
    // v1: single configurator, always "default".
    configuratorId: conceptMapConfiguratorId,
    // v1: resolve the default student at call time (lazy, so no DB read at
    // construction and no ordering dependency on student-id creation).
    studentId: (): StudentId => brandId<"StudentId">(getOrCreateDefaultStudentId(db)),
    promptCustomization: promptCustomizationService,
    conceptMaps: conceptMapService,
  });

  return {
    sessionPromotionRegistry,
    setSessionServiceRef,
    promptCustomizationService,
    authoringService,
  };
}
