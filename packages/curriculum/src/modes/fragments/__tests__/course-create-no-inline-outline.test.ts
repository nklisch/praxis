/**
 * Snapshot-style tests asserting that the course-create and configure prompt
 * fragments contain the "outline panel" restraint language added by
 * story-bootstrap-prompt-no-inline-outline.
 *
 * These tests are intentionally lightweight — they confirm that the key
 * phrases are present so a future edit doesn't silently regress the
 * behaviour guidance.
 */

import { describe, expect, it } from "vitest";
import { configureToolsFragment } from "../configure-tools.js";
import { courseCreateRoleFragment } from "../course-create-role.js";
import { courseCreateToolsFragment } from "../course-create-tools.js";

describe("courseCreateToolsFragment — outline-panel restraint", () => {
  it("mentions the right-side panel after course.show_draft / course.start_drafting", () => {
    expect(courseCreateToolsFragment.template).toContain("right-side panel");
  });

  it("instructs agent NOT to re-narrate the outline in chat", () => {
    expect(courseCreateToolsFragment.template).toContain("Do NOT re-narrate the outline in chat");
  });

  it("instructs agent to summarise in one sentence and ask what to do next", () => {
    expect(courseCreateToolsFragment.template).toContain("summarise it in one sentence");
    expect(courseCreateToolsFragment.template).toContain("what to do next");
  });

  it("designates the outline panel as the canonical view", () => {
    expect(courseCreateToolsFragment.template).toContain("outline panel is the canonical view");
  });
});

describe("courseCreateRoleFragment — chat discipline", () => {
  it("contains the 'Chat discipline' section", () => {
    expect(courseCreateRoleFragment.template).toContain("Chat discipline");
  });

  it("instructs agent that the outline panel renders automatically", () => {
    expect(courseCreateRoleFragment.template).toContain(
      "outline panel renders the full course structure automatically",
    );
  });

  it("instructs agent never to reproduce the outline in chat", () => {
    expect(courseCreateRoleFragment.template).toContain("Never reproduce the outline");
  });

  it("provides the one-sentence summary example", () => {
    expect(courseCreateRoleFragment.template).toContain("see the outline on the right");
  });
});

describe("configureToolsFragment — outline-panel restraint", () => {
  it("mentions the right-side panel after course.show_draft / course.start_drafting", () => {
    expect(configureToolsFragment.template).toContain("right-side panel");
  });

  it("instructs agent NOT to re-narrate the outline in chat", () => {
    expect(configureToolsFragment.template).toContain("Do NOT re-narrate the outline in chat");
  });

  it("designates the outline panel as the canonical view", () => {
    expect(configureToolsFragment.template).toContain("outline panel is the canonical view");
  });
});
