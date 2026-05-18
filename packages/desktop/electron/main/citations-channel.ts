import type { DocumentId, Logger, SessionId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { z } from "zod";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * Register IPC handlers for the document citations service.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.citations.record          → DocumentCitationRecord
 *   praxis.citations.listByDocument  → DocumentCitationRecord[]
 */
export function registerCitationsHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  const recordSchema = z.object({
    documentId: z.string().min(1, "documentId"),
    citingSessionId: z.string().min(1, "citingSessionId"),
    citingTurnId: z.string().optional(),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().nonnegative(),
    citedText: z.string().optional(),
  });

  handle(
    "praxis.citations.record",
    handleEnvelope("praxis.citations.record", log, recordSchema, async (input) => {
      const result = await services.citations.record({
        documentId: brandId<"DocumentId">(input.documentId) as DocumentId,
        citingSessionId: brandId<"SessionId">(input.citingSessionId) as SessionId,
        ...(input.citingTurnId !== undefined && { citingTurnId: input.citingTurnId }),
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        ...(input.citedText !== undefined && { citedText: input.citedText }),
      });
      return {
        ...result,
        createdAt: result.createdAt.getTime(),
      };
    }),
  );

  const listByDocumentSchema = z.string().min(1, "documentId");

  handle(
    "praxis.citations.listByDocument",
    handleEnvelope(
      "praxis.citations.listByDocument",
      log,
      listByDocumentSchema,
      async (documentId) => {
        const rows = await services.citations.listByDocument(
          brandId<"DocumentId">(documentId) as DocumentId,
        );
        return rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.getTime(),
        }));
      },
    ),
  );
}
