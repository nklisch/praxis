import type { DocumentId, DocumentScope, DocumentScopeSource, Logger } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { getStudentId } from "./student-id.js";

/**
 * Register IPC handlers for the polymorphic scope ↔ document attachment service.
 *
 * All channels are invoke-only (non-streaming):
 *   praxis.documentScopes.listOrphaned          → DocumentScopeAttachment[]
 *   praxis.documentScopes.listForScope          → DocumentScopeAttachment[]
 *   praxis.documentScopes.attach                → { attached: boolean }
 *   praxis.documentScopes.detach                → { detached: boolean }
 *   praxis.documentScopes.listScopesForDocument → DocumentScope[]
 */
export function registerDocumentScopesHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  handle(
    "praxis.documentScopes.listOrphaned",
    wrapEnvelope("praxis.documentScopes.listOrphaned", log, async () => {
      const studentId = getStudentId(services);
      return services.documentScopes.listOrphaned(studentId);
    }),
  );

  handle(
    "praxis.documentScopes.listForScope",
    wrapEnvelope(
      "praxis.documentScopes.listForScope",
      log,
      async (_event: unknown, scope: DocumentScope) => {
        return services.documentScopes.listForScopeDetailed(scope);
      },
    ),
  );

  handle(
    "praxis.documentScopes.attach",
    wrapEnvelope(
      "praxis.documentScopes.attach",
      log,
      async (
        _event: unknown,
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
    ),
  );

  handle(
    "praxis.documentScopes.detach",
    wrapEnvelope(
      "praxis.documentScopes.detach",
      log,
      async (_event: unknown, input: { scope: DocumentScope; documentId: string }) => {
        return services.documentScopes.detach({
          scope: input.scope,
          documentId: brandId<"DocumentId">(input.documentId) as DocumentId,
        });
      },
    ),
  );

  handle(
    "praxis.documentScopes.listScopesForDocument",
    wrapEnvelope(
      "praxis.documentScopes.listScopesForDocument",
      log,
      async (_event: unknown, documentId: string) => {
        return services.documentScopes.listScopesForDocument(
          brandId<"DocumentId">(documentId) as DocumentId,
        );
      },
    ),
  );
}
