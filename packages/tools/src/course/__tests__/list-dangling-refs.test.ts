/**
 * Tests for the course.list_dangling_refs tool handler.
 */
import type { CourseCreateService } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { listDanglingRefsTool } from "../list-dangling-refs.js";

const CLEAN_REPORT = {
  orphanConcepts: [],
  danglingUnitMemberships: [],
  danglingLessonAssessments: [],
  edgesReferencingUnknownConcepts: [],
};

describe("course.list_dangling_refs handler", () => {
  it("returns clean report when draft is intact", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      listDanglingRefs: vi.fn().mockResolvedValue(CLEAN_REPORT),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "draft-1",
    });

    const result = await listDanglingRefsTool.handler({ draftId: "draft-1" }, ctx);

    expect(result).toEqual(CLEAN_REPORT);
    expect(bootstrap.listDanglingRefs).toHaveBeenCalledWith("draft-1");
  });

  it("uses ctx.draftId when args.draftId is not provided", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      listDanglingRefs: vi.fn().mockResolvedValue(CLEAN_REPORT),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "ctx-draft",
    });

    await listDanglingRefsTool.handler({} as { draftId: string }, ctx);

    expect(bootstrap.listDanglingRefs).toHaveBeenCalledWith("ctx-draft");
  });

  it("throws when draft does not exist — locks the throw-contract chosen over empty+warning to distinguish 'caller error' from 'legitimate empty state'", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      listDanglingRefs: vi.fn().mockResolvedValue(null),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "ghost-draft",
    });

    await expect(listDanglingRefsTool.handler({ draftId: "ghost-draft" }, ctx)).rejects.toThrow(
      /ghost-draft/,
    );
  });

  it("throws when no draftId is available", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      listDanglingRefs: vi.fn(),
    };
    const ctx = makeToolContext({ services: { bootstrap: bootstrap as CourseCreateService } });

    await expect(listDanglingRefsTool.handler({} as { draftId: string }, ctx)).rejects.toThrow(
      /draftId is required/,
    );
    expect(bootstrap.listDanglingRefs).not.toHaveBeenCalled();
  });

  it("forwards orphan concepts from the report", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      listDanglingRefs: vi.fn().mockResolvedValue({
        ...CLEAN_REPORT,
        orphanConcepts: ["Orphan1", "Orphan2"],
      }),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "d1",
    });

    const result = await listDanglingRefsTool.handler({ draftId: "d1" }, ctx);
    expect(result.orphanConcepts).toEqual(["Orphan1", "Orphan2"]);
  });

  it("has correct name, tier, and effects", () => {
    expect(listDanglingRefsTool.name).toBe("course.list_dangling_refs");
    expect(listDanglingRefsTool.tier).toBe("grounded");
    expect(listDanglingRefsTool.effects).toContain("none");
  });
});
