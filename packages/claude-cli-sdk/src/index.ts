// ============================================
// @praxis/claude-cli-sdk
// ============================================
// First-party Praxis package: a TypeScript SDK wrapping the Claude Code CLI
// (`claude`) subprocess. Uses Pro/Max subscription billing — no
// ANTHROPIC_API_KEY required.
//
// History: originally forked from @nklisch/claude-cli-sdk and brought into
// the workspace so `pnpm deploy --inject-workspace-packages` could see it
// alongside the rest of the monorepo (it can't follow `link:` paths). It is
// no longer tracked against upstream — Praxis is the only consumer, so this
// package is owned and modified freely as a regular workspace member.
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

// ---- Auth ----
export type { ClaudeAuthLoginEvent, ClaudeAuthLoginOptions, ClaudeAuthStatus } from "./auth.js";
export { authLogin, authStatus } from "./auth.js";
// ---- Conversation ----
export type {
  Conversation,
  ToolResultContent,
  Turn,
  TurnResult,
} from "./conversation.js";
export { createConversation } from "./conversation.js";
// ---- Error Classes ----
export {
  CLIError,
  CLINotFoundError,
  CLITimeoutError,
  InvalidOptionError,
  StructuredOutputError,
} from "./errors.js";
// ---- Hook types (type-only; see extensions/hooks.ts for rationale) ----
export type { HookEvent, HookHandler, HookMatcher } from "./extensions/hooks.js";
// ---- Core APIs ----
export { query } from "./query.js";
// ---- Structured Output ----
export { collectResult, parseStructuredOutput, zodToOutputFormat } from "./structured.js";
// ---- Tool Server ----
export type { ToolServerHandle } from "./tool-server.js";
export { startToolServer } from "./tool-server.js";
// ---- Custom Tool Injection ----
export { tool } from "./tools.js";
// ---- Types ----
export type {
  AgentDefinition,
  AssistantTextEvent,
  ConversationOptions,
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
