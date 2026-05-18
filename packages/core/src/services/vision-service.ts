import { createEngine } from "@praxis/engines";
import { readEngineConfig } from "../config/index.js";
import type { PraxisDb } from "../db/index.js";
import type {
  Logger,
  SecretStorage,
  VisionDescribeRequest,
  VisionDescribeResponse,
  VisionService,
} from "../types/index.js";

// Re-export the canonical VisionService interface defined in types/tool.ts so
// callers that import from @praxis/core/services get the same type.
export type { VisionService };

export interface VisionServiceDeps {
  readonly db: PraxisDb;
  readonly log: Logger;
  readonly secretStorage: SecretStorage;
}

/**
 * VisionServiceImpl — thin wrapper around the configured engine's VisionCapability.
 *
 * Resolves the active engine config at call time so engine swaps reflect
 * immediately (same pattern as `visionResolver` in services.ts, and as
 * CourseCreateServiceImpl's engineResolver).
 *
 * Each call to `describe` opens a fresh one-shot engine session — no state
 * is shared with the active tutoring EngineSession.
 */
export class VisionServiceImpl implements VisionService {
  constructor(private readonly deps: VisionServiceDeps) {}

  async describe(req: VisionDescribeRequest): Promise<VisionDescribeResponse> {
    const config = readEngineConfig(this.deps.db, this.deps.secretStorage, this.deps.log);
    const engine = createEngine({ config, deps: { log: this.deps.log } });
    if (!engine.vision) {
      throw new Error(
        `Engine "${config.engineId}" does not support vision. Switch to a vision-capable engine (e.g. direct.anthropic with a Claude model).`,
      );
    }
    return engine.vision.describe(req);
  }
}
