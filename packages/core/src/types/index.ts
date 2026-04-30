export type * from "./artifacts.js";
export type * from "./gate.js";
export type * from "./citation.js";
// client.ts: Note: MemoryService is intentionally NOT re-exported from here.
// The client-side MemoryService (no studentId params) lives in ./client.ts and is
// imported directly by client code and MemoryClient. The server-side MemoryService
// (with studentId params) is exported from ./tool.ts via the tool.ts wildcard below.
// Re-export client MemoryService under a distinct alias so client code can import it.
export type {
  ArtifactsClientSurface,
  AssignmentsClient,
  AuthoringService,
  BootstrapOpts,
  ConfigService,
  CreateCourseInput,
  DocumentSummary,
  DocumentsClient,
  EngineConfigSnapshot,
  FileRef,
  IngestionClient,
  MemoryService as MemoryClientService,
  PraxisClient,
  ProgressSnapshot,
  SessionHandle,
  SessionService,
  SessionSummary,
} from "./client.js";
export type * from "./common.js";
export type * from "./concept-graph.js";
export type * from "./conversation.js";
export type * from "./engine.js";
export { engineError } from "./engine.js"; // runtime helper — not re-exported by `export type *`
export * from "./ids.js"; // exports `brandId` runtime helper
export type * from "./ingestion.js";
// memory.ts: `export *` (not `export type *`) so MASTERY_SIGNAL_KINDS const is exported as a runtime value.
export * from "./memory.js";
export type * from "./mode.js";
export type * from "./pedagogy.js";
// tool.ts: MemoryService here is the server-side interface (with studentId params).
export type * from "./tool.js";
