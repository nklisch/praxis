import type { Logger } from "@praxis/core/types";
import { z } from "zod";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * IPC handlers for the documents service.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.documents.list       → Document[]
 *   praxis.documents.get        → Document
 *   praxis.documents.delete     → void
 *   praxis.documents.pageImage  → base64 string | null
 */
export function registerDocumentsHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  handle(
    "praxis.documents.list",
    wrapEnvelope("praxis.documents.list", log, async () => services.documents.list()),
  );

  handle(
    "praxis.documents.get",
    handleEnvelope(
      "praxis.documents.get",
      log,
      z.string().min(1, "documentId"),
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      async (documentId) => services.documents.get(documentId as any),
    ),
  );

  handle(
    "praxis.documents.delete",
    handleEnvelope(
      "praxis.documents.delete",
      log,
      z.string().min(1, "documentId"),
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      async (documentId) => services.documents.delete(documentId as any),
    ),
  );

  const pageImageSchema = z.object({
    documentId: z.string().min(1, "documentId"),
    page: z.number().int().nonnegative(),
  });

  handle(
    "praxis.documents.pageImage",
    handleEnvelope("praxis.documents.pageImage", log, pageImageSchema, async (payload) => {
      const buffer = await services.documents.pageImage(payload);
      // Encode as base64 for IPC transport — Electron IPC can't send raw Buffers reliably
      return buffer ? buffer.toString("base64") : null;
    }),
  );
}
