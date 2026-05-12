import type { PraxisClient } from "@praxis/core/types";
import { ActivityClient } from "./services/activity-client.js";
import { ArtifactsClient } from "./services/artifacts-client.js";
import { AssignmentsClient } from "./services/assignments-client.js";
import { AuthoringClientImpl } from "./services/authoring-client.js";
import { ClaudeAuthClient } from "./services/claude-auth-client.js";
import { ConceptMapClient } from "./services/concept-map-client.js";
import { ConfigClient } from "./services/config-client.js";
import { CourseDocumentsClient } from "./services/course-documents-client.js";
import { DocumentsClient } from "./services/documents-client.js";
import { DraftsClient } from "./services/drafts-client.js";
import { FlashcardsClient } from "./services/flashcards-client.js";
import { IngestClient } from "./services/ingest-client.js";
import { LockClientImpl } from "./services/lock-client.js";
import { MemoryClient } from "./services/memory-client.js";
import { NotesClient } from "./services/notes-client.js";
import { PacksClientImpl } from "./services/packs-client.js";
import { QuickCheckClient } from "./services/quick-check-client.js";
import { SessionClient } from "./services/session-client.js";
import { ShellClientImpl } from "./services/shell-client.js";
import { SketchClient } from "./services/sketch-client.js";
import { SubAgentClient } from "./services/sub-agent-client.js";
import { TabsClient } from "./services/tabs-client.js";
import { UpdateClient } from "./services/update-client.js";
import type { ClientTransport } from "./transport/types.js";

/**
 * Create a fully-typed PraxisClient backed by the given transport.
 * The transport handles the actual IPC / network communication.
 * All service methods are thin wrappers that delegate to transport.invoke / transport.stream.
 */
export function createPraxisClient(transport: ClientTransport): PraxisClient {
  return {
    session: new SessionClient(transport),
    artifacts: new ArtifactsClient(transport),
    author: new AuthoringClientImpl(transport), // ← Phase 11: real impl (replaces stub)
    memory: new MemoryClient(transport),
    config: new ConfigClient(transport),
    ingest: new IngestClient(transport),
    documents: new DocumentsClient(transport),
    assignments: new AssignmentsClient(transport), // ← Phase 8
    packs: new PacksClientImpl(transport), // ← Phase 10
    lock: new LockClientImpl(transport), // ← Phase 11: real impl
    notes: new NotesClient(transport), // ← Phase 12
    flashcards: new FlashcardsClient(transport), // ← Phase 12
    claudeAuth: new ClaudeAuthClient(transport),
    shell: new ShellClientImpl(transport),
    tabs: new TabsClient(transport), // ← Phase 14
    sketches: new SketchClient(transport), // ← Phase 15a
    conceptMaps: new ConceptMapClient(transport), // ← Phase 15b
    courseDocuments: new CourseDocumentsClient(transport), // ← Phase 16
    activity: new ActivityClient(transport),
    drafts: new DraftsClient(transport),
    quickCheck: new QuickCheckClient(transport), // ← Phase 17
    update: new UpdateClient(transport), // ← Phase 19
    subAgent: new SubAgentClient(transport),
  };
}
