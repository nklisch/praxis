/**
 * Tests for ConversationOptions.resume → CLI arg pass-through (Unit 5).
 *
 * The CLI's --resume flag is the native session-continuity mechanism. Praxis
 * relies on it to skip the text-splice fallback when re-opening a session
 * with the same engine. These tests pin the flag to the option so a refactor
 * of the arg builder can't silently regress it.
 */

import { describe, expect, it } from "vitest";
import { buildConversationArgs } from "../cli/args.js";

describe("buildConversationArgs — resume", () => {
  it("passes --resume <id> when ConversationOptions.resume is set", async () => {
    const { args } = await buildConversationArgs({ resume: "cli-session-abc" });
    const resumeIdx = args.indexOf("--resume");
    expect(resumeIdx).toBeGreaterThanOrEqual(0);
    expect(args[resumeIdx + 1]).toBe("cli-session-abc");
  });

  it("does not pass --resume when resume is omitted", async () => {
    const { args } = await buildConversationArgs({});
    expect(args).not.toContain("--resume");
  });

  it("preserves --resume alongside other flags (model, mcp config, system prompt)", async () => {
    const { args } = await buildConversationArgs({
      resume: "cli-session-xyz",
      model: "sonnet",
      systemPrompt: "You are a tutor.",
    });
    const resumeIdx = args.indexOf("--resume");
    expect(resumeIdx).toBeGreaterThanOrEqual(0);
    expect(args[resumeIdx + 1]).toBe("cli-session-xyz");
    expect(args).toContain("--model");
    expect(args).toContain("sonnet");
    expect(args).toContain("--system-prompt");
    expect(args).toContain("You are a tutor.");
  });
});
