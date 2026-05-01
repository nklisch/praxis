// ============================================
// @praxis/claude-cli-sdk (vendored from @nklisch/claude-cli-sdk)
// ============================================
// TypeScript SDK wrapping the Claude Code CLI (`claude`) subprocess.
// Uses Pro/Max subscription billing — no ANTHROPIC_API_KEY required.
//
// Two primary APIs:
//   query()              — One-shot streaming queries
//   createConversation() — Multi-turn persistent sessions
//
// Peer dependencies:
//   zod >=4.0.0                       — Required
//   @modelcontextprotocol/sdk >=1.27.0 — Optional (only for tools.custom)
//
// Requires: Node >=22, `claude` CLI installed and authenticated.
// ============================================

// ---- Core APIs ----
export { query } from './query.js';
export { createConversation } from './conversation.js';

// ---- Tool Discovery ----
export { discoverTools, computeDisallowedTools } from './discover.js';
export type { DiscoverResult } from './discover.js';

// ---- Custom Tool Injection ----
export { tool } from './tools.js';
export { startToolServer } from './tool-server.js';
export type { ToolServerHandle } from './tool-server.js';

// ---- Interactive Skill Handlers ----
export { askUserQuestionHandler, sendUserMessageHandler, InteractiveTool } from './interactive-tools.js';

// ---- Structured Output ----
export { zodToOutputFormat, parseStructuredOutput, collectResult } from './structured.js';

// ---- Extension Builders (settings, skills, plugins) ----
export {
  toolPattern,
  buildSettings,
  buildSkill,
  buildPlugin,
  writePlugin,
  writePluginToTemp,
} from './extensions/index.js';

// ---- UUID Helpers ----
export { uuid, isUUID } from './types/options.js';

// ---- Error Classes ----
export { CLIError, CLITimeoutError, CLINotFoundError, StructuredOutputError, InvalidOptionError } from './errors.js';

// Types
export type {
  UUID,
  ModelAlias,
  Options,
  OptionsBase,
  ConversationOptions,
  DiscoverOptions,
  Query,
  StreamEvent,
  SystemInitEvent,
  AssistantTextEvent,
  ToolUseEvent,
  ToolResultEvent,
  ResultEvent,
  TokenUsage,
  McpServerConfig,
  McpServerStdioConfig,
  McpServerSseConfig,
  McpServerHttpConfig,
  McpServerStatus,
  PermissionMode,
  AgentDefinition,
  JsonSchemaOutputFormat,
  ToolDefinition,
  ToolResult,
  ToolHandler,
  ToolHandlerResult,
  ToolControl,
  ToolFilter,
  RateLimitEvent,
  RateLimitInfo,
  ModelUsageEntry,
} from './types/index.js';

export type {
  Conversation,
  Turn,
  TurnResult,
  ToolResultContent,
} from './conversation.js';

export type { InteractiveToolName } from './interactive-tools.js';

export type {
  HookMatcher,
  HookHandler,
  HookEvent,
  SettingsConfig,
  SkillConfig,
  PluginConfig,
  GeneratedFile,
  GeneratedPlugin,
} from './extensions/index.js';
