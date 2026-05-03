import type { McpServerConfig } from "../types/index.js";
import type { HookEvent, HookMatcher } from "./hooks.js";
import type { GeneratedFile, SkillConfig } from "./skills.js";
import { buildSkill } from "./skills.js";

// ============================================
// PLUGIN BUILDER
// ============================================

/** Configuration for generating a plugin directory structure. */
export interface PluginConfig {
  /** Plugin name (kebab-case). */
  name: string;
  /** Plugin description. */
  description?: string;
  /** Semantic version. */
  version?: string;
  /** Author info. */
  author?: { name: string; email?: string; url?: string };
  /** License (SPDX identifier). */
  license?: string;
  /** Skills to include, keyed by skill name. */
  skills?: Record<string, SkillConfig>;
  /** Hook definitions (written to hooks/hooks.json). */
  hooks?: Partial<Record<HookEvent, HookMatcher[]>>;
  /** MCP server definitions (written to .mcp.json). */
  mcpServers?: Record<string, McpServerConfig>;
  /** Additional files to include. */
  files?: GeneratedFile[];
}

export interface GeneratedPlugin {
  /** Map of relative path → file content. */
  files: Map<string, string>;
}

/**
 * Generate a complete plugin directory structure.
 * Returns a map of file paths to contents — caller writes to disk or temp dir.
 *
 * @example
 * const plugin = buildPlugin({
 *   name: 'my-linter',
 *   skills: {
 *     lint: {
 *       description: 'Run linter',
 *       instructions: 'Run eslint on $ARGUMENTS',
 *       allowedTools: ['Bash'],
 *     },
 *   },
 * });
 */
export function buildPlugin(config: PluginConfig): GeneratedPlugin {
  const files = new Map<string, string>();

  // plugin.json manifest
  const manifest: Record<string, unknown> = { name: config.name };
  if (config.description) manifest.description = config.description;
  if (config.version) manifest.version = config.version;
  if (config.author) manifest.author = config.author;
  if (config.license) manifest.license = config.license;

  files.set(".claude-plugin/plugin.json", JSON.stringify(manifest, null, 2));

  // Skills
  if (config.skills) {
    for (const [skillName, skillConfig] of Object.entries(config.skills)) {
      const skill = buildSkill({ ...skillConfig, name: skillConfig.name ?? skillName });
      files.set(`skills/${skillName}/${skill.path}`, skill.content);
    }
  }

  // Hooks
  if (config.hooks && Object.keys(config.hooks).length > 0) {
    files.set("hooks/hooks.json", JSON.stringify({ hooks: config.hooks }, null, 2));
  }

  // MCP servers
  if (config.mcpServers && Object.keys(config.mcpServers).length > 0) {
    files.set(".mcp.json", JSON.stringify({ mcpServers: config.mcpServers }, null, 2));
  }

  // Additional files
  if (config.files) {
    for (const file of config.files) {
      files.set(file.path, file.content);
    }
  }

  return { files };
}

/**
 * Write a GeneratedPlugin to a directory on disk.
 * Creates the directory and all subdirectories as needed.
 * Returns the absolute path to the plugin root.
 */
export async function writePlugin(plugin: GeneratedPlugin, targetDir: string): Promise<string> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { dirname, resolve, join } = await import("node:path");

  const absDir = resolve(targetDir);

  for (const [relPath, content] of plugin.files) {
    const fullPath = join(absDir, relPath);
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, content, "utf8");
  }

  return absDir;
}

/**
 * Write a GeneratedPlugin to a temporary directory.
 * Returns the absolute path — pass to `pluginDirs`.
 */
export async function writePluginToTemp(plugin: GeneratedPlugin): Promise<string> {
  const { mkdtemp } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");

  const dir = await mkdtemp(join(tmpdir(), "claude-plugin-"));
  return writePlugin(plugin, dir);
}
