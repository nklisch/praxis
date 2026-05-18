/**
 * Unit tests for course.draft_add_concepts (batch) tool handler.
 * Verifies happy path, partial failure, draftId resolution, and per-item ordering.
 */
import type { CourseCreateService } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { draftAddConceptsTool } from "../draft-add-concepts.js";

describe("course.draft_add_concepts handler", () => {
  it("happy path — every concept added, ok:true, results in order", async () => {
    let count = 0;
    const bootstrap: Partial<CourseCreateService> = {
      addConcept: vi.fn().mockImplementation(async () => {
        count++;
        return { ok: true, conceptCount: count };
      }),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "draft-1",
    });

    const result = await draftAddConceptsTool.handler(
      {
        concepts: [
          { name: "Variables", description: "symbols" },
          { name: "Equations", description: "equality" },
          { name: "Inequalities", description: "comparison" },
        ],
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(result.conceptCount).toBe(3);
    expect(result.results).toHaveLength(3);
    expect(result.results.map((r) => r.name)).toEqual(["Variables", "Equations", "Inequalities"]);
    expect(result.results.every((r) => r.ok)).toBe(true);
    expect(bootstrap.addConcept).toHaveBeenCalledTimes(3);
  });

  it("partial failure — duplicates surface as per-item ok:false without aborting", async () => {
    let count = 0;
    const bootstrap: Partial<CourseCreateService> = {
      addConcept: vi.fn().mockImplementation(async (input: { name: string }) => {
        if (input.name === "Equations") {
          return { ok: false, reason: 'concept "Equations" already exists' };
        }
        count++;
        return { ok: true, conceptCount: count };
      }),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "draft-1",
    });

    const result = await draftAddConceptsTool.handler(
      {
        concepts: [
          { name: "Variables", description: "x" },
          { name: "Equations", description: "y" },
          { name: "Inequalities", description: "z" },
        ],
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.conceptCount).toBe(2); // last successful count
    expect(result.results[0]?.ok).toBe(true);
    expect(result.results[1]?.ok).toBe(false);
    expect(result.results[2]?.ok).toBe(true);
    if (result.results[1] && !result.results[1].ok) {
      expect(result.results[1].reason).toContain("already exists");
    }
    // Critical: the failure didn't stop the loop. All three were attempted.
    expect(bootstrap.addConcept).toHaveBeenCalledTimes(3);
  });

  it("returns per-item failures when no draftId available", async () => {
    const bootstrap: Partial<CourseCreateService> = { addConcept: vi.fn() };
    const ctx = makeToolContext({ services: { bootstrap: bootstrap as CourseCreateService } });

    const result = await draftAddConceptsTool.handler(
      {
        concepts: [
          { name: "A", description: "a" },
          { name: "B", description: "b" },
        ],
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.conceptCount).toBe(0);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => !r.ok)).toBe(true);
    expect(bootstrap.addConcept).not.toHaveBeenCalled();
  });

  it("uses args.draftId over ctx.draftId when both provided", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      addConcept: vi.fn().mockResolvedValue({ ok: true, conceptCount: 1 }),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "ctx-draft",
    });

    await draftAddConceptsTool.handler(
      { draftId: "arg-draft", concepts: [{ name: "A", description: "a" }] },
      ctx,
    );

    expect(bootstrap.addConcept).toHaveBeenCalledWith(
      expect.objectContaining({ draftId: "arg-draft" }),
    );
  });

  it("has correct name, tier, effects", () => {
    expect(draftAddConceptsTool.name).toBe("course.draft_add_concepts");
    expect(draftAddConceptsTool.tier).toBe("grounded");
    expect(draftAddConceptsTool.effects).toContain("artifact.mutate");
  });
});
