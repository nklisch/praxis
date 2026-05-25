/**
 * Tests for claude-cli spawn hardening:
 *
 * 1. detached: true — CLI subprocess gets its own process group so we can
 *    group-kill its entire subtree (MCP workers, Electron shims, etc.) on
 *    session close or desktop shutdown.
 *
 * 2. killProcessGroup — SIGTERMs the process group, schedules a deferred
 *    SIGKILL for any lingerers. Passes cleanly when the group is already gone
 *    (ESRCH from signal(2)).
 *
 * 3. strictMcpConfig in buildConversationArgs — the flag must be emitted when
 *    mcpServers is present so the CLI ignores user-level MCP servers from
 *    ~/.claude/settings.json (prevents the krometrail-leak class of bug).
 *
 * Process-lifecycle tests that would require real subprocess spawning or
 * real OS timers are tested via mocks / fake timers. Tests that can't be
 * deterministically asserted without a real subprocess are documented as
 * manual verification recipes in the story body.
 */

import { type ChildProcess, type SpawnOptions as NodeSpawnOptions, spawn } from "node:child_process";
import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildConversationArgs } from "../args.js";
import { killProcessGroup } from "../spawn.js";

// ============================================
// Helpers
// ============================================

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    spawn: vi.fn(actual.spawn),
  };
});

describe("spawnCli — detached process group", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("spawns with detached:true so the CLI subprocess gets its own process group", async () => {
    // Import after mocking so we get the mocked spawn.
    const { spawnCli } = await import("../spawn.js");
    const spawnMock = vi.mocked(spawn);

    // Spawn with an impossible command so it exits immediately.
    const result = spawnCli(["--version"], {});

    // Verify detached:true was passed through to Node spawn options.
    expect(spawnMock).toHaveBeenCalledTimes(1);
    const spawnOpts = spawnMock.mock.calls[0]?.[2] as NodeSpawnOptions | undefined;
    expect(spawnOpts?.detached).toBe(true);

    // Cleanup — don't leave an orphan process open.
    result.proc.kill("SIGTERM");
    await result.cleanup();
  });
});

describe("killProcessGroup", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("sends SIGTERM to -pgid (the process group) on POSIX", () => {
    if (os.platform() === "win32") return; // skip on Windows

    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);
    vi.useFakeTimers();

    killProcessGroup(12345);

    // First call: SIGTERM to -pgid
    expect(killSpy).toHaveBeenCalledTimes(1);
    expect(killSpy).toHaveBeenCalledWith(-12345, "SIGTERM");

    // Advance past grace period: SIGKILL follow-up fires
    vi.advanceTimersByTime(3_001);
    expect(killSpy).toHaveBeenCalledTimes(2);
    expect(killSpy).toHaveBeenCalledWith(-12345, "SIGKILL");
  });

  it("swallows ESRCH from SIGTERM (process group already gone) without throwing", () => {
    if (os.platform() === "win32") return; // skip on Windows

    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
      const err = Object.assign(new Error("No such process"), { code: "ESRCH" });
      throw err;
    });
    vi.useFakeTimers();

    // Must not throw
    expect(() => killProcessGroup(99999)).not.toThrow();

    // No SIGKILL timer scheduled after ESRCH (early return)
    vi.advanceTimersByTime(10_000);
    expect(killSpy).toHaveBeenCalledTimes(1); // only the SIGTERM attempt
  });

  it("is a no-op on Windows (process.kill is never called)", () => {
    const osSpy = vi.spyOn(os, "platform").mockReturnValue("win32");
    const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true);

    killProcessGroup(12345);

    expect(killSpy).not.toHaveBeenCalled();

    osSpy.mockRestore();
  });
});

describe("buildConversationArgs — --strict-mcp-config (MCP user-config leak prevention)", () => {
  // The adapter (packages/engines/src/claude-code/adapter.ts) sets
  // strictMcpConfig: true on every createConversation() call so the CLI only
  // loads MCP servers from our --mcp-config file, ignoring user-level servers
  // from ~/.claude/settings.json. The SDK emits --strict-mcp-config when the
  // option is set. These tests verify the flag-emission path in buildConversationArgs.

  it("emits --strict-mcp-config when strictMcpConfig:true is set", async () => {
    // This is the exact path taken by the adapter — it always passes
    // strictMcpConfig: true alongside its mcpServers to prevent user-config bleed.
    const { args } = await buildConversationArgs({
      mcpServers: {
        praxis: { type: "stdio", command: "node", args: [], env: {} },
      },
      strictMcpConfig: true,
    });
    // The flag must be present so the CLI ignores user-level MCP servers
    // from ~/.claude/settings.json (krometrail-leak prevention).
    expect(args).toContain("--strict-mcp-config");
  });

  it("emits --strict-mcp-config when set without mcpServers (defense-in-depth)", async () => {
    const { args } = await buildConversationArgs({
      strictMcpConfig: true,
    });
    expect(args).toContain("--strict-mcp-config");
  });

  it("does NOT emit --strict-mcp-config when strictMcpConfig is omitted", async () => {
    const { args } = await buildConversationArgs({
      mcpServers: { praxis: { type: "stdio", command: "node", args: [], env: {} } },
    });
    expect(args).not.toContain("--strict-mcp-config");
  });
});
