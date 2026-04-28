import type { ToolDefinitionSummary, ToolRegistry, ToolResult } from "@praxis/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Mock @nklisch/claude-cli-sdk before importing tool-bridge
vi.mock("@nklisch/claude-cli-sdk", () => {
  const capturedTools: Array<{ name: string; handler: (input: unknown) => Promise<unknown> }> = [];

  const tool = vi.fn(
    (
      name: string,
      _description: string,
      _inputSchema: unknown,
      handler: (input: unknown) => Promise<unknown>,
    ) => {
      const def = { name, handler };
      capturedTools.push(def);
      return def;
    },
  );

  const startToolServer = vi.fn(
    async (tools: Array<{ name: string; handler: (input: unknown) => Promise<unknown> }>) => {
      return {
        command: "/usr/bin/node",
        args: ["/tmp/mcp-worker.js"],
        env: { CLAUDE_SDK_TOOL_SOCKET: "/tmp/mcp.sock" },
        tempDir: "/tmp",
        close: vi.fn(async () => {}),
        _tools: tools,
      };
    },
  );

  return { tool, startToolServer, _capturedTools: capturedTools };
});

describe("startToolBridge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns handle with correct shape", async () => {
    const { startToolBridge } = await import("../mcp/tool-bridge.js");

    const echoSummary: ToolDefinitionSummary = {
      name: "test.echo",
      description: "Echo tool",
      inputSchemaJson: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
      inputSchemaNative: z.object({ text: z.string() }),
      tier: "deterministic",
    };

    const dispatchMock = vi.fn(async (name: string, args: unknown): Promise<ToolResult> => {
      if (name === "test.echo" && typeof args === "object" && args !== null && "text" in args) {
        return {
          ok: true,
          value: { echoed: (args as { text: string }).text },
          tier: "deterministic",
        };
      }
      return {
        ok: false,
        error: { code: "tool.not_found", message: "not found", recoverable: false },
      };
    });

    const registry: ToolRegistry = {
      list: () => [echoSummary],
      dispatch: dispatchMock,
    };

    const handle = await startToolBridge({ registry });

    expect(handle.command).toBe("/usr/bin/node");
    expect(handle.args).toEqual(["/tmp/mcp-worker.js"]);
    expect(Object.keys(handle.env).length).toBeGreaterThan(0);
    expect(handle.serverName).toBe("praxis");
    expect(handle.toolNames).toEqual(["test.echo"]);
    expect(typeof handle.close).toBe("function");
  });

  it("custom serverName is passed through", async () => {
    const { startToolBridge } = await import("../mcp/tool-bridge.js");

    const registry: ToolRegistry = {
      list: () => [],
      dispatch: async () => ({ ok: false, error: { code: "x", message: "x", recoverable: false } }),
    };

    const handle = await startToolBridge({ registry, serverName: "my-server" });
    expect(handle.serverName).toBe("my-server");
  });

  it("dispatch routes through registry.dispatch", async () => {
    // Re-import with mocked module after clearing
    const { startToolBridge } = await import("../mcp/tool-bridge.js");
    const { startToolServer } = await import("@nklisch/claude-cli-sdk");

    const dispatchMock = vi.fn(
      async (): Promise<ToolResult> => ({
        ok: true,
        value: { echoed: "hello" },
        tier: "deterministic",
      }),
    );

    const echoSummary: ToolDefinitionSummary = {
      name: "test.echo",
      description: "Echo tool",
      inputSchemaJson: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
      inputSchemaNative: z.object({ text: z.string() }),
      tier: "deterministic",
    };

    const registry: ToolRegistry = {
      list: () => [echoSummary],
      dispatch: dispatchMock,
    };

    await startToolBridge({ registry });

    // Get the tool that was registered with startToolServer
    const calls = (startToolServer as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    const registeredTools = calls[calls.length - 1]?.[0] as Array<{
      name: string;
      handler: (input: unknown) => Promise<unknown>;
    }>;
    expect(registeredTools).toHaveLength(1);

    // Invoke the handler to assert dispatch is called
    const toolDef = registeredTools[0];
    expect(toolDef).toBeDefined();
    if (toolDef) {
      await toolDef.handler({ text: "hello" });
      expect(dispatchMock).toHaveBeenCalledWith("test.echo", { text: "hello" });
    }
  });

  it("close() is idempotent and exits cleanly", async () => {
    const { startToolBridge } = await import("../mcp/tool-bridge.js");
    const registry: ToolRegistry = {
      list: () => [],
      dispatch: async () => ({ ok: false, error: { code: "x", message: "x", recoverable: false } }),
    };
    const handle = await startToolBridge({ registry });
    await expect(handle.close()).resolves.toBeUndefined();
    await expect(handle.close()).resolves.toBeUndefined();
  });
});
