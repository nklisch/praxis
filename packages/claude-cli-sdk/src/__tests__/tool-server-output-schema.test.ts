/**
 * Tests for startToolServer outputSchema validation (Unit 6).
 *
 * Exercises the Unix socket protocol directly: connect, write a tool-call
 * message, read the response. No real CLI or MCP worker needed.
 */

import * as net from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import type { ToolServerHandle } from "../tool-server.js";
import { startToolServer } from "../tool-server.js";
import { tool } from "../tools.js";

// ── helpers ───────────────────────────────────────────────────────────────────

/** Connect to the socket and write/read one JSON message.
 *  Sends the auth frame as the first line — the server gates connections
 *  on it now. The token is read from the handle's env. */
async function callTool(
  socketPath: string,
  token: string,
  name: string,
  input: unknown,
): Promise<{ success: boolean; value?: unknown; error?: string }> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath);
    let buffer = "";

    client.on("connect", () => {
      const id = "test-1";
      // Auth frame first, then the tool call. Both on the same connection.
      client.write(`${JSON.stringify({ type: "auth", token })}\n`);
      client.write(`${JSON.stringify({ id, name, input })}\n`);
    });

    client.on("data", (chunk) => {
      buffer += chunk.toString();
      const newlineIdx = buffer.indexOf("\n");
      if (newlineIdx !== -1) {
        const line = buffer.slice(0, newlineIdx);
        client.destroy();
        try {
          const msg = JSON.parse(line) as {
            id: string;
            result: { success: boolean; value?: unknown; error?: string };
          };
          resolve(msg.result);
        } catch (err) {
          reject(err);
        }
      }
    });

    client.on("error", reject);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

/** Extract the socket path from a ToolServerHandle — always present by contract. */
function socketPath(h: ToolServerHandle): string {
  // biome-ignore lint/style/noNonNullAssertion: CLAUDE_SDK_TOOL_SOCKET is always set by startToolServer
  return h.env.CLAUDE_SDK_TOOL_SOCKET!;
}

describe("tool() outputSchema", () => {
  let handle: ToolServerHandle;

  afterEach(async () => {
    await handle?.close();
  });

  it("validates handler return value when outputSchema is set — accepts good shape", async () => {
    const OutputSchema = z.object({ count: z.number() });

    const myTool = tool(
      "count_words",
      "count words",
      z.object({ text: z.string() }),
      async ({ text }) => ({ success: true as const, value: { count: text.split(" ").length } }),
      OutputSchema,
    );

    handle = await startToolServer([myTool]);
    const result = await callTool(
      socketPath(handle),
      handle.env.CLAUDE_SDK_TOOL_TOKEN!,
      "count_words",
      {
        text: "hello world foo",
      },
    );

    expect(result.success).toBe(true);
    expect(result.value).toEqual({ count: 3 });
  });

  it("returns { success: false, error } when validation fails — bad shape rejected", async () => {
    const OutputSchema = z.object({ count: z.number() });

    const badTool = tool(
      "bad_counter",
      "returns wrong shape",
      z.object({ text: z.string() }),
      // biome-ignore lint/suspicious/noExplicitAny: intentional bad shape for test
      async (_input) => ({ success: true as const, value: { notCount: "oops" } as any }),
      OutputSchema,
    );

    handle = await startToolServer([badTool]);
    const result = await callTool(
      socketPath(handle),
      handle.env.CLAUDE_SDK_TOOL_TOKEN!,
      "bad_counter",
      {
        text: "hello",
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("failed its outputSchema");
  });

  it("forwards the Zod-parsed value (not the original) on success", async () => {
    // Zod's coercion: z.coerce.number() converts string "42" → number 42
    const OutputSchema = z.object({ value: z.coerce.number() });

    const coerceTool = tool(
      "coerce_tool",
      "returns coercible value",
      z.object({ input: z.string() }),
      // biome-ignore lint/suspicious/noExplicitAny: intentional string where number expected
      async (_input) => ({ success: true as const, value: { value: "42" as any } }),
      OutputSchema,
    );

    handle = await startToolServer([coerceTool]);
    const result = await callTool(
      socketPath(handle),
      handle.env.CLAUDE_SDK_TOOL_TOKEN!,
      "coerce_tool",
      {
        input: "x",
      },
    );

    // Zod-parsed value is the coerced number 42, not the original string "42"
    expect(result.success).toBe(true);
    expect(result.value).toEqual({ value: 42 });
  });

  it("does not validate when outputSchema is absent — passes value through unchanged", async () => {
    const noSchemaT = tool(
      "pass_through",
      "no output schema",
      z.object({ data: z.unknown() }),
      async ({ data }) => ({ success: true as const, value: data }),
      // no outputSchema
    );

    handle = await startToolServer([noSchemaT]);
    const result = await callTool(
      socketPath(handle),
      handle.env.CLAUDE_SDK_TOOL_TOKEN!,
      "pass_through",
      {
        data: { arbitrary: true, nested: [1, 2, 3] },
      },
    );

    expect(result.success).toBe(true);
    expect(result.value).toEqual({ arbitrary: true, nested: [1, 2, 3] });
  });
});
