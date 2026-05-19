/**
 * Course-create mode toolNames — regression tests.
 *
 * Guards against re-introducing tools that are invalid in course-create sessions
 * (no courseId, no confirmed course) and verifies the expected tool set.
 */
import { describe, expect, it } from "vitest";
import { configureMode } from "../configure.js";
import { courseCreateMode } from "../course-create.js";

describe("courseCreateMode.toolNames — excluded tools", () => {
  it("does NOT include course.attach_document (course-create sessions have no courseId; handler throws)", () => {
    expect(courseCreateMode.toolNames).not.toContain("course.attach_document");
  });

  it("course.attach_document IS still in configureMode.toolNames (course-scoped sessions only)", () => {
    // Symmetry guard: the tool was removed from courseCreateMode but must remain available
    // in configureMode where a confirmed courseId is always in scope.
    expect(configureMode.toolNames).toContain("course.attach_document");
  });
});

describe("courseCreateMode.toolNames — included tools", () => {
  it("includes course.list_library_documents", () => {
    expect(courseCreateMode.toolNames).toContain("course.list_library_documents");
  });

  it("includes course.start_drafting", () => {
    expect(courseCreateMode.toolNames).toContain("course.start_drafting");
  });

  it("includes course.show_draft", () => {
    expect(courseCreateMode.toolNames).toContain("course.show_draft");
  });

  it("includes course.edit_draft", () => {
    expect(courseCreateMode.toolNames).toContain("course.edit_draft");
  });

  it("includes course.confirm_draft", () => {
    expect(courseCreateMode.toolNames).toContain("course.confirm_draft");
  });

  it("includes course.discard_draft", () => {
    expect(courseCreateMode.toolNames).toContain("course.discard_draft");
  });

  it("includes course.list_canonical_packs", () => {
    expect(courseCreateMode.toolNames).toContain("course.list_canonical_packs");
  });

  it("includes course.use_canonical_pack", () => {
    expect(courseCreateMode.toolNames).toContain("course.use_canonical_pack");
  });

  it("includes retrieve_from_documents", () => {
    expect(courseCreateMode.toolNames).toContain("retrieve_from_documents");
  });

  it("includes ask_student_question", () => {
    expect(courseCreateMode.toolNames).toContain("ask_student_question");
  });
});
