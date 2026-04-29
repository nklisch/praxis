import type { z } from "zod";
import type { EngineConfig } from "../config/index.js";
import type { PraxisDb } from "../db/index.js";
import type { Engine, Logger, Mode, ToolDefinition } from "../types/index.js";

export interface ServiceDeps {
  db: PraxisDb;
  log: Logger;
  modes: ReadonlyMap<string, Mode>;
  toolDefinitions: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
  /**
   * Factory for constructing an Engine from a config. Optional — when omitted,
   * defaults to `createEngine` from @praxis/engines. Tests inject fakes here.
   */
  engineFactory?: (config: EngineConfig, deps: { log: Logger }) => Engine;
}
