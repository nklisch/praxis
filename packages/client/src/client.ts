import type { PraxisClient } from "@praxis/core/types";
import { ArtifactsClient } from "./services/artifacts-client.js";
import { AuthoringClient } from "./services/authoring-client.js";
import { ConfigClient } from "./services/config-client.js";
import { MemoryClient } from "./services/memory-client.js";
import { SessionClient } from "./services/session-client.js";
import type { ClientTransport } from "./transport/types.js";

/**
 * Phase 5 stub — IngestionClient and DocumentsClient will be wired by Agent 2/3.
 * Stubbed here so `PraxisClient` satisfies the type contract.
 */
const notYetImplemented = (method: string) => (): never => {
  throw new Error(`PraxisClient.${method} is not yet implemented (Phase 5 Agent 2/3)`);
};

const ingestionStub: PraxisClient["ingest"] = {
  pickFile: notYetImplemented("ingest.pickFile"),
  // biome-ignore lint/suspicious/noExplicitAny: Phase 5 stub — Agent 2/3 wires real impl
  start: notYetImplemented("ingest.start") as any,
  isAvailable: () => false,
};

const documentsStub: PraxisClient["documents"] = {
  list: notYetImplemented("documents.list"),
  delete: notYetImplemented("documents.delete"),
  pageImage: notYetImplemented("documents.pageImage"),
};

/**
 * Create a fully-typed PraxisClient backed by the given transport.
 * The transport handles the actual IPC / network communication.
 * All service methods are thin wrappers that delegate to transport.invoke / transport.stream.
 */
export function createPraxisClient(transport: ClientTransport): PraxisClient {
  return {
    session: new SessionClient(transport),
    artifacts: new ArtifactsClient(),
    author: new AuthoringClient(),
    memory: new MemoryClient(),
    config: new ConfigClient(transport),
    ingest: ingestionStub,
    documents: documentsStub,
  };
}
