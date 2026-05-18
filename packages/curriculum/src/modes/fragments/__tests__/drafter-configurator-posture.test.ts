/**
 * Tests asserting that bootstrap and configure fragments carry the correct
 * drafter / configurator posture tokens added by
 * epic-backend-fills-for-redesign-drafter-configurator-chat-parent-prompt-updates.
 *
 * These are phrasing-token tests, not snapshots — resilient to small wording
 * edits while still catching a regression of the whole posture.
 */

import { describe, expect, it } from "vitest";
import { bootstrapRoleFragment } from "../bootstrap-role.js";
import { bootstrapToolsFragment } from "../bootstrap-tools.js";
import { configureRoleFragment } from "../configure-role.js";
import { configureToolsFragment } from "../configure-tools.js";

// ── Bootstrap role — drafter posture ───────────────────────────────────────

describe("bootstrapRoleFragment — drafter posture", () => {
  it("identifies Praxis as the drafter", () => {
    expect(bootstrapRoleFragment.template).toContain("drafter");
  });

  it("uses the 'Praxis drafts; you steer' tag line", () => {
    expect(bootstrapRoleFragment.template).toContain("Praxis drafts");
  });

  it("instructs liberal authoring-tool calls without asking permission", () => {
    expect(bootstrapRoleFragment.template).toContain("don't ask permission");
  });

  it("mentions that authoring tools execute immediately", () => {
    expect(bootstrapRoleFragment.template).toContain("executes immediately");
  });

  it("mentions ↶ revert as the undo affordance", () => {
    expect(bootstrapRoleFragment.template).toContain("revert");
  });

  it("describes when to invoke course.start_drafting as a sub-agent", () => {
    expect(bootstrapRoleFragment.template).toContain("sub-agent");
    expect(bootstrapRoleFragment.template).toContain("course.start_drafting");
  });

  it("does not use the word 'explorer' for the sub-agent from the user's perspective", () => {
    // The term 'explorer' must not appear as a user-visible agent name.
    // The tool name 'start_drafting' is fine — that is a code identifier.
    const withoutToolRefs = bootstrapRoleFragment.template.replace(/course\.start_drafting/g, "");
    expect(withoutToolRefs).not.toMatch(/\bexplorer\b/i);
  });

  it("instructs immediate tool calls on directives with brief post-call confirmation", () => {
    expect(bootstrapRoleFragment.template).toContain("Act on chat directives immediately");
    expect(bootstrapRoleFragment.template).toContain("call the relevant authoring tool now");
  });
});

// ── Bootstrap tools — drafter posture ──────────────────────────────────────

describe("bootstrapToolsFragment — drafter posture", () => {
  it("mentions ↶ revert for course.edit_draft", () => {
    expect(bootstrapToolsFragment.template).toContain("revert");
  });

  it("describes course.start_drafting as a sub-agent (not 'explorer')", () => {
    expect(bootstrapToolsFragment.template).toContain("sub-agent");
  });

  it("instructs liberal authoring-tool calls", () => {
    expect(bootstrapToolsFragment.template).toContain("Act on chat directives immediately");
  });

  it("does not use the word 'explorer' in user-visible description (outside tool name)", () => {
    const withoutToolRefs = bootstrapToolsFragment.template.replace(/course\.start_drafting/g, "");
    expect(withoutToolRefs).not.toMatch(/\bexplorer\b/i);
  });
});

// ── Configure role — configurator posture ──────────────────────────────────

describe("configureRoleFragment — configurator posture", () => {
  it("identifies Praxis as the configurator", () => {
    expect(configureRoleFragment.template).toContain("configurator");
  });

  it("instructs liberal authoring-tool calls without asking permission when intent is clear", () => {
    expect(configureRoleFragment.template).toContain("act on chat directives immediately");
  });

  it("mentions that authoring tools execute immediately", () => {
    expect(configureRoleFragment.template).toContain("executes immediately");
  });

  it("mentions ↶ revert as the undo affordance", () => {
    expect(configureRoleFragment.template).toContain("revert");
  });

  it("instructs execute-first on unambiguous directives", () => {
    expect(configureRoleFragment.template).toContain("Execute first");
  });

  it("does not use the word 'explorer' in user-visible strings", () => {
    expect(configureRoleFragment.template).not.toMatch(/\bexplorer\b/i);
  });
});

// ── Configure tools — configurator posture ─────────────────────────────────

describe("configureToolsFragment — configurator posture", () => {
  it("mentions ↶ revert for authoring tools", () => {
    expect(configureToolsFragment.template).toContain("revert");
  });

  it("describes course.start_drafting as a sub-agent (not 'explorer')", () => {
    expect(configureToolsFragment.template).toContain("sub-agent");
  });

  it("instructs liberal authoring-tool calls", () => {
    expect(configureToolsFragment.template).toContain("Act on unambiguous directives immediately");
  });

  it("does not use the word 'explorer' as a user-visible agent name", () => {
    const withoutToolRefs = configureToolsFragment.template.replace(/course\.start_drafting/g, "");
    expect(withoutToolRefs).not.toMatch(/\bexplorer\b/i);
  });
});
