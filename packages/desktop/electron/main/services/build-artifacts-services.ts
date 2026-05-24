import { assignments } from "@praxis/artifacts/schema";
import { readEngineConfig } from "@praxis/core/config";
import type { PraxisDb } from "@praxis/core/db";
import {
  ArtifactsServiceImpl,
  AssignmentServiceImpl,
  CitationsServiceImpl,
  CourseCreateServiceImpl,
  CoursesServiceImpl,
  CourseStateReaderImpl,
  DocumentScopesServiceImpl,
  GatesServiceImpl,
  LessonAssessmentsServiceImpl,
  LessonsServiceImpl,
  MemoryServiceImpl,
  SqliteDraftStore,
} from "@praxis/core/services";
import type {
  AssignmentId,
  Engine,
  SessionId,
  SystemNoteOrigin,
  VisionCapability,
} from "@praxis/core/types";
import { createEngine } from "@praxis/engines";
import type { PyodideSymPyService } from "@praxis/tools/math";
import type { CodeSandboxImpl } from "@praxis/tools/sandbox";
import { eq } from "drizzle-orm";
import type { MainLogger } from "../logger.js";
import type { ElectronSafeStorageAdapter } from "../secret-storage.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * The function type used to notify a parent (tutor) session that a child
 * assignment session has submitted. Closed over by `AssignmentServiceImpl`
 * via the ref-cell pattern; must be wired by the orchestrator after
 * `SessionServiceImpl` is live.
 */
export type NotifyParentSessionFn = (input: {
  parentSessionId: SessionId;
  note: string;
  origin: SystemNoteOrigin;
}) => Promise<void>;

export interface ArtifactsServiceDeps {
  db: PraxisDb;
  log: MainLogger;
  secretStorage: ElectronSafeStorageAdapter;
  memoryService: MemoryServiceImpl;
  sympy: PyodideSymPyService;
  sandbox: CodeSandboxImpl;
}

export interface ArtifactsServices {
  documentScopesService: DocumentScopesServiceImpl;
  citationsService: CitationsServiceImpl;
  draftStore: SqliteDraftStore;
  bootstrapService: CourseCreateServiceImpl;
  assignmentService: AssignmentServiceImpl;
  artifactsService: ArtifactsServiceImpl;
  /** Engine resolvers — surfaced so Step 7 (indexers) can reuse them. */
  visionResolver: () => VisionCapability | undefined;
  bootstrapEngineResolver: () => Engine;
  /**
   * Mutable ref-cell setter — must be called by the orchestrator after
   * `SessionServiceImpl` is live. Calling `setNotifyParentSession(fn)`
   * closes the ref so that `assignmentService` starts forwarding parent
   * notifications to the live session service.
   */
  setNotifyParentSession: (fn: NotifyParentSessionFn) => void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Constructs the artifact-domain services: document scopes, citations, draft
 * store, course-create (bootstrap), assignment, and artifacts — together with
 * the three engine-resolver closures and the `notifyParentSession` ref-cell.
 *
 * Construction ordering requirement: `memoryService` and `sandbox`/`sympy`
 * must be live before calling this factory (memory → assignment → artifacts).
 *
 * The returned `setNotifyParentSession` setter must be called by the
 * orchestrator (`buildServices`) after `SessionServiceImpl` is constructed,
 * completing the Phase-16 ref-cell bridge.
 */
export function buildArtifactsServices(deps: ArtifactsServiceDeps): ArtifactsServices {
  const { db, log, secretStorage, memoryService, sympy, sandbox } = deps;

  // -------------------------------------------------------------------------
  // Engine resolvers — look up the active engine config at call time so
  // swaps take effect immediately without needing to restart services.
  // -------------------------------------------------------------------------

  // Vision resolver: returns undefined on error so callers degrade gracefully.
  const visionResolver = (): VisionCapability | undefined => {
    try {
      const engineConfig = readEngineConfig(db, secretStorage, log);
      const engine = createEngine({ config: engineConfig, deps: { log } });
      return engine.vision;
    } catch {
      return undefined;
    }
  };

  // Bootstrap engine resolver: used by CourseCreateServiceImpl and indexers.
  const bootstrapEngineResolver = (): Engine => {
    const engineConfig = readEngineConfig(db, secretStorage, log);
    return createEngine({ config: engineConfig, deps: { log } });
  };

  // Assignment engine resolver: dedicated instance with same semantics.
  const assignmentEngineResolver = (): Engine => {
    const engineConfig = readEngineConfig(db, secretStorage, log);
    return createEngine({ config: engineConfig, deps: { log } });
  };

  // -------------------------------------------------------------------------
  // Phase 16: notifyParentSession ref-cell.
  // AssignmentServiceImpl is constructed BEFORE SessionServiceImpl (ordering
  // constraint from Phase 9: assignment → artifacts → session). We bridge the
  // dependency with a mutable ref-cell that starts undefined and is pointed at
  // sessionService.notifySession after SessionServiceImpl is constructed.
  // -------------------------------------------------------------------------
  let notifyParentSessionRef: NotifyParentSessionFn | undefined;

  const setNotifyParentSession = (fn: NotifyParentSessionFn): void => {
    notifyParentSessionRef = fn;
  };

  // -------------------------------------------------------------------------
  // Service construction (ordering: memory → assignment → artifacts)
  // -------------------------------------------------------------------------

  // Phase 16: DocumentScopesServiceImpl — must be constructed before CourseCreateServiceImpl.
  const documentScopesService = new DocumentScopesServiceImpl({ db, log });

  // Citations service — record and list document passage citations.
  const citationsService = new CitationsServiceImpl({ db, log });

  // Shared durable draft store — one instance used by both CourseCreateServiceImpl
  // and RecommendationServiceImpl so they read from the same SQLite source.
  const draftStore = new SqliteDraftStore(db);

  const bootstrapService = new CourseCreateServiceImpl({
    db,
    log,
    engineResolver: bootstrapEngineResolver,
    documentScopes: documentScopesService,
    draftStore,
  });

  // Phase 8: AssignmentServiceImpl.
  // Phase 9: Must be constructed BEFORE ArtifactsServiceImpl (GradeReader injection).
  const assignmentService = new AssignmentServiceImpl({
    db,
    log,
    graderServices: {
      sympy,
      sandbox,
      engineResolver: assignmentEngineResolver,
    },
    // Read the assignment's kind column to resolve the submission mode.
    resolveSubmissionMode: (assignmentId: AssignmentId) => {
      const row = db.select().from(assignments).where(eq(assignments.id, assignmentId)).get();
      return (row?.kind as "quiz" | "homework" | "exam") ?? "quiz";
    },
    // Phase 16: forward notifications to sessionService once it's ready.
    notifyParentSession: (input) => notifyParentSessionRef?.(input) ?? Promise.resolve(),
  });

  // Domain decomposition: construct the five sub-services first, then
  // wire the ArtifactsServiceImpl facade.

  // Phase 1-decomp: CoursesServiceImpl (course reads, progress, documents, concepts).
  const coursesService = new CoursesServiceImpl({ db, log });

  // Phase 2-decomp: LessonsServiceImpl (lesson CRUD, units, upsert).
  const lessonsService = new LessonsServiceImpl({ db, log });

  // Phase 3-decomp: GatesServiceImpl (gate CRUD, evaluation, unlock events).
  // Phase 9: Constructed AFTER memoryService and assignmentService so they
  // can be injected as MasteryReader and GradeReader.
  const gatesService = new GatesServiceImpl({
    db,
    log,
    masteryReader: memoryService, // Phase 9: MasteryReader adapter
    gradeReader: assignmentService, // Phase 9: GradeReader adapter
  });

  // Phase 4-decomp: LessonAssessmentsServiceImpl (lesson assessment reads).
  const lessonAssessmentsService = new LessonAssessmentsServiceImpl({ db, log });

  // Phase 5-decomp: CourseStateReaderImpl (narrow read port for prompt composition).
  const courseStateReader = new CourseStateReaderImpl({
    db,
    log,
    courses: coursesService,
    lessons: lessonsService,
    gates: gatesService,
  });

  // Phase 6-decomp: ArtifactsServiceImpl as thin facade over the five sub-services.
  const artifactsService = new ArtifactsServiceImpl({
    courses: coursesService,
    lessons: lessonsService,
    gates: gatesService,
    lessonAssessments: lessonAssessmentsService,
    courseStateReader,
  });

  return {
    documentScopesService,
    citationsService,
    draftStore,
    bootstrapService,
    assignmentService,
    artifactsService,
    visionResolver,
    bootstrapEngineResolver,
    setNotifyParentSession,
  };
}
