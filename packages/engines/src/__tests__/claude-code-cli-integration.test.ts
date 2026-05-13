/**
 * Integration smoke test: real ClaudeCodeEngine × real claude CLI × real MCP bridge.
 *
 * What this tests that unit tests cannot:
 *   The unit tests mock `createConversation` so they verify the SDK-call shape
 *   but never exercise the real `claude` CLI. That gap means CLI behavior
 *   changes — e.g. `--tools ""` being interpreted to also strip MCP tools —
 *   would be invisible in unit tests but catastrophic in a release (the tutor's
 *   entire toolset silently zeroed out).
 *
 *   This test opens a real engine against the installed `claude` CLI, registers
 *   a trivial echo tool through the MCP bridge, and asserts the model can call
 *   it. If `--tools ""` × MCP orthogonality ever breaks, this test catches it.
 *
 * Prerequisites (met only in real-world envs; hence the slow-test gate):
 *   - `claude` CLI installed and resolvable on PATH
 *   - Valid claude CLI auth (an active session)
 *   - Real network access to Anthropic
 *   - A few seconds of real model latency per test
 *
 * Run with:
 *   PRAXIS_RUN_SLOW_TESTS=1 pnpm vitest run packages/engines/src/__tests__/claude-code-cli-integration.test.ts
 */

import type { ToolRegistry, ToolResult } from "@praxis/core/types";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClaudeCodeEngine } from "../claude-code/adapter.js";
import type { EngineDeps } from "../types.js";

const runSlowTests = process.env.PRAXIS_RUN_SLOW_TESTS === "1";

// ---------------------------------------------------------------------------
// Shared deps — a minimal logger that writes to stderr so test output stays
// readable without swallowing useful debug lines on failure.
// ---------------------------------------------------------------------------
const log: EngineDeps["log"] = {
  debug: (...args) => {
    process.stderr.write(`[DEBUG] ${JSON.stringify(args)}\n`);
  },
  info: (...args) => {
    process.stderr.write(`[INFO] ${JSON.stringify(args)}\n`);
  },
  warn: (...args) => {
    process.stderr.write(`[WARN] ${JSON.stringify(args)}\n`);
  },
  error: (...args) => {
    process.stderr.write(`[ERROR] ${JSON.stringify(args)}\n`);
  },
  child: () => log,
};

// ---------------------------------------------------------------------------
// Echo tool registry: one tool that echoes its `message` input back.
// The model is instructed to call this tool; a successful round-trip proves
// `--tools ""` (no built-ins) and `--mcp-config` (Praxis tools) are orthogonal.
// ---------------------------------------------------------------------------
function makeEchoRegistry(): ToolRegistry {
  return {
    list: () => [
      {
        name: "test.echo",
        description:
          "Echo the provided message back verbatim. Call this tool with any message string.",
        inputSchemaJson: {
          type: "object",
          properties: {
            message: { type: "string", description: "The message to echo back." },
          },
          required: ["message"],
        },
        tier: "deterministic" as const,
      },
    ],
    dispatch: async (_name: string, args: unknown): Promise<ToolResult> => {
      const input = args as { message?: unknown };
      if (typeof input.message !== "string") {
        return {
          ok: false,
          error: {
            code: "echo.invalid_input",
            message: "message must be a string",
            recoverable: false,
          },
        };
      }
      return {
        ok: true,
        value: { echoed: input.message },
        tier: "deterministic",
      };
    },
  };
}

// ---------------------------------------------------------------------------
// The gated integration describe block.
// timeout: 60_000 — generous for CLI cold-start + one real model turn.
// ---------------------------------------------------------------------------
describe.skipIf(!runSlowTests)(
  "ClaudeCodeEngine (integration — real CLI + real MCP bridge)",
  { timeout: 60_000 },
  () => {
    const engine = new ClaudeCodeEngine({
      config: { engineId: "claude-code" },
      deps: { log },
    });

    // Shared session so we pay the bridge startup cost once.
    let session: Awaited<ReturnType<typeof engine.open>> | null = null;

    beforeAll(async () => {
      const echoRegistry = makeEchoRegistry();
      session = await engine.open({
        // Haiku is the fastest/cheapest model — adequate for a one-tool smoke test.
        systemPrompt:
          "You are a test assistant. When asked, call the test.echo tool with the exact message provided. Do not explain; just call the tool.",
        tools: echoRegistry,
      });
    });

    afterAll(async () => {
      await session?.close();
      session = null;
    });

    it("model invokes the echo MCP tool and receives the echo result", async () => {
      // The model should call test.echo and get the echoed value back.
      // We assert on the emitted EngineEvents to verify the full round-trip:
      //   tool_call event (model decided to call the tool)
      //   tool_result event (dispatch returned the echo value)
      //   model_message event (model produced at least some text output)

      if (!session) throw new Error("session not initialised — beforeAll failed");
      const events = [];
      for await (const event of session.send(
        "Please call the test.echo tool with the message 'hello from integration test'.",
      )) {
        events.push(event);
      }

      const toolCallEvent = events.find((e) => e.type === "tool_call");
      const toolResultEvent = events.find((e) => e.type === "tool_result");

      // Primary assertion: the tool was called. If --tools "" erroneously also
      // strips MCP tools this event would never appear.
      expect(toolCallEvent).toBeDefined();
      expect(toolCallEvent?.type === "tool_call" && toolCallEvent.toolName).toBe("test.echo");

      // Secondary assertion: the dispatch returned the correct echo value.
      // This proves the MCP bridge is alive and routing correctly.
      expect(toolResultEvent).toBeDefined();
      if (toolResultEvent?.type === "tool_result") {
        expect(toolResultEvent.result.ok).toBe(true);
        if (toolResultEvent.result.ok) {
          expect((toolResultEvent.result.value as { echoed?: string }).echoed).toBe(
            "hello from integration test",
          );
        }
      }

      // Sanity: the turn completed with at least a model_message or final event.
      const hasOutput = events.some((e) => e.type === "model_message" || e.type === "final");
      expect(hasOutput).toBe(true);
    });
  },
);
