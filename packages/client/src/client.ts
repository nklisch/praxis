import type { PraxisClient } from "@praxis/core/types";
import { ArtifactsClient } from "./services/artifacts-client.js";
import { AuthoringClient } from "./services/authoring-client.js";
import { ConfigClient } from "./services/config-client.js";
import { DocumentsClient } from "./services/documents-client.js";
import { IngestClient } from "./services/ingest-client.js";
import { MemoryClient } from "./services/memory-client.js";
import { SessionClient } from "./services/session-client.js";
import type { ClientTransport } from "./transport/types.js";

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
    ingest: new IngestClient(transport),
    documents: new DocumentsClient(transport),
  };
}
