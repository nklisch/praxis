import * as fs from "node:fs/promises";
import { createRequire } from "node:module";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import type { ToolDefinition, ToolResult } from "./types/index.js";
import { createLogger } from "./utils.js";

/** Resolve the ESM entry points of @modelcontextprotocol/sdk absolutely. */
function resolveMcpSdkPaths(): {
  mcpServerIndexPath: string;
  mcpStdioPath: string;
  mcpTypesPath: string;
} {
  const require = createRequire(import.meta.url);
  // require.resolve returns CJS path; swap dist/cjs → dist/esm for ESM entry points
  const mcpStdioCjs = require.resolve("@modelcontextprotocol/sdk/server/stdio.js");
  const mcpServerIndexCjs = require.resolve("@modelcontextprotocol/sdk/server/index.js");
  const mcpTypesCjs = require.resolve("@modelcontextprotocol/sdk/types.js");
  return {
    mcpServerIndexPath: mcpServerIndexCjs.replace("/dist/cjs/", "/dist/esm/"),
    mcpStdioPath: mcpStdioCjs.replace("/dist/cjs/", "/dist/esm/"),
    mcpTypesPath: mcpTypesCjs.replace("/dist/cjs/", "/dist/esm/"),
  };
}

const logger = createLogger("tool-server");

/** Serializable tool schema (no handler — handlers run in the parent process). */
interface ToolSchema {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/**
 * Handle returned by {@link startToolServer}.
 *
 * Contains the MCP server config fields (`command`, `args`, `env`) needed to
 * register the ephemeral tool server with the CLI. The SDK uses these internally
 * when you pass `tools.custom` — you only need this for advanced use cases.
 */
export interface ToolServerHandle {
  /** Node executable path — use as `command` in MCP stdio config. */
  command: string;
  /** Worker script path — use as `args` in MCP stdio config. */
  args: string[];
  /** Environment variables including `CLAUDE_SDK_TOOL_SOCKET` path. */
  env: Record<string, string>;
  /** Temp directory containing socket and worker script (cleaned up by `close()`). */
  tempDir: string;
  /** Stop the IPC server, close connections, and remove temp files. */
  close: () => Promise<void>;
}

/**
 * Start an ephemeral MCP tool server for custom tool definitions.
 *
 * **You usually don't need to call this directly.** Pass `tools.custom` to
 * `createConversation()` and the SDK manages the server lifecycle.
 *
 * **Architecture:**
 * 1. Creates a Unix domain socket for tool call dispatch.
 * 2. Writes a temp MCP worker script that the CLI spawns as a stdio MCP server.
 * 3. When the CLI calls a custom tool, the worker sends `{ id, name, input }`
 *    over the socket → this server dispatches to the matching handler →
 *    result is sent back → worker returns it to the CLI.
 *
 * **Requires**: `@modelcontextprotocol/sdk` peer dependency installed.
 *
 * @param tools - Array of {@link ToolDefinition} objects (create with {@link tool}).
 * @returns A {@link ToolServerHandle} with MCP config and cleanup function.
 */
export async function startToolServer(tools: ToolDefinition[]): Promise<ToolServerHandle> {
  const handlers = new Map<string, (input: unknown) => Promise<ToolResult> | ToolResult>();
  const schemas: ToolSchema[] = [];

  for (const t of tools) {
    const jsonSchema = z.toJSONSchema(t.inputSchema) as Record<string, unknown>;
    // Remove $schema — MCP doesn't want it
    delete jsonSchema["$schema"];
    schemas.push({ name: t.name, description: t.description, inputSchema: jsonSchema });
    handlers.set(t.name, t.handler as (input: unknown) => Promise<ToolResult> | ToolResult);
  }

  // Create temp dir for socket and worker script
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-sdk-tools-"));
  const socketPath = path.join(tempDir, "handler.sock");
  const workerPath = path.join(tempDir, "mcp-worker.mjs");

  // Write worker script with absolute MCP SDK paths (so it works from any dir)
  const { mcpServerIndexPath, mcpStdioPath, mcpTypesPath } = resolveMcpSdkPaths();
  await fs.writeFile(
    workerPath,
    generateWorkerScript(schemas, mcpServerIndexPath, mcpStdioPath, mcpTypesPath),
    "utf8",
  );

  // Start Unix domain socket server for handler dispatch
  const server = net.createServer((conn) => {
    let buffer = "";
    conn.on("data", (chunk) => {
      buffer += chunk.toString();
      // Protocol: newline-delimited JSON
      let newlineIdx: number;
      while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newlineIdx);
        buffer = buffer.slice(newlineIdx + 1);
        if (line.trim()) {
          handleToolCall(conn, handlers, line);
        }
      }
    });
    conn.on("error", (err) => {
      logger.debug("Tool server connection error", { err: err.message });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.listen(socketPath, () => resolve());
    server.on("error", reject);
  });

  logger.debug("Tool server listening", { socketPath, tools: schemas.map((s) => s.name) });

  return {
    command: process.execPath,
    args: [workerPath],
    env: { CLAUDE_SDK_TOOL_SOCKET: socketPath },
    tempDir,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
      logger.debug("Tool server closed", { socketPath });
    },
  };
}

async function handleToolCall(
  conn: net.Socket,
  handlers: Map<string, (input: unknown) => Promise<ToolResult> | ToolResult>,
  line: string,
): Promise<void> {
  let msgId: string | undefined;
  try {
    const msg = JSON.parse(line) as { id: string; name: string; input: unknown };
    msgId = msg.id;
    const handler = handlers.get(msg.name);
    if (!handler) {
      conn.write(
        JSON.stringify({
          id: msg.id,
          result: { success: false, error: `Unknown tool: ${msg.name}` },
        }) + "\n",
      );
      return;
    }
    const result = await handler(msg.input);
    conn.write(JSON.stringify({ id: msg.id, result }) + "\n");
  } catch (err) {
    // Best-effort error response
    if (msgId !== undefined) {
      try {
        conn.write(
          JSON.stringify({ id: msgId, result: { success: false, error: String(err) } }) + "\n",
        );
      } catch {
        // ignore
      }
    }
  }
}

function generateWorkerScript(
  schemas: ToolSchema[],
  mcpServerIndexPath: string,
  mcpStdioPath: string,
  mcpTypesPath: string,
): string {
  return `import { Server } from ${JSON.stringify(mcpServerIndexPath)};
import { StdioServerTransport } from ${JSON.stringify(mcpStdioPath)};
import { ListToolsRequestSchema, CallToolRequestSchema } from ${JSON.stringify(mcpTypesPath)};
import * as net from 'node:net';

const SOCKET_PATH = process.env.CLAUDE_SDK_TOOL_SOCKET;
if (!SOCKET_PATH) {
  process.stderr.write('CLAUDE_SDK_TOOL_SOCKET not set\\n');
  process.exit(1);
}

// Connect to SDK handler dispatch socket
const conn = net.createConnection(SOCKET_PATH);
await new Promise((resolve, reject) => {
  conn.on('connect', resolve);
  conn.on('error', reject);
});

let callCounter = 0;
const pending = new Map();

// Handle responses from SDK
let buffer = '';
conn.on('data', (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf('\\n')) !== -1) {
    const line = buffer.slice(0, idx);
    buffer = buffer.slice(idx + 1);
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      const resolve = pending.get(msg.id);
      if (resolve) {
        pending.delete(msg.id);
        resolve(msg.result);
      }
    } catch {}
  }
});

async function callHandler(name, input) {
  const id = String(++callCounter);
  return new Promise((resolve) => {
    pending.set(id, resolve);
    conn.write(JSON.stringify({ id, name, input }) + '\\n');
  });
}

// Use low-level Server to avoid Zod schema wrapping issues with plain JSON schemas
const server = new Server({ name: 'sdk', version: '1.0.0' }, {
  capabilities: { tools: {} },
});

const schemas = ${JSON.stringify(schemas)};

// Handle tools/list — return our JSON schemas directly
server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: schemas.map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema,
  })),
}));

// Handle tools/call — dispatch raw arguments to SDK process via socket
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const result = await callHandler(name, args ?? {});
  if (result.success) {
    return { content: [{ type: 'text', text: result.content }] };
  } else {
    return { content: [{ type: 'text', text: result.error }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
`;
}
