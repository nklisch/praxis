import { z } from "zod";

// ============================================
// WIRE-FORMAT SCHEMAS (raw CLI stream-json)
// ============================================
// Schemas validate the snake_case JSON emitted by `claude --output-format stream-json`.
// parseStreamLine() uses these and maps to our camelCase StreamEvent types.
// Unknown top-level event types are silently ignored (forward-compatible).

export const RawContentBlockSchema = z.union([
  z.object({ type: z.literal("text"), text: z.string() }),
  z.object({ type: z.literal("tool_use"), id: z.string(), name: z.string(), input: z.unknown() }),
  // Unknown block types — passthrough so we don't reject messages with new blocks
  z.object({ type: z.string() }).passthrough(),
]);

export const RawSystemInitSchema = z.object({
  type: z.literal("system"),
  subtype: z.literal("init"),
  session_id: z.string(),
  model: z.string().optional(),
  tools: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  mcp_servers: z
    .array(
      z.object({
        name: z.string(),
        status: z.string(),
      }),
    )
    .optional(),
  // New fields (all optional for backward compatibility)
  permissionMode: z.string().optional(),
  claude_code_version: z.string().optional(),
  agents: z.array(z.string()).optional(),
  skills: z.array(z.string()).optional(),
  plugins: z
    .array(
      z.union([
        z.string(),
        z.object({ name: z.string(), path: z.string().optional() }).passthrough(),
      ]),
    )
    .optional(),
  fast_mode_state: z.string().optional(),
});

export const RawAssistantSchema = z.object({
  type: z.literal("assistant"),
  message: z.object({
    content: z.array(RawContentBlockSchema),
  }),
});

export const RawUserSchema = z.object({
  type: z.literal("user"),
  message: z.object({
    content: z.array(
      z.union([
        z.object({
          type: z.literal("tool_result"),
          tool_use_id: z.string().optional(),
          content: z.unknown().optional(),
          is_error: z.boolean().optional(),
        }),
        z.object({ type: z.string() }).passthrough(),
      ]),
    ),
  }),
});

export const RawUsageSchema = z.object({
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  cache_read_input_tokens: z.number().optional(),
  cache_creation_input_tokens: z.number().optional(),
  // New fields
  server_tool_use: z
    .object({
      web_search_requests: z.number().optional(),
      web_fetch_requests: z.number().optional(),
    })
    .optional(),
  cache_creation: z
    .object({
      ephemeral_1h_input_tokens: z.number().optional(),
      ephemeral_5m_input_tokens: z.number().optional(),
    })
    .optional(),
  service_tier: z.string().optional(),
});

export const RawResultSchema = z.object({
  type: z.literal("result"),
  // Use .catch() so unknown future subtypes don't throw
  subtype: z
    .enum(["success", "error_max_turns", "error_during_generation", "error_interrupted"])
    .catch("error_during_generation" as const),
  session_id: z.string(),
  result: z.string().nullish(),
  structured_output: z.unknown().optional(),
  duration_ms: z.number().optional(),
  num_turns: z.number().optional(),
  // CLI emits total_cost_usd; accept both for compatibility
  cost_usd: z.number().optional(),
  total_cost_usd: z.number().optional(),
  is_error: z.boolean().optional(),
  error: z.string().optional(),
  usage: RawUsageSchema.optional(),
  // New fields
  stop_reason: z.string().optional(),
  modelUsage: z
    .record(
      z.string(),
      z.object({
        inputTokens: z.number(),
        outputTokens: z.number(),
        cacheReadInputTokens: z.number().optional(),
        cacheCreationInputTokens: z.number().optional(),
        webSearchRequests: z.number().optional(),
        costUSD: z.number(),
        contextWindow: z.number().optional(),
        maxOutputTokens: z.number().optional(),
      }),
    )
    .optional(),
  permission_denials: z
    .array(
      z.object({
        tool_name: z.string(),
        tool_use_id: z.string(),
        tool_input: z.unknown(),
      }),
    )
    .optional(),
});

export const RawRateLimitSchema = z.object({
  type: z.literal("rate_limit_event"),
  rate_limit_info: z.object({
    status: z.string(),
    resetsAt: z.number(),
    rateLimitType: z.string(),
    overageStatus: z.string().optional(),
    overageResetsAt: z.number().optional(),
    isUsingOverage: z.boolean(),
  }),
});

// Export types for tests
export type RawSystemInit = z.infer<typeof RawSystemInitSchema>;
export type RawAssistant = z.infer<typeof RawAssistantSchema>;
export type RawUser = z.infer<typeof RawUserSchema>;
export type RawResult = z.infer<typeof RawResultSchema>;
export type RawRateLimit = z.infer<typeof RawRateLimitSchema>;
