import type { DocumentId, Logger, SessionId, TabId } from "@praxis/core/types";
import { z } from "zod";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";
import { getStudentId } from "./student-id.js";

/**
 * IPC handlers for the tabs service.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.tabs.listOpen
 *   praxis.tabs.list
 *   praxis.tabs.get
 *   praxis.tabs.open
 *   praxis.tabs.openDocument
 *   praxis.tabs.reopen
 *   praxis.tabs.close
 *   praxis.tabs.touch
 *   praxis.tabs.rename
 */
export function registerTabsHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  const tabIdSchema = z.string().min(1, "tabId");

  handle(
    "praxis.tabs.listOpen",
    wrapEnvelope("praxis.tabs.listOpen", log, async () => {
      const studentId = getStudentId(services);
      return services.tabs.listOpen(studentId);
    }),
  );

  handle(
    "praxis.tabs.list",
    handleEnvelope(
      "praxis.tabs.list",
      log,
      z
        .object({
          limit: z.number().int().positive().optional(),
          includeClosed: z.boolean().optional(),
        })
        .optional(),
      async (opts) => {
        const studentId = getStudentId(services);
        return services.tabs.list(
          studentId,
          opts !== undefined
            ? {
                ...(opts.limit !== undefined && { limit: opts.limit }),
                ...(opts.includeClosed !== undefined && { includeClosed: opts.includeClosed }),
              }
            : undefined,
        );
      },
    ),
  );

  handle(
    "praxis.tabs.get",
    handleEnvelope("praxis.tabs.get", log, tabIdSchema, async (tabId) => {
      return services.tabs.get(tabId as TabId);
    }),
  );

  handle(
    "praxis.tabs.open",
    handleEnvelope(
      "praxis.tabs.open",
      log,
      z.object({
        sessionId: z.string().min(1, "sessionId"),
        courseTitle: z.string().optional(),
      }),
      async (opts) => {
        const studentId = getStudentId(services);
        return services.tabs.open({
          studentId,
          sessionId: opts.sessionId as SessionId,
          ...(opts.courseTitle !== undefined && { courseTitle: opts.courseTitle }),
        });
      },
    ),
  );

  handle(
    "praxis.tabs.openDocument",
    handleEnvelope(
      "praxis.tabs.openDocument",
      log,
      z.object({
        documentId: z.string().min(1, "documentId"),
        title: z.string().min(1, "title"),
      }),
      async (opts) => {
        const studentId = getStudentId(services);
        return services.tabs.openDocument({
          studentId,
          documentId: opts.documentId as DocumentId,
          title: opts.title,
        });
      },
    ),
  );

  handle(
    "praxis.tabs.reopen",
    handleEnvelope("praxis.tabs.reopen", log, tabIdSchema, async (tabId) => {
      return services.tabs.reopen(tabId as TabId);
    }),
  );

  handle(
    "praxis.tabs.close",
    handleEnvelope("praxis.tabs.close", log, tabIdSchema, async (tabId) => {
      return services.tabs.close(tabId as TabId);
    }),
  );

  handle(
    "praxis.tabs.touch",
    handleEnvelope("praxis.tabs.touch", log, tabIdSchema, async (tabId) => {
      return services.tabs.touch(tabId as TabId);
    }),
  );

  handle(
    "praxis.tabs.rename",
    handleEnvelope(
      "praxis.tabs.rename",
      log,
      z.object({
        tabId: z.string().min(1, "tabId"),
        title: z.string().min(1, "title"),
      }),
      async (opts) => {
        return services.tabs.rename(opts.tabId as TabId, opts.title);
      },
    ),
  );
}
