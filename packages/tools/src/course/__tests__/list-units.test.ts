/**
 * Tests for the course.list_units tool handler.
 */
import type { CourseCreateService } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { listUnitsTool } from "../list-units.js";

const UNIT_FIXTURE = {
  draftUnitId: "unit-1",
  name: "Foundations",
  summary: "Core concepts",
  lessonCount: 3,
  hasSummative: false,
};

describe("course.list_units handler", () => {
  it("returns units array on success", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      listUnits: vi.fn().mockResolvedValue([UNIT_FIXTURE]),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "draft-1",
    });

    const result = await listUnitsTool.handler({ draftId: "draft-1" }, ctx);

    expect(result.units).toHaveLength(1);
    expect(result.units[0]).toMatchObject(UNIT_FIXTURE);
    expect(bootstrap.listUnits).toHaveBeenCalledWith("draft-1");
  });

  it("uses ctx.draftId when args.draftId is not provided", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      listUnits: vi.fn().mockResolvedValue([]),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "ctx-draft",
    });

    await listUnitsTool.handler({} as { draftId: string }, ctx);

    expect(bootstrap.listUnits).toHaveBeenCalledWith("ctx-draft");
  });

  it("throws when draft does not exist — locks the throw-contract chosen over empty+warning to distinguish 'caller error' from 'legitimate empty state'", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      listUnits: vi.fn().mockResolvedValue(null),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "ghost-draft",
    });

    await expect(listUnitsTool.handler({ draftId: "ghost-draft" }, ctx)).rejects.toThrow(
      /ghost-draft/,
    );
  });

  it("throws when no draftId is available", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      listUnits: vi.fn(),
    };
    const ctx = makeToolContext({ services: { bootstrap: bootstrap as CourseCreateService } });

    await expect(listUnitsTool.handler({} as { draftId: string }, ctx)).rejects.toThrow(
      /draftId is required/,
    );
    expect(bootstrap.listUnits).not.toHaveBeenCalled();
  });

  it("has correct name, tier, and effects", () => {
    expect(listUnitsTool.name).toBe("course.list_units");
    expect(listUnitsTool.tier).toBe("grounded");
    expect(listUnitsTool.effects).toContain("none");
  });
});
