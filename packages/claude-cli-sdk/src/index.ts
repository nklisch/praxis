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

export type { ClaudeAuthLoginEvent, ClaudeAuthLoginOptions, ClaudeAuthStatus } from "./auth.js";
// ---- Auth ----
export { authLogin, authStatus } from "./auth.js";
export type {
  Conversation,
  ToolResultContent,
  Turn,
  TurnResult,
} from "./conversation.js";
export { createConversation } from "./conversation.js";
export type { DiscoverResult } from "./discover.js";
// ---- Tool Discovery ----
export { computeDisallowedTools, discoverTools } from "./discover.js";
// ---- Error Classes ----
export {
  CLIError,
  CLINotFoundError,
  CLITimeoutError,
  InvalidOptionError,
  StructuredOutputError,
} from "./errors.js";
export type {
  GeneratedFile,
  GeneratedPlugin,
  HookEvent,
  HookHandler,
  HookMatcher,
  PluginConfig,
  SettingsConfig,
  SkillConfig,
} from "./extensions/index.js";
// ---- Extension Builders (settings, skills, plugins) ----
export {
  buildPlugin,
  buildSettings,
  buildSkill,
  toolPattern,
  writePlugin,
  writePluginToTemp,
} from "./extensions/index.js";
export type { InteractiveToolName } from "./interactive-tools.js";
// ---- Interactive Skill Handlers ----
export {
  askUserQuestionHandler,
  InteractiveTool,
  sendUserMessageHandler,
} from "./interactive-tools.js";
// ---- Core APIs ----
export { query } from "./query.js";
// ---- Structured Output ----
export { collectResult, parseStructuredOutput, zodToOutputFormat } from "./structured.js";
export type { ToolServerHandle } from "./tool-server.js";
export { startToolServer } from "./tool-server.js";
// ---- Custom Tool Injection ----
export { tool } from "./tools.js";
// Types
export type {
  AgentDefinition,
  AssistantTextEvent,
  ConversationOptions,
  DiscoverOptions,
  JsonSchemaOutputFormat,
  McpServerConfig,
  McpServerHttpConfig,
  McpServerSseConfig,
  McpServerStatus,
  McpServerStdioConfig,
  ModelAlias,
  ModelUsageEntry,
  Options,
  OptionsBase,
  PermissionMode,
  Query,
  RateLimitEvent,
  RateLimitInfo,
  ResultEvent,
  StreamEvent,
  SystemInitEvent,
  TokenUsage,
  ToolControl,
  ToolDefinition,
  ToolFilter,
  ToolHandler,
  ToolHandlerResult,
  ToolResult,
  ToolResultEvent,
  ToolUseEvent,
  UUID,
} from "./types/index.js";
// ---- UUID Helpers ----
export { isUUID, uuid } from "./types/options.js";
