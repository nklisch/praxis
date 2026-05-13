/**
 * Bootstrap mode toolNames — regression tests.
 *
 * Guards against re-introducing tools that are invalid in bootstrap sessions
 * (no courseId, no confirmed course) and verifies the expected tool set.
 */
import { describe, expect, it } from "vitest";
import { bootstrapMode } from "../bootstrap.js";
import { configureMode } from "../configure.js";

describe("bootstrapMode.toolNames — excluded tools", () => {
  it("does NOT include course.attach_document (bootstrap sessions have no courseId; handler throws)", () => {
    expect(bootstrapMode.toolNames).not.toContain("course.attach_document");
  });

  it("course.attach_document IS still in configureMode.toolNames (course-scoped sessions only)", () => {
    // Symmetry guard: the tool was removed from bootstrapMode but must remain available
    // in configureMode where a confirmed courseId is always in scope.
    expect(configureMode.toolNames).toContain("course.attach_document");
  });
});

describe("bootstrapMode.toolNames — included tools", () => {
  it("includes course.list_library_documents", () => {
    expect(bootstrapMode.toolNames).toContain("course.list_library_documents");
  });

  it("includes course.start_exploration", () => {
    expect(bootstrapMode.toolNames).toContain("course.start_exploration");
  });

  it("includes course.show_draft", () => {
    expect(bootstrapMode.toolNames).toContain("course.show_draft");
  });

  it("includes course.edit_draft", () => {
    expect(bootstrapMode.toolNames).toContain("course.edit_draft");
  });

  it("includes course.confirm_draft", () => {
    expect(bootstrapMode.toolNames).toContain("course.confirm_draft");
  });

  it("includes course.discard_draft", () => {
    expect(bootstrapMode.toolNames).toContain("course.discard_draft");
  });

  it("includes course.list_canonical_packs", () => {
    expect(bootstrapMode.toolNames).toContain("course.list_canonical_packs");
  });

  it("includes course.use_canonical_pack", () => {
    expect(bootstrapMode.toolNames).toContain("course.use_canonical_pack");
  });

  it("includes retrieve_from_documents", () => {
    expect(bootstrapMode.toolNames).toContain("retrieve_from_documents");
  });

  it("includes ask_student_question", () => {
    expect(bootstrapMode.toolNames).toContain("ask_student_question");
  });
});
