// ============================================
// TOOL PATTERN HELPERS
// ============================================

/** Helpers for building tool permission patterns (--allowedTools / --disallowedTools). */
export const toolPattern = {
  /**
   * Bash command pattern.
   * @example toolPattern.bash('git *')   → 'Bash(git *)'
   * @example toolPattern.bash()          → 'Bash'
   */
  bash(pattern?: string): string {
    return pattern ? `Bash(${pattern})` : 'Bash';
  },

  /**
   * Read file pattern. Uses gitignore-style paths.
   * @example toolPattern.read('src/**\/*.ts') → 'Read(src/**\/*.ts)'
   * @example toolPattern.read()               → 'Read'
   */
  read(pattern?: string): string {
    return pattern ? `Read(${pattern})` : 'Read';
  },

  /**
   * Edit file pattern. Applies to all edit tools.
   * @example toolPattern.edit('/docs/**') → 'Edit(/docs/**)'
   * @example toolPattern.edit()           → 'Edit'
   */
  edit(pattern?: string): string {
    return pattern ? `Edit(${pattern})` : 'Edit';
  },

  /**
   * WebFetch domain pattern.
   * @example toolPattern.webFetch('example.com')  → 'WebFetch(domain:example.com)'
   * @example toolPattern.webFetch()                → 'WebFetch'
   */
  webFetch(domain?: string): string {
    return domain ? `WebFetch(domain:${domain})` : 'WebFetch';
  },

  /**
   * MCP tool pattern.
   * @example toolPattern.mcp('github', 'read_file') → 'mcp__github__read_file'
   * @example toolPattern.mcp('github')              → 'mcp__github'
   */
  mcp(server: string, tool?: string): string {
    return tool ? `mcp__${server}__${tool}` : `mcp__${server}`;
  },

  /**
   * Agent/subagent pattern.
   * @example toolPattern.agent('Explore') → 'Agent(Explore)'
   */
  agent(name: string): string {
    return `Agent(${name})`;
  },

  /**
   * Skill pattern.
   * @example toolPattern.skill('commit') → 'Skill(commit)'
   */
  skill(pattern: string): string {
    return `Skill(${pattern})`;
  },
} as const;
