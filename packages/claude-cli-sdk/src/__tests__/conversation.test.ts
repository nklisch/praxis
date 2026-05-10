/**
 * Tests for permissionMode resolution (Unit 7).
 *
 * The CLI's default permissionMode is "default", which prompts on every tool
 * call. Praxis drives the CLI non-interactively, so when an SDK consumer
 * registers MCP servers, we default the mode to "bypassPermissions" — there
 * is no human present to answer prompts. These tests pin the three resolution
 * cases so the default can't silently flip.
 */

import { describe, expect, it } from "vitest";
import { buildConversationArgs, resolvePermissionMode } from "../cli/args.js";

describe("resolvePermissionMode", () => {
  it("defaults to bypassPermissions when mcpServers is set and mode is omitted", () => {
    const mode = resolvePermissionMode({
      mcpServers: { praxis: { type: "stdio", command: "node", args: [], env: {} } },
    });
    expect(mode).toBe("bypassPermissions");
  });

  it("respects explicit permissionMode when provided (even with mcpServers set)", () => {
    const mode = resolvePermissionMode({
      permissionMode: "plan",
      mcpServers: { praxis: { type: "stdio", command: "node", args: [], env: {} } },
    });
    expect(mode).toBe("plan");
  });

  it("returns undefined when mcpServers is absent (CLI default kicks in)", () => {
    const mode = resolvePermissionMode({});
    expect(mode).toBeUndefined();
  });

  it("returns undefined when mcpServers is an empty record", () => {
    const mode = resolvePermissionMode({ mcpServers: {} });
    expect(mode).toBeUndefined();
  });

  it("returns undefined when dangerouslySkipPermissions is set (handled separately)", () => {
    const mode = resolvePermissionMode({ dangerouslySkipPermissions: true });
    expect(mode).toBeUndefined();
  });
});

describe("buildConversationArgs — permissionMode pass-through", () => {
  it("emits --permission-mode bypassPermissions when mcpServers is set without explicit mode", async () => {
    const { args } = await buildConversationArgs({
      mcpServers: { praxis: { type: "stdio", command: "node", args: [], env: {} } },
    });
    const idx = args.indexOf("--permission-mode");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe("bypassPermissions");
  });

  it("emits the explicit --permission-mode value when provided", async () => {
    const { args } = await buildConversationArgs({
      permissionMode: "acceptEdits",
      mcpServers: { praxis: { type: "stdio", command: "node", args: [], env: {} } },
    });
    const idx = args.indexOf("--permission-mode");
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(args[idx + 1]).toBe("acceptEdits");
  });

  it("does not emit --permission-mode when mcpServers is absent and no mode is set", async () => {
    const { args } = await buildConversationArgs({});
    expect(args).not.toContain("--permission-mode");
  });
});
