import type { HookEvent, HookMatcher } from "./hooks.js";

// ============================================
// SKILL BUILDER
// ============================================

export interface GeneratedFile {
  /** Relative path within the skill/plugin directory */
  path: string;
  /** File content */
  content: string;
}

/** Configuration for generating a SKILL.md file. */
export interface SkillConfig {
  /** Skill name (lowercase, hyphens, numbers). Defaults to directory name. */
  name?: string;
  /** Description — Claude uses this to decide when to auto-invoke. */
  description: string;
  /** The skill's instruction content (markdown). */
  instructions: string;
  /** Hint shown during autocomplete (e.g. "[filename] [format]"). */
  argumentHint?: string;
  /** If true, only the user can invoke via /name. Default: false. */
  disableModelInvocation?: boolean;
  /** If false, hidden from / menu. Default: true. */
  userInvocable?: boolean;
  /** Tools the skill can use without permission. */
  allowedTools?: string[];
  /** Model to use when skill is active. */
  model?: string;
  /** Run in forked subagent context. */
  context?: "fork";
  /** Subagent type when context is fork. */
  agent?: "Explore" | "Plan" | "general-purpose" | string;
  /** Hooks scoped to this skill. */
  hooks?: Partial<Record<HookEvent, HookMatcher[]>>;
}

/**
 * Generate a SKILL.md file from a typed config.
 *
 * @example
 * const skill = buildSkill({
 *   name: 'code-review',
 *   description: 'Reviews code for quality issues',
 *   allowedTools: ['Read', 'Grep', 'Glob'],
 *   instructions: 'Review $ARGUMENTS for bugs and style issues.',
 * });
 * // skill.path → 'SKILL.md'
 * // skill.content → '---\nname: code-review\n...\n---\nReview $ARGUMENTS...'
 */
export function buildSkill(config: SkillConfig): GeneratedFile {
  const frontmatter: Record<string, unknown> = {};

  if (config.name) frontmatter["name"] = config.name;
  frontmatter["description"] = config.description;
  if (config.argumentHint) frontmatter["argument-hint"] = config.argumentHint;
  if (config.disableModelInvocation) frontmatter["disable-model-invocation"] = true;
  if (config.userInvocable === false) frontmatter["user-invocable"] = false;
  if (config.allowedTools?.length) frontmatter["allowed-tools"] = config.allowedTools.join(", ");
  if (config.model) frontmatter["model"] = config.model;
  if (config.context) frontmatter["context"] = config.context;
  if (config.agent) frontmatter["agent"] = config.agent;
  if (config.hooks) frontmatter["hooks"] = config.hooks;

  const yaml = serializeYaml(frontmatter);
  const content = `---\n${yaml}---\n\n${config.instructions}\n`;

  return { path: "SKILL.md", content };
}

/**
 * Minimal YAML serializer for skill frontmatter.
 * Handles strings, booleans, numbers, and the hooks nested structure.
 */
function serializeYaml(obj: Record<string, unknown>, indent = 0): string {
  const pad = "  ".repeat(indent);
  let out = "";

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out += `${pad}${key}: ${value}\n`;
    } else if (Array.isArray(value)) {
      out += `${pad}${key}:\n`;
      for (const item of value) {
        if (typeof item === "object" && item !== null) {
          out += `${pad}  - `;
          const lines = serializeYaml(item as Record<string, unknown>, indent + 2)
            .split("\n")
            .filter(Boolean);
          out += lines[0]!.trimStart() + "\n";
          for (const line of lines.slice(1)) {
            out += `${pad}    ${line.trimStart()}\n`;
          }
        } else {
          out += `${pad}  - ${item}\n`;
        }
      }
    } else if (typeof value === "object" && value !== null) {
      out += `${pad}${key}:\n`;
      out += serializeYaml(value as Record<string, unknown>, indent + 1);
    }
  }

  return out;
}
