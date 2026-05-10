import type { RateLimitEvent, ResultEvent, StreamEvent } from "../types/index.js";
import { createLogger } from "../utils.js";
import {
  RawAssistantSchema,
  RawRateLimitSchema,
  RawResultSchema,
  RawSystemInitSchema,
  RawUserSchema,
} from "./schemas.js";

const logger = createLogger("cli");

// ============================================
// STREAM LINE PARSER
// ============================================

/** Type guard: checks that a value is a non-null object with a `type` property. */
function hasType(val: unknown): val is { type: unknown } {
  return typeof val === "object" && val !== null && "type" in val;
}

/** Type guard: checks that a value has a string-valued `subtype` property. */
function hasStringSubtype(val: unknown): val is { subtype: string } {
  return (
    typeof val === "object" &&
    val !== null &&
    "subtype" in val &&
    typeof (val as { subtype: unknown }).subtype === "string"
  );
}

/**
 * Parse a single stream-json line into a StreamEvent.
 * Uses Zod schemas to validate the wire format before mapping to typed events.
 * Returns null for blank lines, JSON parse errors, schema failures, or unknown event types.
 */
export function parseStreamLine(line: string): StreamEvent | null {
  if (!line.trim()) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }

  // Peek at type before full parse to dispatch to the right schema
  if (!hasType(raw)) return null;
  const type = raw.type;

  switch (type) {
    case "system": {
      // Only the `init` subtype is exposed to consumers as a SystemInitEvent.
      // The CLI emits many other system subtypes (e.g. `compact_boundary`,
      // `task_progress`, `mcp_status`, `notification`, ...) that are internal
      // bookkeeping for interactive use and are not part of our public event
      // surface. Drop them silently — only warn when the subtype IS `init` but
      // the rest of the shape is wrong (a real schema regression).
      if (hasStringSubtype(raw) && raw.subtype !== "init") {
        logger.debug("Ignoring non-init system event subtype", { subtype: raw.subtype });
        return null;
      }
      const parsed = RawSystemInitSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn("Unexpected system event shape from CLI", { issues: parsed.error.issues });
        return null;
      }
      const d = parsed.data;
      return {
        type: "system",
        subtype: "init",
        sessionId: d.session_id,
        model: d.model,
        tools: d.tools,
        cwd: d.cwd,
        mcpServers: d.mcp_servers?.map((s) => ({ name: s.name, status: s.status })),
        permissionMode: d.permissionMode,
        claudeCodeVersion: d.claude_code_version,
        agents: d.agents,
        skills: d.skills,
        plugins: d.plugins?.map((p) => (typeof p === "string" ? p : p.name)),
        fastModeState: d.fast_mode_state,
      };
    }

    case "assistant": {
      const parsed = RawAssistantSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn("Unexpected assistant event shape from CLI", { issues: parsed.error.issues });
        return null;
      }
      const content = parsed.data.message.content;

      // Text blocks — concatenate all in this message
      const textBlocks = content.filter(
        (b): b is { type: "text"; text: string } => b.type === "text" && "text" in b,
      );
      if (textBlocks.length > 0) {
        const fullText = textBlocks.map((b) => b.text).join("");
        return { type: "assistant", text: fullText, delta: fullText };
      }

      // Tool use block
      const toolBlock = content.find(
        (b): b is { type: "tool_use"; id: string; name: string; input: unknown } =>
          b.type === "tool_use",
      );
      if (toolBlock) {
        return {
          type: "tool_use",
          toolName: toolBlock.name,
          toolId: toolBlock.id,
          toolInput: toolBlock.input,
        };
      }

      return null;
    }

    case "user": {
      const parsed = RawUserSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn("Unexpected user event shape from CLI", { issues: parsed.error.issues });
        return null;
      }
      const toolResult = parsed.data.message.content.find(
        (b): b is Extract<typeof b, { type: "tool_result" }> => b.type === "tool_result",
      );
      if (!toolResult) return null;

      return {
        type: "tool_result",
        toolId: toolResult.tool_use_id,
        value: extractToolResultValue(toolResult.content),
        isError: toolResult.is_error,
      };
    }

    case "result": {
      const parsed = RawResultSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn("Unexpected result event shape from CLI", { issues: parsed.error.issues });
        return null;
      }
      const d = parsed.data;
      return {
        type: "result",
        subtype: d.subtype,
        sessionId: d.session_id,
        result: d.result ?? undefined,
        structuredOutput: d.structured_output,
        durationMs: d.duration_ms,
        numTurns: d.num_turns,
        costUsd: d.cost_usd ?? d.total_cost_usd,
        isError: d.is_error,
        error: d.error,
        usage: d.usage
          ? {
              inputTokens: d.usage.input_tokens ?? 0,
              outputTokens: d.usage.output_tokens ?? 0,
              cacheReadTokens: d.usage.cache_read_input_tokens,
              cacheWriteTokens: d.usage.cache_creation_input_tokens,
              ephemeral1hCacheTokens: d.usage.cache_creation?.ephemeral_1h_input_tokens,
              ephemeral5mCacheTokens: d.usage.cache_creation?.ephemeral_5m_input_tokens,
              webSearchRequests: d.usage.server_tool_use?.web_search_requests,
              webFetchRequests: d.usage.server_tool_use?.web_fetch_requests,
              serviceTier: d.usage.service_tier,
            }
          : undefined,
        stopReason: d.stop_reason,
        modelUsage: d.modelUsage
          ? Object.fromEntries(
              Object.entries(d.modelUsage).map(([model, u]) => [
                model,
                {
                  inputTokens: u.inputTokens,
                  outputTokens: u.outputTokens,
                  cacheReadInputTokens: u.cacheReadInputTokens,
                  cacheCreationInputTokens: u.cacheCreationInputTokens,
                  webSearchRequests: u.webSearchRequests,
                  costUsd: u.costUSD,
                  contextWindow: u.contextWindow,
                  maxOutputTokens: u.maxOutputTokens,
                },
              ]),
            )
          : undefined,
        permissionDenials: d.permission_denials?.map((pd) => ({
          toolName: pd.tool_name,
          toolUseId: pd.tool_use_id,
          toolInput: pd.tool_input,
        })),
      } satisfies ResultEvent;
    }

    case "rate_limit_event": {
      const parsed = RawRateLimitSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn("Unexpected rate_limit_event shape from CLI", { issues: parsed.error.issues });
        return null;
      }
      const d = parsed.data.rate_limit_info;
      return {
        type: "rate_limit_event",
        rateLimitInfo: {
          status: d.status,
          resetsAt: d.resetsAt,
          rateLimitType: d.rateLimitType,
          overageStatus: d.overageStatus,
          overageResetsAt: d.overageResetsAt,
          isUsingOverage: d.isUsingOverage,
        },
      } satisfies RateLimitEvent;
    }

    default:
      // Unknown event type — CLI may have added new events; ignore gracefully
      logger.debug("Unknown CLI event type, ignoring", { type });
      return null;
  }
}

/**
 * Decode an MCP tool-result content payload into the tool's actual return
 * value.
 *
 * Two layers of decoding happen here so consumers never have to:
 *
 * 1. **MCP content-block extraction.** The wire format for `tool_result.content`
 *    is either a bare string (older / simpler MCP servers) or an array of
 *    content blocks. The standard shape from a modern MCP server is
 *    `[{ type: "text", text: "<payload>" }]`, but the spec allows `image`,
 *    `audio`, and `resource` blocks too. We concatenate text from every text
 *    block in order; non-text blocks become `[image]` / `[audio]` placeholders.
 *
 * 2. **JSON parse.** Tool implementations (especially ours via the Praxis MCP
 *    bridge) typically JSON-stringify their structured return values when
 *    placing them in the text block. We try-parse the concatenated text — on
 *    success the consumer gets the original structured value; on failure we
 *    return the raw string (markdown / plain text tools).
 *
 * Returns `undefined` when no content was provided (the parent message had
 * a `tool_result` block with no content field).
 */
function extractToolResultValue(content: unknown): unknown {
  const text = extractToolResultText(content);
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    // Not JSON — caller's tool returned plain text. Pass through as a string.
    return text;
  }
}

function extractToolResultText(content: unknown): string | undefined {
  if (content === undefined || content === null) return undefined;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) {
    // Defensive: the parent message-content union has a `passthrough` catch-all
    // for forward-compat with unknown block types, which can let a malformed
    // tool_result block (e.g. `content` as an object instead of an array)
    // slip past schema validation. Drop it cleanly rather than crash on
    // `.map is not a function`.
    return undefined;
  }
  return content
    .map((b: unknown) => {
      if (typeof b !== "object" || b === null) return "";
      const block = b as { type?: unknown; text?: unknown };
      if (block.type === "text" && typeof block.text === "string") return block.text;
      return typeof block.type === "string" ? `[${block.type}]` : "";
    })
    .join("");
}
