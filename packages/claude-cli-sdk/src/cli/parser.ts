import { createLogger } from '../utils.js';
import type { StreamEvent, ResultEvent, RateLimitEvent } from '../types/index.js';
import {
  RawSystemInitSchema,
  RawAssistantSchema,
  RawUserSchema,
  RawResultSchema,
  RawRateLimitSchema,
} from './schemas.js';

const logger = createLogger('cli');

// ============================================
// STREAM LINE PARSER
// ============================================

/** Type guard: checks that a value is a non-null object with a `type` property. */
function hasType(val: unknown): val is { type: unknown } {
  return typeof val === 'object' && val !== null && 'type' in val;
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
    case 'system': {
      const parsed = RawSystemInitSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn('Unexpected system event shape from CLI', { issues: parsed.error.issues });
        return null;
      }
      const d = parsed.data;
      return {
        type: 'system',
        subtype: 'init',
        sessionId: d.session_id,
        model: d.model,
        tools: d.tools,
        cwd: d.cwd,
        mcpServers: d.mcp_servers?.map(s => ({ name: s.name, status: s.status })),
        permissionMode: d.permissionMode,
        claudeCodeVersion: d.claude_code_version,
        agents: d.agents,
        skills: d.skills,
        plugins: d.plugins?.map(p => typeof p === 'string' ? p : p.name),
        fastModeState: d.fast_mode_state,
      };
    }

    case 'assistant': {
      const parsed = RawAssistantSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn('Unexpected assistant event shape from CLI', { issues: parsed.error.issues });
        return null;
      }
      const content = parsed.data.message.content;

      // Text blocks — concatenate all in this message
      const textBlocks = content.filter((b): b is { type: 'text'; text: string } => b.type === 'text' && 'text' in b);
      if (textBlocks.length > 0) {
        const fullText = textBlocks.map((b) => b.text).join('');
        return { type: 'assistant', text: fullText, delta: fullText };
      }

      // Tool use block
      const toolBlock = content.find((b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use');
      if (toolBlock) {
        return {
          type: 'tool_use',
          toolName: toolBlock.name,
          toolId: toolBlock.id,
          toolInput: toolBlock.input,
        };
      }

      return null;
    }

    case 'user': {
      const parsed = RawUserSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn('Unexpected user event shape from CLI', { issues: parsed.error.issues });
        return null;
      }
      const toolResult = parsed.data.message.content.find(
        (b): b is { type: 'tool_result'; tool_use_id?: string; content?: unknown; is_error?: boolean } => b.type === 'tool_result'
      );
      if (!toolResult) return null;

      return {
        type: 'tool_result',
        toolId: toolResult.tool_use_id,
        content: typeof toolResult.content === 'string' ? toolResult.content : toolResult.content !== undefined ? JSON.stringify(toolResult.content) : undefined,
        isError: toolResult.is_error,
      };
    }

    case 'result': {
      const parsed = RawResultSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn('Unexpected result event shape from CLI', { issues: parsed.error.issues });
        return null;
      }
      const d = parsed.data;
      return {
        type: 'result',
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
              Object.entries(d.modelUsage).map(([model, u]) => [model, {
                inputTokens: u.inputTokens,
                outputTokens: u.outputTokens,
                cacheReadInputTokens: u.cacheReadInputTokens,
                cacheCreationInputTokens: u.cacheCreationInputTokens,
                webSearchRequests: u.webSearchRequests,
                costUsd: u.costUSD,
                contextWindow: u.contextWindow,
                maxOutputTokens: u.maxOutputTokens,
              }])
            )
          : undefined,
        permissionDenials: d.permission_denials?.map(pd => ({
          toolName: pd.tool_name,
          toolUseId: pd.tool_use_id,
          toolInput: pd.tool_input,
        })),
      } satisfies ResultEvent;
    }

    case 'rate_limit_event': {
      const parsed = RawRateLimitSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn('Unexpected rate_limit_event shape from CLI', { issues: parsed.error.issues });
        return null;
      }
      const d = parsed.data.rate_limit_info;
      return {
        type: 'rate_limit_event',
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
      logger.debug('Unknown CLI event type, ignoring', { type });
      return null;
  }
}
