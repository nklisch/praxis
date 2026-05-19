/**
 * Tests asserting that bootstrap and configure fragments carry the correct
 * drafter / configurator posture tokens added by
 * epic-backend-fills-for-redesign-drafter-configurator-chat-parent-prompt-updates.
 *
 * These are phrasing-token tests, not snapshots — resilient to small wording
 * edits while still catching a regression of the whole posture.
 */

import { describe, expect, it } from "vitest";
import { configureRoleFragment } from "../configure-role.js";
import { configureToolsFragment } from "../configure-tools.js";
import { courseCreateRoleFragment } from "../course-create-role.js";
import { courseCreateToolsFragment } from "../course-create-tools.js";

// ── Bootstrap role — drafter posture ───────────────────────────────────────

describe("courseCreateRoleFragment — drafter posture", () => {
  it("identifies Praxis as the drafter", () => {
    expect(courseCreateRoleFragment.template).toContain("drafter");
  });

  it("uses the 'Praxis drafts; you steer' tag line", () => {
    expect(courseCreateRoleFragment.template).toContain("Praxis drafts");
  });

  it("instructs liberal authoring-tool calls without asking permission", () => {
    expect(courseCreateRoleFragment.template).toContain("don't ask permission");
  });

  it("mentions that authoring tools execute immediately", () => {
    expect(courseCreateRoleFragment.template).toContain("executes immediately");
  });

  it("mentions ↶ revert as the undo affordance", () => {
    expect(courseCreateRoleFragment.template).toContain("revert");
  });

  it("describes when to invoke course.start_drafting as a sub-agent", () => {
    expect(courseCreateRoleFragment.template).toContain("sub-agent");
    expect(courseCreateRoleFragment.template).toContain("course.start_drafting");
  });

  it("does not use the word 'explorer' for the sub-agent from the user's perspective", () => {
    // The term 'explorer' must not appear as a user-visible agent name.
    // The tool name 'start_drafting' is fine — that is a code identifier.
    const withoutToolRefs = courseCreateRoleFragment.template.replace(
      /course\.start_drafting/g,
      "",
    );
    expect(withoutToolRefs).not.toMatch(/\bexplorer\b/i);
  });

  it("instructs immediate tool calls on directives with brief post-call confirmation", () => {
    expect(courseCreateRoleFragment.template).toContain("Act on chat directives immediately");
    expect(courseCreateRoleFragment.template).toContain("call the relevant authoring tool now");
  });
});

// ── Bootstrap tools — drafter posture ──────────────────────────────────────

describe("courseCreateToolsFragment — drafter posture", () => {
  it("mentions ↶ revert for course.edit_draft", () => {
    expect(courseCreateToolsFragment.template).toContain("revert");
  });

  it("describes course.start_drafting as a sub-agent (not 'explorer')", () => {
    expect(courseCreateToolsFragment.template).toContain("sub-agent");
  });

  it("instructs liberal authoring-tool calls", () => {
    expect(courseCreateToolsFragment.template).toContain("Act on chat directives immediately");
  });

  it("does not use the word 'explorer' in user-visible description (outside tool name)", () => {
    const withoutToolRefs = courseCreateToolsFragment.template.replace(
      /course\.start_drafting/g,
      "",
    );
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
