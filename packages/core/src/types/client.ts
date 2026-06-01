import type { ClaudeAuthService } from "../services/claude-auth.js";
import type { ActivityClient } from "./activity.js";
import type { ArtifactsClientSurface, PacksClient } from "./artifacts.js";
import type { AssignmentsClient } from "./assignments-client.js";
import type { AuthoringClient } from "./authoring-client.js";
import type { CitationsClientApi } from "./citation.js";
import type { MemoryService } from "./client-memory.js";
import type { ConceptMapClientApi } from "./concept-map-service.js";
import type { ConfigService } from "./config-service.js";
import type { DocumentScopesClientApi } from "./document-scopes.js";
import type { DraftStreamClient } from "./draft-stream.js";
import type { FlashcardsClient } from "./flashcards.js";
import type { DocumentsClient, IngestionClient } from "./ingestion.js";
import type { LibraryClientApi } from "./library-service.js";
import type { LockClient } from "./lock-service.js";
import type { LogClientApi } from "./log-client.js";
import type { NotesClient } from "./notes.js";
import type { ProgressClientApi } from "./progress.js";
import type { QuickCheckClientApi } from "./quick-check.js";
import type { RecommendationsClientApi } from "./recommendation.js";
import type { SessionService } from "./session-client.js";
import type { ShellClient } from "./shell-client.js";
import type { SketchClientApi } from "./sketches.js";
import type { SubAgentClientApi } from "./subagent.js";
import type { TabsClientApi } from "./tabs.js";
import type { UpdateClientApi } from "./update-client.js";

export interface PraxisClient {
  session: SessionService;
  artifacts: ArtifactsClientSurface;
  author: AuthoringClient;
  memory: MemoryService;
  config: ConfigService;
  ingest: IngestionClient;
  documents: DocumentsClient;
  /** Phase 8: assignment lifecycle — create, submit, read grade. */
  assignments: AssignmentsClient;
  /** Phase 10: canonical knowledge packs — list, import. */
  packs: PacksClient;
  /** Phase 11: local lock code gate. Optional until Agent 2 wires the IPC handler. */
  lock?: LockClient;
  /** Phase 12: notes management — create, update, list, delete, get. */
  notes: NotesClient;
  /** Phase 12: flashcard management + FSRS review. */
  flashcards: FlashcardsClient;
  /** Claude CLI authentication — status check and login flow. */
  claudeAuth: ClaudeAuthService;
  /** Shell helpers — open URLs in the system browser. */
  shell: ShellClient;
  /** Phase 14: tab strip — open, close, rename, list. */
  tabs: TabsClientApi;
  /** Phase 15a: sketch storage + retrieval (renderer-side; uses Blob not Buffer). */
  sketches: SketchClientApi;
  /** Phase 15b: concept map CRUD + versioning. */
  conceptMaps: ConceptMapClientApi;
  /** Phase 16: polymorphic scope ↔ document attachment — attach, detach, list. */
  documentScopes: DocumentScopesClientApi;
  /** Activity rail — subscribe to ambient progress events from long-running work. */
  activity: ActivityClient;
  /**
   * Course-create mode live draft stream. Yields snapshot + per-mutation events as
   * the drafter builds a course outline. The course-create tab body
   * subscribes to render the right-pane outline live.
   */
  drafts: DraftStreamClient;
  /** Phase 17: quick check — subscribe to inline question events; resolve student answers. */
  quickCheck: QuickCheckClientApi;
  /** Phase 19: manual-download update check (env-var-gated; no-op when not configured). */
  update: UpdateClientApi;
  /** Sub-agent transparency — subscribe to step-level events from sub-agent runs. */
  subAgent: SubAgentClientApi;
  /** Workbench recommendation engine — priority-ordered "what's next" queue. */
  recommendations: RecommendationsClientApi;
  /** Document citations — record and list per-document passage citations. */
  citations: CitationsClientApi;
  /** Catalogue search + saved filters across notes and flashcards. */
  library: LibraryClientApi;
  /** Per-course progress aggregator for the /progress route. */
  progress: ProgressClientApi;
  /** Renderer-to-main structured log sink. Best-effort and non-blocking. */
  log: LogClientApi;
}
