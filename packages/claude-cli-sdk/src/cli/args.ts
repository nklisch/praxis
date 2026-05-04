import { InvalidOptionError } from "../errors.js";
import type { ConversationOptions, Options, OptionsBase, PermissionMode } from "../types/index.js";
import { isUUID } from "../types/options.js";
import { createLogger, writeTempJson } from "../utils.js";

/**
 * Resolve the effective permission mode for a conversation.
 *
 * When `mcpServers` is provided and `permissionMode` is not explicitly set,
 * defaults to `"bypassPermissions"`. This is the correct default for
 * programmatic SDK consumers that register first-party MCP tools — there is
 * no human at the CLI to answer permission prompts, so bypass is necessary
 * for tools to actually execute. Callers can still set `permissionMode`
 * explicitly to opt out of this default.
 *
 * When no MCP servers are registered, falls back to the CLI's own default
 * (`"default"`) by returning `undefined` (no flag emitted).
 */
export function resolvePermissionMode(
  options: Pick<
    ConversationOptions,
    "permissionMode" | "dangerouslySkipPermissions" | "mcpServers"
  >,
): PermissionMode | undefined {
  if (options.permissionMode) return options.permissionMode;
  if (options.dangerouslySkipPermissions) return undefined; // handled separately
  if (options.mcpServers && Object.keys(options.mcpServers).length > 0) {
    return "bypassPermissions";
  }
  return undefined;
}

const logger = createLogger("cli");

// ============================================
// ARG BUILDER
// ============================================

export interface BuiltArgs {
  args: string[];
  /** Temp files to clean up after the process exits */
  tempFiles: string[];
  /** Cleanup function for tool server (if custom tools are used) */
  toolServerClose?: () => Promise<void>;
}

/**
 * Push shared CLI flags that are common to both one-shot queries and conversations.
 * Mutates `args` and `tempFiles` in place.
 */
async function buildCommonArgs(
  args: string[],
  tempFiles: string[],
  options: OptionsBase & {
    permissionMode?: PermissionMode;
    dangerouslySkipPermissions?: boolean;
    systemPrompt?: string;
    systemPromptFile?: string;
    appendSystemPrompt?: string;
    appendSystemPromptFile?: string;
  },
  context: { toolServerClose?: () => Promise<void> } = {},
): Promise<void> {
  // Model
  if (options.model) {
    args.push("--model", options.model);
  }

  // Effort
  if (options.effort) {
    args.push("--effort", options.effort);
  }

  // Permission mode — use resolvePermissionMode to default bypassPermissions
  // when MCP servers are registered and no explicit mode is set.
  const effectivePermissionMode = resolvePermissionMode(options);
  if (effectivePermissionMode) {
    args.push("--permission-mode", effectivePermissionMode);
  } else if (options.dangerouslySkipPermissions) {
    args.push("--dangerously-skip-permissions");
  }

  // Tool visibility control
  if (options.tools !== undefined) {
    if (options.tools === "none") {
      // Disable all built-in tools
      args.push("--tools", "");
    } else if (options.tools === "all") {
      // Explicit all — no flags needed (default behavior)
    } else {
      // ToolFilter object
      const { only, deny } = options.tools;

      if (only && deny) {
        throw new InvalidOptionError(
          "tools",
          options.tools,
          "only and deny are mutually exclusive",
        );
      }

      if (only) {
        // tools.only requires tool discovery which is not supported in Praxis.
        // Praxis uses permissionMode: bypassPermissions and does not expose
        // built-in CLI tools (Bash, Read, Edit) to the model.
        throw new InvalidOptionError(
          "tools.only",
          only,
          "tools.only is not supported — use tools.deny to block specific tools or permissionMode to control access",
        );
      } else if (deny?.length) {
        args.push("--disallowedTools", deny.join(","));
      }
    }
  }

  // Session identity
  if (options.name) {
    args.push("--name", options.name);
  }
  if (options.sessionId) {
    if (!isUUID(options.sessionId)) {
      throw new InvalidOptionError("sessionId", options.sessionId, "must be a valid UUID");
    }
    args.push("--session-id", options.sessionId);
  }
  if (options.noSessionPersistence) {
    args.push("--no-session-persistence");
  }

  // Performance
  if (options.bare) {
    args.push("--bare");
  }

  if (options.brief) {
    args.push("--brief");
  }

  // System prompt (inline text or file path — mutually exclusive)
  if (options.systemPrompt) {
    args.push("--system-prompt", options.systemPrompt);
  } else if (options.systemPromptFile) {
    args.push("--system-prompt-file", options.systemPromptFile);
  } else if (options.appendSystemPrompt) {
    args.push("--append-system-prompt", options.appendSystemPrompt);
  } else if (options.appendSystemPromptFile) {
    args.push("--append-system-prompt-file", options.appendSystemPromptFile);
  }

  // Structured output (JSON Schema)
  if (options.jsonSchema) {
    if (options.maxTurns === 1) {
      throw new InvalidOptionError(
        "jsonSchema",
        options.jsonSchema,
        "requires maxTurns > 1 (Claude needs an agentic turn to produce structured output)",
      );
    }
    const schemaJson = JSON.stringify(options.jsonSchema.schema);
    args.push("--json-schema", schemaJson);
  }

  // Max turns
  if (options.maxTurns !== undefined) {
    args.push("--max-turns", String(options.maxTurns));
  }

  // Max budget
  if (options.maxBudgetUsd !== undefined) {
    args.push("--max-budget-usd", String(options.maxBudgetUsd));
  }

  // Custom tools + MCP server handling
  if (typeof options.tools === "object" && options.tools.custom?.length) {
    const { startToolServer } = await import("../tool-server.js");
    const toolServer = await startToolServer(options.tools.custom);
    tempFiles.push(toolServer.tempDir);
    context.toolServerClose = toolServer.close;

    // Merge user MCP servers with ephemeral SDK server
    const existingMcp =
      options.mcpServers && Object.keys(options.mcpServers).length > 0 ? options.mcpServers : {};
    const mergedMcp = {
      ...existingMcp,
      sdk: {
        type: "stdio" as const,
        command: toolServer.command,
        args: toolServer.args,
        env: toolServer.env,
      },
    };
    const mcpConfig = { mcpServers: mergedMcp };
    const mcpConfigPath = await writeTempJson(mcpConfig, "claude-mcp");
    tempFiles.push(mcpConfigPath);
    args.push("--mcp-config", mcpConfigPath);
  } else if (options.mcpServers && Object.keys(options.mcpServers).length > 0) {
    // Standard MCP config (no custom tools)
    const mcpConfig = { mcpServers: options.mcpServers };
    const mcpConfigPath = await writeTempJson(mcpConfig, "claude-mcp");
    tempFiles.push(mcpConfigPath);
    args.push("--mcp-config", mcpConfigPath);
  }

  // Additional MCP config files
  if (options.mcpConfigFiles?.length) {
    for (const configFile of options.mcpConfigFiles) {
      args.push("--mcp-config", configFile);
    }
  }

  // Agent definitions (CLI expects JSON object keyed by agent name)
  if (options.agents && Object.keys(options.agents).length > 0) {
    const agentsJson = JSON.stringify(options.agents);
    args.push("--agents", agentsJson);
  }

  // Agent name
  if (options.agent) {
    args.push("--agent", options.agent);
  }

  // Additional directories
  if (options.additionalDirectories?.length) {
    for (const dir of options.additionalDirectories) {
      args.push("--add-dir", dir);
    }
  }

  // Beta features
  if (options.betas?.length) {
    args.push("--betas", options.betas.join(","));
  }

  // Settings (file path or inline JSON string)
  if (options.settings) {
    args.push("--settings", options.settings);
  }

  // Plugin directories
  if (options.pluginDirs?.length) {
    for (const dir of options.pluginDirs) {
      args.push("--plugin-dir", dir);
    }
  }

  // Disable slash commands
  if (options.disableSlashCommands) {
    args.push("--disable-slash-commands");
  }

  // Strict MCP config
  if (options.strictMcpConfig) {
    args.push("--strict-mcp-config");
  }

  // Setting sources
  if (options.settingSources?.length) {
    args.push("--setting-sources", options.settingSources.join(","));
  }

  // Include partial messages
  if (options.includePartialMessages) {
    args.push("--include-partial-messages");
  }

  if (options.replayUserMessages) {
    args.push("--replay-user-messages");
  }
}

export async function buildCliArgs(prompt: string, options: Options = {}): Promise<BuiltArgs> {
  // Custom tools not supported in query mode (no stdin for tool results)
  if (
    typeof options.tools === "object" &&
    "custom" in options.tools &&
    options.tools.custom?.length
  ) {
    throw new InvalidOptionError(
      "tools.custom",
      options.tools.custom,
      "custom tools are only supported with createConversation(), not query()",
    );
  }

  const args: string[] = ["-p", prompt];
  const tempFiles: string[] = [];
  const context: { toolServerClose?: () => Promise<void> } = {};

  // Output format — always use stream-json for streaming
  // --verbose is required when using stream-json (CLI 2.1.71+)
  args.push("--output-format", "stream-json", "--verbose");

  // Fallback model (query-only)
  if (options.fallbackModel) {
    args.push("--fallback-model", options.fallbackModel);
  }

  // Session control (query-only)
  if (options.resume) {
    args.push("--resume", options.resume);
  } else if (options.continue) {
    args.push("--continue");
  }

  // Fork session (used with --resume or --continue)
  if (options.forkSession) {
    args.push("--fork-session");
  }

  // Runtime guards (query-only)
  if (options.maxTurns !== undefined && options.maxTurns <= 0) {
    throw new InvalidOptionError("maxTurns", options.maxTurns, "must be > 0");
  }
  if (options.maxBudgetUsd !== undefined && options.maxBudgetUsd <= 0) {
    throw new InvalidOptionError("maxBudgetUsd", options.maxBudgetUsd, "must be > 0");
  }

  await buildCommonArgs(args, tempFiles, options, context);

  return { args, tempFiles, toolServerClose: context.toolServerClose };
}

// ============================================
// CONVERSATION ARG BUILDER
// ============================================

/**
 * Build CLI args for persistent conversation mode (--input-format stream-json).
 * Reuses common option-mapping logic but omits session control and uses persistent mode flags.
 */
export async function buildConversationArgs(options: ConversationOptions = {}): Promise<BuiltArgs> {
  const args: string[] = [
    "-p",
    "",
    "--output-format",
    "stream-json",
    "--input-format",
    "stream-json",
    "--verbose",
  ];
  const tempFiles: string[] = [];
  const context: { toolServerClose?: () => Promise<void> } = {};

  // Resume a previous session
  if (options.resume) {
    args.push("--resume", options.resume);
  }

  await buildCommonArgs(args, tempFiles, options, context);

  return { args, tempFiles, toolServerClose: context.toolServerClose };
}

logger.debug("cli module loaded");
