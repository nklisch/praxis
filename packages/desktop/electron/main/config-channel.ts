import { EngineConfigSchema, EngineIdSchema } from "@praxis/core/config";
import type { Logger } from "@praxis/core/types";
import { z } from "zod";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * IPC handlers for the config service.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.config.isLocked
 *   praxis.config.setLockCode
 *   praxis.config.unlock
 *   praxis.config.selectedEngine
 *   praxis.config.setSelectedEngine
 *   praxis.config.engineConfig        — requireUnlocked guard
 *   praxis.config.engineConfig.reveal — requireUnlocked guard
 *   praxis.config.setEngineConfig     — requireUnlocked guard
 *   praxis.config.courseCreateConfig
 *   praxis.config.setCourseCreateConfig
 *   praxis.config.firstRunCompleted
 *   praxis.config.markFirstRunComplete
 */
export function registerConfigHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  async function requireUnlocked(): Promise<void> {
    const unlocked = await services.lock.isUnlocked();
    if (!unlocked) {
      throw new Error("Locked: configure surface requires unlock. Call praxis.lock.unlock first.");
    }
  }

  handle(
    "praxis.config.isLocked",
    wrapEnvelope("praxis.config.isLocked", log, async () => services.config.isLocked()),
  );

  handle(
    "praxis.config.setLockCode",
    handleEnvelope("praxis.config.setLockCode", log, z.string().min(1, "code"), async (code) =>
      services.config.setLockCode(code),
    ),
  );

  handle(
    "praxis.config.unlock",
    handleEnvelope("praxis.config.unlock", log, z.string().min(1, "code"), async (code) =>
      services.config.unlock(code),
    ),
  );

  handle(
    "praxis.config.selectedEngine",
    wrapEnvelope("praxis.config.selectedEngine", log, async () => services.config.selectedEngine()),
  );

  handle(
    "praxis.config.setSelectedEngine",
    handleEnvelope("praxis.config.setSelectedEngine", log, EngineIdSchema, async (engineId) =>
      services.config.setSelectedEngine(engineId),
    ),
  );

  handle(
    "praxis.config.engineConfig",
    wrapEnvelope("praxis.config.engineConfig", log, async () => {
      await requireUnlocked();
      return services.config.engineConfig();
    }),
  );

  // Phase: IPC trust-boundary hardening — separate "reveal" channel so the
  // steady-state `engineConfig()` read never sees the decrypted apiKey.
  handle(
    "praxis.config.engineConfig.reveal",
    wrapEnvelope("praxis.config.engineConfig.reveal", log, async () => {
      await requireUnlocked();
      return services.config.revealApiKey();
    }),
  );

  handle(
    "praxis.config.setEngineConfig",
    handleEnvelope("praxis.config.setEngineConfig", log, EngineConfigSchema, async (cfg) => {
      await requireUnlocked();
      // The service writes to disk; `hasApiKey` is a derived display flag
      // — set it from the validated public input so the snapshot shape
      // matches even though the service strips it before persistence.
      const hasApiKey = cfg.apiKey !== undefined && cfg.apiKey.length > 0;
      return services.config.setEngineConfig({
        engineId: cfg.engineId,
        hasApiKey,
        ...(cfg.model !== undefined && { model: cfg.model }),
        ...(cfg.baseUrl !== undefined && { baseUrl: cfg.baseUrl }),
        ...(cfg.effort !== undefined && { effort: cfg.effort }),
        ...(cfg.apiKey !== undefined && { apiKey: cfg.apiKey }),
      });
    }),
  );

  handle(
    "praxis.config.courseCreateConfig",
    wrapEnvelope("praxis.config.courseCreateConfig", log, async () =>
      services.config.courseCreateConfig(),
    ),
  );

  handle(
    "praxis.config.setCourseCreateConfig",
    handleEnvelope(
      "praxis.config.setCourseCreateConfig",
      log,
      z.object({ maxSteps: z.number().int().positive() }),
      async (cfg) => services.config.setCourseCreateConfig(cfg),
    ),
  );

  handle(
    "praxis.config.firstRunCompleted",
    wrapEnvelope("praxis.config.firstRunCompleted", log, async () =>
      services.config.firstRunCompleted(),
    ),
  );

  handle(
    "praxis.config.markFirstRunComplete",
    wrapEnvelope("praxis.config.markFirstRunComplete", log, async () =>
      services.config.markFirstRunComplete(),
    ),
  );
}
