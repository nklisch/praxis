import type { z } from "zod";
import type { Logger } from "./common.js";
import type { SessionId, StudentId } from "./ids.js";

export type EffectKind =
  | "memory.write"
  | "artifact.mutate"
  | "gate.evaluate"
  | "external.network"
  | "external.code-exec"
  | "none";

export interface ToolDefinition<I extends z.ZodType, O extends z.ZodType> {
  name: string;
  description: string;
  input: I;
  output: O;
  tier: "deterministic" | "grounded" | "model-derived";
  effects: ReadonlyArray<EffectKind>;
  handler(args: z.infer<I>, ctx: ToolContext): Promise<z.infer<O>>;
}

/**
 * Service handles available to tool handlers. These are placeholders in
 * Phase 1 — concrete service implementations land in subsequent phases.
 */
export interface ToolContext {
  studentId: StudentId;
  sessionId: SessionId;
  services: ToolServices;
  log: Logger;
}

export interface ToolServices {
  memory: unknown; // MemoryService — concrete in Phase 7
  artifacts: unknown; // ArtifactsService — concrete in Phase 6
  vectorStore: unknown; // VectorStore — concrete in Phase 5
  sandbox: unknown; // CodeSandbox — concrete in Phase 4
  sympy: unknown; // SymPyService — concrete in Phase 4
  pedagogyPack: unknown; // PedagogyPackService — concrete in Phase 14
}
