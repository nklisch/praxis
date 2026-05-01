import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { recordMisconceptionTool } from "../record-misconception.js";

function makeCtx() {
  const mockMemory = {
    applySignal: vi.fn(),
    studentModel: vi.fn(),
    misconceptions: vi.fn(),
    procedural: vi.fn(),
    affective: vi.fn(),
    episodic: vi.fn(),
    export: vi.fn(),
    delete: vi.fn(),
    recordMisconception: vi.fn().mockReturnValue({
      misconceptionId: "misc-001",
      merged: false,
    }),
  };
  return makeToolContext({
    studentId: "student-1",
    sessionId: "session-1",
    // biome-ignore lint/suspicious/noExplicitAny: partial memory mock for this test
    services: { memory: mockMemory as any },
  });
}

const VALID_INPUT = {
  conceptId: "concept-algebra",
  description: "Student believes (a+b)^2 = a^2 + b^2",
  errorForm: "distributes-exponent-over-addition",
  remediation: {
    strategyId: "worked-examples",
    rationale: "Show the FOIL expansion step by step",
  },
  evidenceEventIds: ["event-001", "event-002"],
};

describe("recordMisconceptionTool", () => {
  it("has the correct name and tier", () => {
    expect(recordMisconceptionTool.name).toBe("record_misconception");
    expect(recordMisconceptionTool.tier).toBe("grounded");
    expect(recordMisconceptionTool.effects).toContain("memory.write");
  });

  it("calls recordMisconception with the correct parameters", async () => {
    const ctx = makeCtx();
    const result = await recordMisconceptionTool.handler(VALID_INPUT, ctx);

    expect(ctx.services.memory.recordMisconception).toHaveBeenCalledOnce();
    expect(ctx.services.memory.recordMisconception).toHaveBeenCalledWith(
      expect.objectContaining({
        studentId: ctx.studentId,
        description: VALID_INPUT.description,
        errorForm: VALID_INPUT.errorForm,
        remediation: VALID_INPUT.remediation,
        evidenceEventIds: VALID_INPUT.evidenceEventIds,
      }),
    );

    expect(result.ok).toBe(true);
    expect(result.misconceptionId).toBe("misc-001");
    expect(result.merged).toBe(false);
  });

  it("returns merged=true when service indicates a merge", async () => {
    const ctx = makeCtx();
    (ctx.services.memory.recordMisconception as ReturnType<typeof vi.fn>).mockReturnValue({
      misconceptionId: "misc-existing",
      merged: true,
    });

    const result = await recordMisconceptionTool.handler(VALID_INPUT, ctx);
    expect(result.merged).toBe(true);
    expect(result.misconceptionId).toBe("misc-existing");
  });

  it("input schema requires at least one evidenceEventId", () => {
    const parse = recordMisconceptionTool.input.safeParse({
      ...VALID_INPUT,
      evidenceEventIds: [],
    });
    expect(parse.success).toBe(false);
  });

  it("input schema requires non-empty conceptId", async () => {
    const parse = recordMisconceptionTool.input.safeParse({
      ...VALID_INPUT,
      conceptId: "",
    });
    expect(parse.success).toBe(false);
  });
});
