import type { Logger } from "@praxis/core/types";
import { ipcMain } from "electron";
import { registerActivityHandlers } from "./activity-channel.js";
import { registerArtifactsHandlers } from "./artifacts-channel.js";
import { registerAssignmentsHandlers } from "./assignments-channel.js";
import { registerAuthHandlers } from "./auth-channel.js";
import { registerAuthorHandlers } from "./author-channel.js";
import { registerCitationsHandlers } from "./citations-channel.js";
import { registerConceptMapsHandlers } from "./concept-maps-channel.js";
import { registerConfigHandlers } from "./config-channel.js";
import { registerCourseCreateDraftsHandlers } from "./course-create-drafts-channel.js";
import { registerDocumentScopesHandlers } from "./document-scopes-channel.js";
import { registerDocumentsHandlers } from "./documents-channel.js";
import { registerFlashcardsHandlers } from "./flashcards-channel.js";
import { registerIngestHandlers } from "./ingest-channel.js";
import { registerLibraryHandlers } from "./library-channel.js";
import { registerLockHandlers } from "./lock-channel.js";
import { registerMemoryHandlers } from "./memory-channel.js";
import { registerNotesHandlers } from "./notes-channel.js";
import { registerPacksHandlers } from "./packs-channel.js";
import { registerQuickCheckHandlers } from "./quick-check-channel.js";
import { registerRecommendationsHandlers } from "./recommendations-channel.js";
import type { Services } from "./services.js";
import { registerSessionHandlers } from "./session-channel.js";
import { registerShellHandlers } from "./shell-channel.js";
import { registerSketchesHandlers } from "./sketches-channel.js";
import { registerSubAgentHandlers } from "./subagent-channel.js";
import { registerTabsHandlers } from "./tabs-channel.js";
import { registerUpdateHandlers } from "./update-channel.js";

/**
 * Register all IPC handlers for the Praxis services.
 *
 * Stream channel naming convention (matches IpcTransport in @praxis/client):
 *   invoke:  praxis.session.send.start  (with streamId as first arg)
 *   events:  praxis.session.send.events.<streamId>
 *   cancel:  praxis.session.send.cancel
 *
 *   invoke:  praxis.ingest.start (with streamId as first arg)
 *   events:  praxis.ingest.events.<streamId>
 *   cancel:  praxis.ingest.cancel
 */
export interface IpcHandlerResult {
  /** Unregister all handlers and abort all in-flight streams. */
  cleanup: () => void;
  /** Map of streamId → AbortController for all active streaming IPC channels.
   *  Exposed so the before-quit handler can abort them during shutdown. */
  activeAbortControllers: Map<string, AbortController>;
}

export function registerIpcHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  log: Logger,
): IpcHandlerResult {
  const activeAbortControllers = new Map<string, AbortController>();

  // ── Session (streaming + non-streaming) ──────────────────────────────────

  registerSessionHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Config ───────────────────────────────────────────────────────────────

  registerConfigHandlers(services, log);

  // ── Ingestion (streamed + non-streamed) ──────────────────────────────────

  registerIngestHandlers(
    services,
    webContentsGetter,
    services.ingestorRegistry,
    activeAbortControllers,
    log,
  );

  // ── Artifacts (read-only) ────────────────────────────────────────────────

  registerArtifactsHandlers(services, log);

  // ── Memory ───────────────────────────────────────────────────────────────────

  registerMemoryHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Assignments ──────────────────────────────────────────────────────────────

  registerAssignmentsHandlers(services, log);

  // ── Phase 11: Author ─────────────────────────────────────────────────────────

  registerAuthorHandlers(services, log);

  // ── Phase 12: Notes ──────────────────────────────────────────────────────────

  registerNotesHandlers(services, log);

  // ── Phase 12: Flashcards ─────────────────────────────────────────────────────

  registerFlashcardsHandlers(services, log);

  // ── Phase 14: Tabs ───────────────────────────────────────────────────────────

  registerTabsHandlers(services, log);

  // ── Phase 15a: Sketches ──────────────────────────────────────────────────────

  registerSketchesHandlers(services, log);

  // ── Phase 15b: Concept maps ──────────────────────────────────────────────────

  registerConceptMapsHandlers(services, log);

  // ── Activity rail ─────────────────────────────────────────────────────────────

  registerActivityHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Sub-agent transparency ─────────────────────────────────────────────────────

  registerSubAgentHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Bootstrap-mode draft stream ──────────────────────────────────────────────

  registerCourseCreateDraftsHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Phase 17: QuickCheck ──────────────────────────────────────────────────────

  registerQuickCheckHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Document citations ────────────────────────────────────────────────────────

  registerCitationsHandlers(services, log);

  // ── Phase 16: Polymorphic scope ↔ document attachments ───────────────────────

  registerDocumentScopesHandlers(services, log);

  // ── Workbench recommendation engine ──────────────────────────────────────────

  registerRecommendationsHandlers(services, log);

  // ── Claude auth ──────────────────────────────────────────────────────────────

  registerAuthHandlers(services, webContentsGetter, activeAbortControllers, log);

  // ── Documents ────────────────────────────────────────────────────────────────

  registerDocumentsHandlers(services, log);

  // ── Library search ────────────────────────────────────────────────────────────

  registerLibraryHandlers(services, log);

  // ── Lock ──────────────────────────────────────────────────────────────────────

  registerLockHandlers(services, log);

  // ── Packs ─────────────────────────────────────────────────────────────────────

  registerPacksHandlers(services, log);

  // ── Shell helpers ─────────────────────────────────────────────────────────────

  registerShellHandlers(services, log);

  // ── Update check ──────────────────────────────────────────────────────────────

  registerUpdateHandlers(services, log);

  const cleanup = () => {
    ipcMain.removeAllListeners("praxis.session.send.cancel");
    ipcMain.removeAllListeners("praxis.ingest.cancel");
    ipcMain.removeAllListeners("praxis.memory.episodic.cancel");
    ipcMain.removeAllListeners("praxis.auth.claude.login.cancel");
    ipcMain.removeAllListeners("praxis.activity.events.cancel");
    ipcMain.removeAllListeners("praxis.courseCreate.drafts.events.cancel");
    ipcMain.removeAllListeners("praxis.quickCheck.events.cancel");
    for (const ctrl of activeAbortControllers.values()) {
      ctrl.abort();
    }
    activeAbortControllers.clear();
  };

  return { cleanup, activeAbortControllers };
}
