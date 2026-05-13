import type { ToolDefinitionSummary, ToolRegistry, ToolResult } from "@praxis/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Mock @praxis/claude-cli-sdk before importing tool-bridge
vi.mock("@praxis/claude-cli-sdk", () => {
  const capturedTools: Array<{
    name: string;
    handler: (input: unknown, meta: { callId: string }) => Promise<unknown>;
  }> = [];

  const tool = vi.fn(
    (
      name: string,
      _description: string,
      _inputSchema: unknown,
      handler: (input: unknown, meta: { callId: string }) => Promise<unknown>,
    ) => {
      const def = { name, handler };
      capturedTools.push(def);
      return def;
    },
  );

  const startToolServer = vi.fn(
    async (
      tools: Array<{
        name: string;
        handler: (input: unknown, meta: { callId: string }) => Promise<unknown>;
      }>,
    ) => {
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
    const { startToolServer } = await import("@praxis/claude-cli-sdk");

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
      handler: (input: unknown, meta: { callId: string }) => Promise<unknown>;
    }>;
    expect(registeredTools).toHaveLength(1);

    // Invoke the handler to assert dispatch is called
    const toolDef = registeredTools[0];
    expect(toolDef).toBeDefined();
    if (toolDef) {
      await toolDef.handler({ text: "hello" }, { callId: "1" });
      expect(dispatchMock).toHaveBeenCalledWith(
        "test.echo",
        { text: "hello" },
        expect.objectContaining({ callId: expect.any(String) }),
      );
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

  it("bridge passes the SDK-provided callId (not a generated uuid) to registry.dispatch", async () => {
    const { startToolBridge } = await import("../mcp/tool-bridge.js");
    const { startToolServer } = await import("@praxis/claude-cli-sdk");

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

    const calls = (startToolServer as ReturnType<typeof vi.fn>).mock.calls;
    const registeredTools = calls[calls.length - 1]?.[0] as Array<{
      name: string;
      handler: (input: unknown, meta: { callId: string }) => Promise<unknown>;
    }>;

    const toolDef = registeredTools?.[0];
    if (toolDef) {
      await toolDef.handler({ text: "hello" }, { callId: "1" });
      await toolDef.handler({ text: "world" }, { callId: "2" });

      const callId1 = (dispatchMock.mock.calls[0]?.[2] as { callId?: string })?.callId;
      const callId2 = (dispatchMock.mock.calls[1]?.[2] as { callId?: string })?.callId;
      // The bridge must forward the SDK-supplied id, not generate its own
      expect(callId1).toBe("1");
      expect(callId2).toBe("2");
    }
  });

  /**
   * Cross-channel agreement test: the callId on the engine's `tool_call` event
   * (event.toolId from Claude Code SDK) must equal the callId that the tool
   * handler observes via ctx.callId. Both originate from the SDK's callCounter.
   *
   * This is the test that would have caught the prior implementation gap where
   * the bridge generated a uuidv7() while the adapter emitted event.toolId.
   */
  it("cross-channel: engine event callId matches handler ctx.callId for the same invocation", async () => {
    const { startToolBridge } = await import("../mcp/tool-bridge.js");
    const { startToolServer } = await import("@praxis/claude-cli-sdk");

    // The callId that the handler receives from ctx (via registry.dispatch meta)
    let observedCtxCallId: string | undefined;

    const dispatchMock = vi.fn(
      async (_name: string, _args: unknown, meta: { callId?: string }): Promise<ToolResult> => {
        observedCtxCallId = meta.callId;
        return { ok: true, value: { ok: true }, tier: "deterministic" };
      },
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

    const calls = (startToolServer as ReturnType<typeof vi.fn>).mock.calls;
    const registeredTools = calls[calls.length - 1]?.[0] as Array<{
      name: string;
      handler: (input: unknown, meta: { callId: string }) => Promise<unknown>;
    }>;

    const toolDef = registeredTools?.[0];
    expect(toolDef).toBeDefined();
    if (toolDef) {
      // Simulate what the SDK worker does: it sends { id: callCounter, name, input }
      // over the socket; handleToolCall calls handler(input, { callId: msg.id }).
      // The same msg.id becomes event.toolId in the Claude Code adapter's tool_use event.
      // Here we simulate the SDK passing callId "3" (the third call counter value).
      const sdkToolId = "3";
      await toolDef.handler({ text: "hello" }, { callId: sdkToolId });

      // The ctx.callId the handler sees must equal the SDK's toolId
      expect(observedCtxCallId).toBe(sdkToolId);

      // Crucially: this was broken before the fix, where the bridge generated
      // a uuidv7() so observedCtxCallId would be a 36-char uuid while the
      // engine event would carry "3".
      expect(observedCtxCallId).not.toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
  });

  it("getSignal is called at dispatch time and threads signal into registry.dispatch", async () => {
    const { startToolBridge } = await import("../mcp/tool-bridge.js");
    const { startToolServer } = await import("@praxis/claude-cli-sdk");

    const ac = new AbortController();
    // Simulate the per-turn signal ref: starts undefined, set when send() starts.
    let currentSignal: AbortSignal | undefined;
    const getSignal = (): AbortSignal | undefined => currentSignal;

    let observedSignal: AbortSignal | undefined = undefined;
    const dispatchMock = vi.fn(
      async (
        _name: string,
        _args: unknown,
        meta: { callId?: string; signal?: AbortSignal },
      ): Promise<ToolResult> => {
        observedSignal = meta.signal;
        return { ok: true, value: { ok: true }, tier: "deterministic" };
      },
    );

    const echoSummary: ToolDefinitionSummary = {
      name: "test.echo",
      description: "Echo",
      inputSchemaJson: { type: "object", properties: {}, required: [] },
      inputSchemaNative: z.object({}),
      tier: "deterministic",
    };

    const registry: ToolRegistry = {
      list: () => [echoSummary],
      dispatch: dispatchMock,
    };

    await startToolBridge({ registry, getSignal });

    const calls = (startToolServer as ReturnType<typeof vi.fn>).mock.calls;
    const registeredTools = calls[calls.length - 1]?.[0] as Array<{
      name: string;
      handler: (input: unknown, meta: { callId: string }) => Promise<unknown>;
    }>;
    const toolDef = registeredTools?.[0];
    expect(toolDef).toBeDefined();
    if (toolDef) {
      // Before a send() turn starts: no signal.
      await toolDef.handler({}, { callId: "1" });
      expect(observedSignal).toBeUndefined();

      // Simulate send() starting: set the current signal.
      currentSignal = ac.signal;
      await toolDef.handler({}, { callId: "2" });
      expect(observedSignal).toBe(ac.signal);

      // Simulate send() ending (finally): clear the signal.
      currentSignal = undefined;
      await toolDef.handler({}, { callId: "3" });
      expect(observedSignal).toBeUndefined();
    }
  });

  it("signal is not included in dispatch when getSignal is absent", async () => {
    const { startToolBridge } = await import("../mcp/tool-bridge.js");
    const { startToolServer } = await import("@praxis/claude-cli-sdk");

    let observedMeta: { callId?: string; signal?: AbortSignal } | undefined;
    const dispatchMock = vi.fn(
      async (
        _name: string,
        _args: unknown,
        meta: { callId?: string; signal?: AbortSignal },
      ): Promise<ToolResult> => {
        observedMeta = meta;
        return { ok: true, value: { ok: true }, tier: "deterministic" };
      },
    );

    const echoSummary: ToolDefinitionSummary = {
      name: "test.echo",
      description: "Echo",
      inputSchemaJson: { type: "object", properties: {}, required: [] },
      inputSchemaNative: z.object({}),
      tier: "deterministic",
    };

    const registry: ToolRegistry = {
      list: () => [echoSummary],
      dispatch: dispatchMock,
    };

    // No getSignal passed — simulates adapters that don't supply a signal.
    await startToolBridge({ registry });

    const calls = (startToolServer as ReturnType<typeof vi.fn>).mock.calls;
    const registeredTools = calls[calls.length - 1]?.[0] as Array<{
      name: string;
      handler: (input: unknown, meta: { callId: string }) => Promise<unknown>;
    }>;
    const toolDef = registeredTools?.[0];
    if (toolDef) {
      await toolDef.handler({}, { callId: "1" });
      expect(observedMeta?.signal).toBeUndefined();
    }
  });
});
