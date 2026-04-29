import type { z } from "zod";
import type { EngineConfig } from "../config/index.js";
import type { PraxisDb } from "../db/index.js";
import type {
  CodeSandbox,
  Engine,
  Logger,
  Mode,
  SymPyService,
  ToolDefinition,
} from "../types/index.js";

export interface ServiceDeps {
  db: PraxisDb;
  log: Logger;
  modes: ReadonlyMap<string, Mode>;
  toolDefinitions: ReadonlyArray<ToolDefinition<z.ZodType, z.ZodType>>;
  /**
   * Concrete tool services injected into ToolContext for handlers. Only the
   * services concrete in the current phase are required; the rest of
   * ToolContext.services stays `unknown`/null until later phases land.
   */
  toolServices: {
    sympy: SymPyService;
    sandbox: CodeSandbox;
  };
  /**
   * Factory for constructing an Engine from a config. Optional — when omitted,
   * defaults to `createEngine` from @praxis/engines. Tests inject fakes here.
   */
  engineFactory?: (config: EngineConfig, deps: { log: Logger }) => Engine;
}
