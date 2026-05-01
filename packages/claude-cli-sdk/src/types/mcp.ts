// ============================================
// MCP SERVER CONFIG
// ============================================

/**
 * MCP server launched as a subprocess communicating via stdin/stdout.
 *
 * @example
 * { type: 'stdio', command: 'npx', args: ['@gmail/mcp-server'], env: { API_KEY: '...' } }
 */
export interface McpServerStdioConfig {
  type: 'stdio';
  /** Command to execute (e.g. `'npx'`, `'node'`, `'python'`). */
  command: string;
  /** Command arguments. */
  args?: string[];
  /** Additional environment variables for the subprocess. */
  env?: Record<string, string>;
}

/**
 * MCP server connected via Server-Sent Events (SSE) transport.
 *
 * @example
 * { type: 'sse', url: 'http://localhost:3000/sse' }
 */
export interface McpServerSseConfig {
  type: 'sse';
  /** SSE endpoint URL. */
  url: string;
  /** Additional HTTP headers. */
  headers?: Record<string, string>;
}

/**
 * MCP server connected via Streamable HTTP transport.
 *
 * @example
 * { type: 'http', url: 'http://localhost:3000/mcp' }
 */
export interface McpServerHttpConfig {
  type: 'http';
  /** HTTP endpoint URL. */
  url: string;
  /** Additional HTTP headers. */
  headers?: Record<string, string>;
}

/**
 * MCP server configuration — discriminate on `type`.
 *
 * Pass a record of these to {@link OptionsBase.mcpServers}:
 * ```ts
 * query('...', {
 *   mcpServers: {
 *     github: { type: 'stdio', command: 'npx', args: ['@github/mcp'] },
 *     api: { type: 'http', url: 'http://localhost:3000/mcp' },
 *   },
 * })
 * ```
 *
 * Tools from MCP servers appear as `mcp__<serverName>__<toolName>`.
 * Use `toolPattern.mcp('serverName', 'toolName')` to reference them.
 */
export type McpServerConfig = McpServerStdioConfig | McpServerSseConfig | McpServerHttpConfig;
