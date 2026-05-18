import type { Logger } from "@praxis/core/types";
import { z } from "zod";
import { wrapEnvelope } from "./ipc-error-envelope.js";
import { createIpcHelpers, handleEnvelope } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * IPC handlers for the lock service.
 *
 * Lock handlers are NOT guarded by requireUnlocked — they control the lock.
 *
 * Channels (all invoke-only, envelope-wrapped):
 *   praxis.lock.isSet
 *   praxis.lock.isUnlocked
 *   praxis.lock.setLockCode
 *   praxis.lock.unlock
 *   praxis.lock.lock
 *   praxis.lock.clearLock
 */
export function registerLockHandlers(services: Services, log: Logger): void {
  const { handle } = createIpcHelpers(log);

  handle(
    "praxis.lock.isSet",
    wrapEnvelope("praxis.lock.isSet", log, async () => services.lock.isSet()),
  );

  handle(
    "praxis.lock.isUnlocked",
    wrapEnvelope("praxis.lock.isUnlocked", log, async () => services.lock.isUnlocked()),
  );

  handle(
    "praxis.lock.setLockCode",
    handleEnvelope("praxis.lock.setLockCode", log, z.string().min(1, "code"), async (code) =>
      services.lock.setLockCode({ code }),
    ),
  );

  handle(
    "praxis.lock.unlock",
    handleEnvelope("praxis.lock.unlock", log, z.string().min(1, "code"), async (code) =>
      services.lock.unlock({ code }),
    ),
  );

  handle(
    "praxis.lock.lock",
    wrapEnvelope("praxis.lock.lock", log, async () => services.lock.lock()),
  );

  handle(
    "praxis.lock.clearLock",
    handleEnvelope("praxis.lock.clearLock", log, z.string().min(1, "code"), async (currentCode) =>
      services.lock.clearLock({ currentCode }),
    ),
  );
}
