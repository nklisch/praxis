import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import { createRequire } from "node:module";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { z } from "zod";
import type { ToolDefinition, ToolResult } from "./types/index.js";
import { createLogger } from "./utils.js";

/** Environment variable name carrying the per-session auth token. */
const TOKEN_ENV = "CLAUDE_SDK_TOOL_TOKEN";

/** Auth-frame inactivity timeout — how long a connection has to present
 *  the auth frame before the server closes it. Generous (sub-millisecond
 *  is the real latency on a local socket) but big enough to absorb slow
 *  CI boxes. */
const AUTH_TIMEOUT_MS = 5000;

/** Constant-time comparison of two equal-length hex strings. Returns false
 *  on length mismatch or malformed input (never throws). */
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

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
  /** Environment variables: `CLAUDE_SDK_TOOL_SOCKET` (socket path) and
   *  `CLAUDE_SDK_TOOL_TOKEN` (per-session auth token, 64-char hex). The
   *  worker script reads both and presents the token on its first frame. */
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
 * 1. Generates a per-session 256-bit auth token.
 * 2. Creates a 0600 Unix domain socket for tool call dispatch.
 * 3. Writes a temp MCP worker script that the CLI spawns as a stdio MCP server.
 * 4. Worker presents the auth token on its first frame; server validates
 *    constant-time and closes any connection that fails.
 * 5. When the CLI calls a custom tool, the worker sends `{ id, name, input }`
 *    over the (now-authenticated) socket → this server dispatches to the
 *    matching handler → result is sent back → worker returns it to the CLI.
 *
 * **Requires**: `@modelcontextprotocol/sdk` peer dependency installed.
 *
 * @param tools - Array of {@link ToolDefinition} objects (create with {@link tool}).
 * @returns A {@link ToolServerHandle} with MCP config and cleanup function.
 */
export async function startToolServer(tools: ToolDefinition[]): Promise<ToolServerHandle> {
  const handlers = new Map<
    string,
    (input: unknown, meta: { callId: string }) => Promise<ToolResult> | ToolResult
  >();
  const outputSchemas = new Map<string, z.ZodType<unknown>>();
  const schemas: ToolSchema[] = [];

  for (const t of tools) {
    const jsonSchema = z.toJSONSchema(t.inputSchema) as Record<string, unknown>;
    // Remove $schema — MCP doesn't want it
    delete jsonSchema.$schema;
    schemas.push({ name: t.name, description: t.description, inputSchema: jsonSchema });
    handlers.set(
      t.name,
      t.handler as (input: unknown, meta: { callId: string }) => Promise<ToolResult> | ToolResult,
    );
    if (t.outputSchema) {
      outputSchemas.set(t.name, t.outputSchema as z.ZodType<unknown>);
    }
  }

  // Create temp dir for socket and worker script
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "claude-sdk-tools-"));
  const socketPath = path.join(tempDir, "handler.sock");
  const workerPath = path.join(tempDir, "mcp-worker.mjs");

  let server: net.Server | undefined;
  try {
    // Write worker script with absolute MCP SDK paths (so it works from any dir)
    const { mcpServerIndexPath, mcpStdioPath, mcpTypesPath } = resolveMcpSdkPaths();
    await fs.writeFile(
      workerPath,
      generateWorkerScript(schemas, mcpServerIndexPath, mcpStdioPath, mcpTypesPath),
      "utf8",
    );

    // Per-session auth token. 256 bits, hex-encoded to 64 chars. Generated
    // before the server starts so it's available to the connection handler
    // closure below and to the spawn env on the handle.
    const authToken = crypto.randomBytes(32).toString("hex");

    // Start Unix domain socket server for handler dispatch.
    // Each connection runs through an auth-frame gate before any tool call
    // is dispatched — see Unit 3 in feature
    // epic-security-hardening-round-2-tool-bridge-socket-auth.
    server = net.createServer((conn) => {
      let buffer = "";
      let authenticated = false;
      const authTimeout = setTimeout(() => {
        if (!authenticated) {
          logger.debug("Tool server auth timeout — closing connection");
          conn.destroy();
        }
      }, AUTH_TIMEOUT_MS);

      conn.on("data", (chunk) => {
        buffer += chunk.toString();
        let newlineIdx: number;
        // biome-ignore lint/suspicious/noAssignInExpressions: standard readline pattern
        while ((newlineIdx = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, newlineIdx);
          buffer = buffer.slice(newlineIdx + 1);
          if (!line.trim()) continue;

          if (!authenticated) {
            // First non-empty frame MUST be the auth frame.
            let accepted = false;
            try {
              const frame = JSON.parse(line) as { type?: string; token?: string };
              if (
                frame.type === "auth" &&
                typeof frame.token === "string" &&
                timingSafeEqualHex(frame.token, authToken)
              ) {
                authenticated = true;
                clearTimeout(authTimeout);
                accepted = true;
              }
            } catch {
              // fall through to deny
            }
            if (!accepted) {
              logger.debug("Tool server auth rejected — closing connection");
              conn.destroy();
              return;
            }
            continue;
          }

          handleToolCall(conn, handlers, outputSchemas, line);
        }
      });
      conn.on("close", () => clearTimeout(authTimeout));
      conn.on("error", (err) => {
        logger.debug("Tool server connection error", { err: err.message });
      });
    });

    // Socket permission tightening: apply restrictive umask around the listen
    // call so the socket inode is created 0600 regardless of inherited
    // process umask. Belt-and-suspenders with explicit chmod afterwards to
    // handle platforms where umask doesn't apply to AF_UNIX inodes (some BSDs).
    // Skip on Windows where AF_UNIX permission semantics don't apply.
    const prevUmask = process.umask(0o077);
    try {
      await new Promise<void>((resolve, reject) => {
        server?.listen(socketPath, () => resolve());
        server?.on("error", reject);
      });
    } finally {
      process.umask(prevUmask);
    }
    if (os.platform() !== "win32") {
      await fs.chmod(socketPath, 0o600).catch((err) => {
        logger.debug("Tool server chmod 0600 failed (non-fatal)", {
          socketPath,
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }

    logger.debug("Tool server listening", { socketPath, tools: schemas.map((s) => s.name) });

    return {
      command: process.execPath,
      args: [workerPath],
      env: {
        CLAUDE_SDK_TOOL_SOCKET: socketPath,
        [TOKEN_ENV]: authToken,
      },
      tempDir,
      close: async () => {
        if (server) {
          await closeServer(server);
        }
        await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
        logger.debug("Tool server closed", { socketPath });
      },
    };
  } catch (err) {
    if (server) {
      await closeServer(server);
    }
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
}

async function closeServer(server: net.Server): Promise<void> {
  if (!server.listening) {
    try {
      server.close();
    } catch {
      // Server was never opened or already closed.
    }
    return;
  }
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

async function handleToolCall(
  conn: net.Socket,
  handlers: Map<
    string,
    (input: unknown, meta: { callId: string }) => Promise<ToolResult> | ToolResult
  >,
  outputSchemas: Map<string, z.ZodType<unknown>>,
  line: string,
): Promise<void> {
  let msgId: string | undefined;
  try {
    const msg = JSON.parse(line) as { id: string; name: string; input: unknown };
    msgId = msg.id;
    const handler = handlers.get(msg.name);
    if (!handler) {
      conn.write(
        `${JSON.stringify({
          id: msg.id,
          result: { success: false, error: `Unknown tool: ${msg.name}` },
        })}\n`,
      );
      return;
    }
    const result = await handler(msg.input, { callId: msg.id });
    // When outputSchema is set, validate the handler's return value before sending.
    if (result.success) {
      const outputSchema = outputSchemas.get(msg.name);
      if (outputSchema) {
        const parsed = outputSchema.safeParse(result.value);
        if (!parsed.success) {
          const errResult: ToolResult = {
            success: false,
            error: `tool "${msg.name}" returned a value that failed its outputSchema: ${parsed.error.message}`,
          };
          conn.write(`${JSON.stringify({ id: msg.id, result: errResult })}\n`);
          return;
        }
        // Forward the Zod-parsed (possibly coerced) value, not the original.
        conn.write(
          `${JSON.stringify({ id: msg.id, result: { success: true, value: parsed.data } })}\n`,
        );
        return;
      }
    }
    conn.write(`${JSON.stringify({ id: msg.id, result })}\n`);
  } catch (err) {
    // Best-effort error response
    if (msgId !== undefined) {
      try {
        conn.write(
          `${JSON.stringify({ id: msgId, result: { success: false, error: String(err) } })}\n`,
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

const TOKEN = process.env.CLAUDE_SDK_TOOL_TOKEN;
if (!TOKEN) {
  process.stderr.write('CLAUDE_SDK_TOOL_TOKEN not set\\n');
  process.exit(1);
}

// Connect to SDK handler dispatch socket
const conn = net.createConnection(SOCKET_PATH);
await new Promise((resolve, reject) => {
  conn.on('connect', resolve);
  conn.on('error', reject);
});

// Auth handshake — server gates the connection on a valid auth frame as
// the first non-empty line. The server doesn't acknowledge; subsequent
// tool calls flow normally once authenticated.
conn.write(JSON.stringify({ type: 'auth', token: TOKEN }) + '\\n');

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

// Handle tools/call — dispatch raw arguments to SDK process via socket.
// SDK ToolResult now carries a structured value rather than a pre-stringified
// blob. We JSON-stringify here because MCP text blocks require strings on
// the wire; the CLI receive-side parser inverts that (text concat + JSON.parse)
// so consumers see the original structured value.
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const result = await callHandler(name, args ?? {});
  if (result.success) {
    return { content: [{ type: 'text', text: JSON.stringify(result.value) }] };
  } else {
    return { content: [{ type: 'text', text: result.error }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
`;
}
