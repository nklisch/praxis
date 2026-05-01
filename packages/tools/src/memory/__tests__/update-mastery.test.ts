import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { updateMasteryTool } from "../update-mastery.js";

function makeCtx() {
  const conceptId = brandId<"ConceptId">("concept-1");
  const pKnown = 0.5;

  const mockMemory = {
    applySignal: vi.fn(),
    studentModel: vi.fn().mockResolvedValue({
      studentId: brandId<"StudentId">("student-1"),
      conceptMastery: new Map([
        [
          conceptId,
          {
            conceptId,
            pKnown,
            uncertainty: 0.25,
            effectivePKnown: pKnown,
            evidence: [],
          },
        ],
      ]),
      lastUpdated: Date.now(),
    }),
    misconceptions: vi.fn(),
    procedural: vi.fn(),
    affective: vi.fn(),
    episodic: vi.fn(),
    export: vi.fn(),
    delete: vi.fn(),
    recordMisconception: vi.fn(),
  };

  return makeToolContext({
    studentId: "student-1",
    sessionId: "session-1",
    // biome-ignore lint/suspicious/noExplicitAny: partial memory mock for this test
    services: { memory: mockMemory as any },
  });
}

describe("updateMasteryTool", () => {
  it("has the correct name and tier", () => {
    expect(updateMasteryTool.name).toBe("update_mastery");
    expect(updateMasteryTool.tier).toBe("deterministic");
    expect(updateMasteryTool.effects).toContain("memory.write");
  });

  it("calls applySignal with the correct parameters", async () => {
    const ctx = makeCtx();
    const result = await updateMasteryTool.handler(
      { conceptId: "concept-1", signal: "correct" },
      ctx,
    );

    expect(ctx.services.memory.applySignal).toHaveBeenCalledOnce();
    expect(ctx.services.memory.applySignal).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: ctx.studentId,
        conceptId: expect.any(String),
        signals: expect.arrayContaining([expect.objectContaining({ kind: "correct" })]),
      }),
    );
    expect(result.ok).toBe(true);
    expect(result.newPKnown).toBe(0.5);
  });

  it("passes evidenceEventId in signals when provided", async () => {
    const ctx = makeCtx();
    await updateMasteryTool.handler(
      { conceptId: "concept-1", signal: "incorrect", evidenceEventId: "event-abc" },
      ctx,
    );

    const callArg = (ctx.services.memory.applySignal as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(callArg.signals[0].evidenceEventIds).toContain(brandId<"EventId">("event-abc"));
  });

  it("returns empty evidenceEventIds when evidenceEventId is omitted", async () => {
    const ctx = makeCtx();
    await updateMasteryTool.handler({ conceptId: "concept-1", signal: "slip" }, ctx);

    const callArg = (ctx.services.memory.applySignal as ReturnType<typeof vi.fn>).mock
      .calls[0]?.[0];
    expect(callArg.signals[0].evidenceEventIds).toHaveLength(0);
  });

  it("returns newPKnown from studentModel", async () => {
    const ctx = makeCtx();
    const result = await updateMasteryTool.handler(
      { conceptId: "concept-1", signal: "correct" },
      ctx,
    );

    expect(result.newPKnown).toBe(0.5);
    expect(result.conceptId).toBe("concept-1");
  });

  it("returns 0 for pKnown when concept not in studentModel", async () => {
    const ctx = makeCtx();
    // Concept not in the studentModel map
    (ctx.services.memory.studentModel as ReturnType<typeof vi.fn>).mockResolvedValue({
      studentId: ctx.studentId,
      conceptMastery: new Map(),
      lastUpdated: Date.now(),
    });

    const result = await updateMasteryTool.handler(
      { conceptId: "unknown-concept", signal: "correct" },
      ctx,
    );
    expect(result.newPKnown).toBe(0);
    expect(result.newEffectivePKnown).toBe(0);
  });
});
