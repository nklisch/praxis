import { createInterface } from "node:readline";
import { buildCliArgs, isErrnoException, parseStreamLine, spawnCli } from "./cli/index.js";
import { CLIError, CLINotFoundError, CLITimeoutError } from "./errors.js";
import type { DiscoverOptions } from "./types/index.js";
import { createLogger } from "./utils.js";

const logger = createLogger("discover");

/**
 * Result of {@link discoverTools} — the tools and MCP servers available
 * under a given configuration.
 */
export interface DiscoverResult {
  /** All tool names available (built-in + MCP + custom). */
  tools: string[];
  /** MCP server connection statuses (name + status). */
  mcpServers?: Array<{ name: string; status: string }>;
}

// ============================================
// DISCOVER TOOLS
// ============================================

const DISCOVER_TIMEOUT_MS = 30_000;

/**
 * Discover available tools by spawning a minimal CLI session.
 *
 * Spawns `claude -p "." --max-turns 1 --dangerously-skip-permissions` with the
 * provided config, reads the `SystemInitEvent` to extract available tools,
 * then kills the process. Takes ~2-3 seconds.
 *
 * Use this with {@link computeDisallowedTools} to implement an allowlist
 * (the `tools.only` shortcut does this automatically).
 *
 * @param options - Configuration affecting tool availability. See {@link DiscoverOptions}.
 * @returns Available tool names and MCP server statuses.
 *
 * @throws {CLINotFoundError} If the `claude` binary is not in PATH.
 * @throws {CLITimeoutError} If discovery exceeds 30 seconds.
 * @throws {CLIError} If the CLI exits before emitting the init event.
 *
 * @example
 * const { tools } = await discoverTools({
 *   mcpServers: { gmail: { type: 'stdio', command: 'npx', args: ['@gmail/mcp'] } },
 * });
 * console.log(tools);
 * // → ['Bash', 'Read', ..., 'mcp__gmail__list', 'mcp__gmail__read', ...]
 */
export async function discoverTools(options: DiscoverOptions = {}): Promise<DiscoverResult> {
  logger.debug("Starting tool discovery");

  // Build args — use dangerouslySkipPermissions so the discovery session doesn't prompt
  const { args, tempFiles } = await buildCliArgs(".", {
    maxTurns: 1,
    dangerouslySkipPermissions: true,
    mcpServers: options.mcpServers,
    strictMcpConfig: options.strictMcpConfig,
    pluginDirs: options.pluginDirs,
    settings: options.settings,
    settingSources: options.settingSources,
    additionalDirectories: options.additionalDirectories,
    workDir: options.workDir,
    env: options.env,
    betas: options.betas,
    agents: options.agents,
    disableSlashCommands: options.disableSlashCommands,
  });

  const { proc, cleanup } = spawnCli(
    args,
    { workDir: options.workDir, env: options.env },
    tempFiles,
  );

  return new Promise<DiscoverResult>((resolve, reject) => {
    let settled = false;
    let timedOut = false;

    const timeoutId = setTimeout(() => {
      timedOut = true;
      if (!settled) {
        settled = true;
        proc.kill("SIGTERM");
        cleanup().catch(() => {});
        reject(new CLITimeoutError(DISCOVER_TIMEOUT_MS));
      }
    }, DISCOVER_TIMEOUT_MS);

    // Handle ENOENT spawn error
    proc.on("error", (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      cleanup().catch(() => {});
      if (isErrnoException(err) && err.code === "ENOENT") {
        reject(new CLINotFoundError());
      } else {
        reject(err);
      }
    });

    // Handle unexpected exit before system_init
    proc.on("close", (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      cleanup().catch(() => {});
      if (!timedOut) {
        reject(new CLIError(code ?? 1, "Claude CLI exited before emitting system_init event"));
      }
    });

    const rl = createInterface({ input: proc.stdout! });

    rl.on("line", (line: string) => {
      if (settled) return;

      const event = parseStreamLine(line);
      if (event?.type === "system" && event.subtype === "init") {
        settled = true;
        clearTimeout(timeoutId);
        rl.close();
        proc.kill("SIGTERM");
        cleanup().catch(() => {});

        logger.debug("Tool discovery complete", {
          toolCount: event.tools?.length ?? 0,
          mcpServerCount: event.mcpServers?.length ?? 0,
        });

        resolve({
          tools: event.tools ?? [],
          mcpServers: event.mcpServers,
        });
      }
    });
  });
}

// ============================================
// COMPUTE DISALLOWED TOOLS
// ============================================

const ALWAYS_ALLOWED = new Set(["ToolSearch"]);

/**
 * Compute the `disallowedTools` list from an allowlist and discovered tools.
 *
 * Returns tool names that are in `allTools` but NOT in `strictAllowed`.
 * `ToolSearch` is always auto-included in the allowlist (the model needs it
 * to resolve deferred tool schemas).
 *
 * Matching is exact — no glob or pattern support.
 *
 * @param allTools - All available tool names (from {@link discoverTools}).
 * @param strictAllowed - The tools you want to allow.
 * @returns Tool names to pass as `disallowedTools` to the CLI.
 *
 * @example
 * const { tools } = await discoverTools();
 * const disallowed = computeDisallowedTools(tools, ['Read', 'Grep', 'Glob']);
 * // disallowed contains everything except Read, Grep, Glob, and ToolSearch
 */
export function computeDisallowedTools(allTools: string[], strictAllowed: string[]): string[] {
  const allowSet = new Set(strictAllowed);
  // Auto-include ToolSearch — without it the model can't discover deferred tool schemas
  for (const t of ALWAYS_ALLOWED) allowSet.add(t);
  return allTools.filter((tool) => !allowSet.has(tool));
}
