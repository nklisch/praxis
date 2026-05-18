/**
 * Unit tests for course.draft_add_edges (batch) tool handler.
 */
import type { CourseCreateService } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { draftAddEdgesTool } from "../draft-add-edges.js";

const E = (
  fromName: string,
  toName: string,
  rationale = "needed",
  strength = 0.7,
): {
  fromName: string;
  toName: string;
  strength: number;
  rationale: string;
} => ({ fromName, toName, strength, rationale });

describe("course.draft_add_edges handler", () => {
  it("happy path — every edge added, ok:true", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      addEdge: vi.fn().mockResolvedValue({ ok: true }),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "draft-1",
    });

    const result = await draftAddEdgesTool.handler(
      {
        edges: [E("Variables", "Equations"), E("Equations", "Inequalities")],
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.ok)).toBe(true);
    expect(bootstrap.addEdge).toHaveBeenCalledTimes(2);
  });

  it("partial failure — unknown concept reported per-item, others succeed", async () => {
    const bootstrap: Partial<CourseCreateService> = {
      addEdge: vi.fn().mockImplementation(async (input: { fromName: string }) => {
        if (input.fromName === "Ghost") {
          return { ok: false, reason: 'concept "Ghost" not found' };
        }
        return { ok: true };
      }),
    };
    const ctx = makeToolContext({
      services: { bootstrap: bootstrap as CourseCreateService },
      draftId: "draft-1",
    });

    const result = await draftAddEdgesTool.handler(
      {
        edges: [E("Ghost", "Equations"), E("Variables", "Equations")],
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.results[0]?.ok).toBe(false);
    expect(result.results[1]?.ok).toBe(true);
    if (result.results[0] && !result.results[0].ok) {
      expect(result.results[0].reason).toContain("not found");
    }
    expect(bootstrap.addEdge).toHaveBeenCalledTimes(2);
  });

  it("missing draftId returns per-item failures with a descriptive reason", async () => {
    const bootstrap: Partial<CourseCreateService> = { addEdge: vi.fn() };
    const ctx = makeToolContext({ services: { bootstrap: bootstrap as CourseCreateService } });

    const result = await draftAddEdgesTool.handler({ edges: [E("A", "B")] }, ctx);

    expect(result.ok).toBe(false);
    expect(result.results).toHaveLength(1);
    if (result.results[0] && !result.results[0].ok) {
      expect(result.results[0].reason).toContain("draftId");
    }
    expect(bootstrap.addEdge).not.toHaveBeenCalled();
  });

  it("has correct name, tier, effects", () => {
    expect(draftAddEdgesTool.name).toBe("course.draft_add_edges");
    expect(draftAddEdgesTool.tier).toBe("grounded");
    expect(draftAddEdgesTool.effects).toContain("artifact.mutate");
  });
});
