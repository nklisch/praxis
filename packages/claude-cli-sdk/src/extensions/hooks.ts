// ============================================
// HOOK TYPES
// ============================================

/**
 * Hook event names — lifecycle points where custom logic can execute.
 *
 * Used as keys in {@link SettingsConfig.hooks}, {@link SkillConfig.hooks}, and
 * {@link PluginConfig.hooks}.
 *
 * - `PreToolUse` / `PostToolUse` / `PostToolUseFailure` — Before/after tool calls.
 * - `UserPromptSubmit` — When the user sends a message.
 * - `Notification` — When Claude sends a notification.
 * - `Stop` / `StopFailure` — When the session ends normally/with error.
 * - `SubagentStart` / `SubagentStop` — Sub-agent lifecycle.
 * - `SessionStart` / `SessionEnd` — Session lifecycle.
 * - `TaskCompleted` — When an agentic task completes.
 * - `PostCompact` — After context compaction.
 * - `Elicitation` / `ElicitationResult` — Interactive prompts.
 */
export type HookEvent =
  | "PreToolUse"
  | "PostToolUse"
  | "PostToolUseFailure"
  | "UserPromptSubmit"
  | "Notification"
  | "Stop"
  | "StopFailure"
  | "SubagentStart"
  | "SubagentStop"
  | "SessionStart"
  | "SessionEnd"
  | "TaskCompleted"
  | "PostCompact"
  | "Elicitation"
  | "ElicitationResult";

/**
 * A hook action to execute when a {@link HookMatcher} matches.
 *
 * - `'command'` — Run a shell command. Set `command`.
 * - `'http'` — Send an HTTP request. Set `url`.
 * - `'prompt'` — Inject a prompt message.
 * - `'agent'` — Spawn a sub-agent.
 */
export interface HookHandler {
  /** Hook type — determines which field to set. */
  type: "command" | "http" | "prompt" | "agent";
  /** Shell command to run (for `type: 'command'`). */
  command?: string;
  /** URL to call (for `type: 'http'`). */
  url?: string;
  /** Timeout in milliseconds. */
  timeout?: number;
  /** If `true`, hook runs asynchronously (doesn't block the session). */
  async?: boolean;
  /** Status message shown while the hook is running. */
  statusMessage?: string;
}

/**
 * A hook matcher — pairs an optional tool/event filter with hook handlers.
 *
 * @example
 * // Run a linter before every Bash tool call:
 * { matcher: 'Bash', hooks: [{ type: 'command', command: './lint.sh' }] }
 *
 * // Run on all events (no matcher filter):
 * { hooks: [{ type: 'command', command: 'echo "hook fired"' }] }
 */
export interface HookMatcher {
  /** Tool name or pattern to match (omit to match all events of this type). */
  matcher?: string;
  /** Hook handlers to execute when matched. */
  hooks: HookHandler[];
}
