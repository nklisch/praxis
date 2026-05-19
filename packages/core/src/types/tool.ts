import type { z } from "zod";
import type { ActivityRegistry } from "./activity.js";
import type { ArtifactsService, AssignmentService } from "./artifacts.js";
import type { AuthoringService } from "./authoring-service.js";
import type { Logger } from "./common.js";
import type { CourseCreateService } from "./course-create-service.js";
import type { CourseStateReader } from "./course-state.js";
import type { DocumentScopesService } from "./document-scopes.js";
import type { Engine } from "./engine.js";
import type { FlashcardsService, FsrsScheduler } from "./flashcards.js";
import type { AssignmentId, CourseId, DocumentId, SessionId, StudentId } from "./ids.js";
import type { LockService } from "./lock-service.js";
import type { IndexerOrchestrator, MemoryService } from "./memory.js";
import type { NotesService } from "./notes.js";
import type { PackImportService } from "./pack-import-service.js";
import type { PedagogyPackService } from "./pedagogy.js";
import type { QuickCheckService } from "./quick-check.js";
import type { DocumentsReader, EmbeddingService, FtsStore, VectorStore } from "./rag-service.js";
import type { CodeSandbox } from "./sandbox-service.js";
import type { SketchService } from "./sketches.js";
import type { SubAgentRegistry } from "./subagent.js";
import type { SymPyService } from "./sympy-service.js";
import type { VisionService } from "./vision.js";

export type EffectKind =
  | "memory.write"
  | "artifact.mutate"
  | "gate.evaluate"
  | "external.network"
  | "external.code-exec"
  | "none";

export interface ToolDefinition<I extends z.ZodType, O extends z.ZodType> {
  name: string;
  description: string;
  input: I;
  output: O;
  tier: "deterministic" | "grounded" | "model-derived";
  effects: ReadonlyArray<EffectKind>;
  handler(args: z.infer<I>, ctx: ToolContext): Promise<z.infer<O>>;
}

/**
 * Service handles available to tool handlers. These are placeholders in
 * Phase 1 — concrete service implementations land in subsequent phases.
 */
export interface ToolContext {
  studentId: StudentId;
  sessionId: SessionId;
  /** Phase 6: when the active session was started with a courseId, propagated here. */
  courseId?: CourseId;
  /**
   * Phase 8: when the active session is bound to an assignment, propagated here.
   * Agent 2 wires this from the session row's assignmentId column.
   */
  assignmentId?: AssignmentId;
  /**
   * Phase 16: pre-computed list of document ids attached to `courseId`.
   * Populated only when `courseId` is set; tools that scope to course
   * documents (e.g., `retrieve_from_documents`) consume this directly to
   * avoid an extra DB call per dispatch. Empty array means "no documents
   * attached yet" — tools should return empty results, not fall back to
   * library scope.
   */
  courseDocumentIds?: DocumentId[];
  /**
   * Phase 16: present only inside the drafter agent's isolated session.
   * The draft-mutation tools read it to know which draft to mutate. Outside
   * the drafter, this is undefined.
   */
  draftId?: string;
  /**
   * Agent-transparency (feature-agent-transparency-ux): the engine-emitted
   * tool_call.callId for this invocation. Populated by
   * `InProcessToolRegistry.dispatch(name, args, { callId })` when the engine
   * adapter passes the per-request correlation id. Tools that spawn sub-agents
   * (e.g., `course.start_drafting`) use this as their `parentCallId` when
   * registering on `SubAgentRegistry` so the UI can subscribe to the right stream.
   * Absent when dispatched from test stubs that don't supply a callId.
   */
  callId?: string;
  /**
   * AbortSignal for the current engine turn. Populated by
   * `InProcessToolRegistry.dispatch(name, args, { signal })` when the engine
   * adapter passes the per-turn signal. Tools should check `signal?.aborted`
   * at entry and periodically during long loops; sub-agent-spawning tools
   * pass it into the sub-agent's engine session so cancellation propagates
   * recursively. Absent when dispatched from test stubs that don't supply a
   * signal.
   */
  signal?: AbortSignal;
  /**
   * Phase 16 (course-create-session-scoped-attachment): set by sub-agent harnesses
   * to the PARENT session's id. For top-level sessions this is undefined.
   *
   * Threading chain:
   *   tutor session S1 invokes start_drafting (ctx.sessionId === S1)
   *   → runConceptDrafter sets drafterContext.parentSessionId = S1
   *   → drafter sub-agent tools (draft_init, list_library_documents) read
   *     ctx.parentSessionId to operate on the parent session's scope.
   *
   * Any new sub-agent harness should propagate this field from the parent ctx
   * to preserve the session-scope chain. See the sub-agent-context-threading
   * pattern for details.
   */
  parentSessionId?: SessionId;
  services: ToolServices;
  log: Logger;
}

export interface ToolServices {
  /** Phase 7: concretized from unknown. */
  memory: MemoryService;
  /** Phase 6: concretized from unknown. */
  artifacts: ArtifactsService;
  vectorStore: VectorStore; // ← Phase 5
  ftsStore: FtsStore; // ← Phase 5
  sandbox: CodeSandbox; // ← Phase 4
  sympy: SymPyService; // ← Phase 4
  embeddings: EmbeddingService; // ← Phase 5
  documents: DocumentsReader; // ← Phase 5
  /** Phase 6: course-create draft management. */
  bootstrap: CourseCreateService;
  /** Phase 6: narrow read-only course state for tools and brief composition. */
  courseState: CourseStateReader;
  /**
   * Phase 7: used by active-path tools to schedule indexer re-runs after a tool-driven write.
   * Optional to keep tests that don't wire indexers working.
   */
  indexerOrchestrator?: IndexerOrchestrator;
  /** Phase 8: assignment create/submit/read — server-side. */
  assignments: AssignmentService;
  /** Phase 10: pack import + listing — canonical curriculum packs. */
  packs: PackImportService;
  /** Phase 18: pedagogy pack read-only service. */
  pedagogyPack: PedagogyPackService;
  /** Phase 11: local lock code gate. */
  lock: LockService;
  /** Phase 11: configurator-driven authoring + memory writes. */
  authoring: AuthoringService;
  /** Phase 12: notes management — create, update, list, delete. */
  notes: NotesService;
  /** Phase 12: flashcard management + FSRS review. */
  flashcards: FlashcardsService;
  /** Phase 12: FSRS scheduler — used by FlashcardsServiceImpl and flashcard.review_next tool. */
  fsrsScheduler: FsrsScheduler;
  /** Phase 15a: sketch storage + retrieval — used by sketch.read and grade_math sketch case. */
  sketches?: SketchService;
  /** Phase 15a: vision capability wrapper — used by grade_math sketch case to OCR drawings. */
  vision?: VisionService;
  /** Phase 16: polymorphic scope ↔ document attachment management. */
  documentScopes: DocumentScopesService;
  /**
   * Phase 16: resolves the user's currently configured engine at call time.
   * Used by tools that spawn isolated agent sessions (e.g., start_drafting,
   * rubric grader). Same lazy-resolver pattern as visionResolver.
   */
  engineResolver: () => Engine;
  /**
   * Resolves user-tunable course-create config (currently just `maxSteps` —
   * the drafter's tool-call budget). Read at call time so UI changes
   * take effect on the next drafting run without a restart. Used by
   * `course.start_drafting`. Optional so test stubs that don't exercise
   * the course-create path don't need to wire it.
   */
  courseCreateConfigResolver?: () => { maxSteps: number };
  /**
   * Activity registry for ambient progress reporting via the activity rail.
   * Optional so tools that don't need it and test stubs stay simple.
   * Wired in session-service.ts from ServiceDeps.activity.
   */
  activity?: ActivityRegistry;
  /**
   * Sub-agent transparency registry. Optional so tools that don't spawn
   * sub-agents and test stubs that don't wire it stay simple.
   * Wired in session-service.ts from ServiceDeps.subAgent.
   */
  subAgent?: SubAgentRegistry;
  /**
   * Phase 17: human-in-the-loop dispatch for quick_check.* tools.
   * Optional so existing tool stubs and tests don't need to wire it.
   */
  quickCheck?: QuickCheckService;
}
