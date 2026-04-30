import type { PraxisClient } from "@praxis/core/types";
import { ArtifactsClient } from "./services/artifacts-client.js";
import { AssignmentsClient } from "./services/assignments-client.js";
import { AuthoringClientImpl } from "./services/authoring-client.js";
import { ConfigClient } from "./services/config-client.js";
import { DocumentsClient } from "./services/documents-client.js";
import { IngestClient } from "./services/ingest-client.js";
import { MemoryClient } from "./services/memory-client.js";
import { PacksClientImpl } from "./services/packs-client.js";
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
    artifacts: new ArtifactsClient(transport),
    author: new AuthoringClientImpl(),
    memory: new MemoryClient(transport),
    config: new ConfigClient(transport),
    ingest: new IngestClient(transport),
    documents: new DocumentsClient(transport),
    assignments: new AssignmentsClient(transport), // ← Phase 8
    packs: new PacksClientImpl(transport), // ← Phase 10
    // Phase 11: lock client — Agent 2 wires the real impl; stub rejects until then.
    lock: {
      isSet: () => Promise.reject(new Error("LockClient not implemented")),
      isUnlocked: () => Promise.reject(new Error("LockClient not implemented")),
      setLockCode: () => Promise.reject(new Error("LockClient not implemented")),
      unlock: () => Promise.reject(new Error("LockClient not implemented")),
      lock: () => Promise.reject(new Error("LockClient not implemented")),
      clearLock: () => Promise.reject(new Error("LockClient not implemented")),
    },
  };
}
