import type { GenerationParams, TokenUsage } from "./common.js";

export interface Engine {
  readonly id: string;
  readonly kind: "looped" | "single-shot";
  run(brief: Brief, tools: ToolRegistry): AsyncIterable<EngineEvent>;
  health(): Promise<HealthStatus>;
}

export interface Brief {
  systemPrompt: string;
  userMessage: string;
  context: BriefContext;
  maxSteps?: number;
  generation?: GenerationParams;
}

export interface BriefContext {
  retrievedChunks: RetrievedChunk[];
  studentSummary?: string; // model-readable summary derived from semantic memory
  artifactRefs: string[]; // serialized references to artifacts in scope
}

export interface RetrievedChunk {
  documentId: string;
  text: string;
  locator: { page?: number; section?: string };
  score: number;
}

export interface ToolRegistry {
  list(): ToolDefinitionSummary[];
  dispatch(name: string, args: unknown): Promise<ToolResult>;
}

export interface ToolDefinitionSummary {
  name: string;
  description: string;
  inputSchemaJson: unknown; // JSON Schema serialization (always present)
  /**
   * Optional native input schema in the implementation's preferred form.
   * For InProcessToolRegistry this is the original `z.ZodType<unknown>` instance.
   * Engine adapters that need typed schemas (Claude Code SDK MCP, etc.) consume
   * this when present and fall back to JSON-Schema-to-Zod conversion otherwise.
   */
  inputSchemaNative?: unknown;
  tier: "deterministic" | "grounded" | "model-derived";
}

export type ToolResult =
  | { ok: true; value: unknown; tier: "deterministic" | "grounded" | "model-derived" }
  | { ok: false; error: { code: string; message: string; recoverable: boolean } };

export type EngineEvent =
  | { type: "model_message"; content: string; partial?: boolean }
  | { type: "tool_call"; toolName: string; args: unknown; callId: string }
  | { type: "tool_result"; callId: string; result: ToolResult }
  | { type: "thinking"; content: string }
  | { type: "error"; error: EngineError }
  | { type: "final"; usage: TokenUsage };

export interface EngineError {
  code: string;
  message: string;
  recoverable: boolean;
  cause?: unknown;
}

export interface HealthStatus {
  ok: boolean;
  detail?: string;
  capabilities: {
    vision: boolean;
    streaming: boolean;
    nativeMCP: boolean;
    contextWindow: number;
  };
}
