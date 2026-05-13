import type { DocumentId, DocumentScope, DocumentScopeSource, Logger } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * Register IPC handlers for the polymorphic scope ↔ document attachment service.
 *
 * All channels are invoke-only (non-streaming):
 *   praxis.documentScopes.listForScope   → DocumentScopeAttachment[]
 *   praxis.documentScopes.attach         → { attached: boolean }
 *   praxis.documentScopes.detach         → { detached: boolean }
 */
export function registerDocumentScopesHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  handle("praxis.documentScopes.listForScope", async (_event, scope: DocumentScope) => {
    return services.documentScopes.listForScopeDetailed(scope);
  });

  handle(
    "praxis.documentScopes.attach",
    async (
      _event,
      input: {
        scope: DocumentScope;
        documentId: string;
        source?: DocumentScopeSource;
      },
    ) => {
      return services.documentScopes.attach({
        scope: input.scope,
        documentId: brandId<"DocumentId">(input.documentId) as DocumentId,
        source: input.source ?? "manual",
      });
    },
  );

  handle(
    "praxis.documentScopes.detach",
    async (_event, input: { scope: DocumentScope; documentId: string }) => {
      return services.documentScopes.detach({
        scope: input.scope,
        documentId: brandId<"DocumentId">(input.documentId) as DocumentId,
      });
    },
  );
}
