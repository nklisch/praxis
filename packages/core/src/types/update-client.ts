import type { UpdateCheckResult } from "../services/update-service.js";

/**
 * Phase 19: renderer-side update-check API. The main-process `UpdateService`
 * accepts a version string; the IPC handler reads `app.getVersion()`
 * internally and passes it through, so the renderer's surface is
 * parameter-less.
 */
export interface UpdateClientApi {
  checkLatest(): Promise<UpdateCheckResult>;
}
