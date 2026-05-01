import { describe, expect, it } from "vitest";
import { GateTargetSchema, SuccessCriteriaSchema } from "../schema.js";

describe("GateTargetSchema", () => {
  it("parses kind=concept", () => {
    const result = GateTargetSchema.safeParse({ kind: "concept", conceptId: "cid-1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ kind: "concept", conceptId: "cid-1" });
    }
  });

  it("parses kind=lesson", () => {
    const result = GateTargetSchema.safeParse({ kind: "lesson", lessonId: "lid-1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ kind: "lesson", lessonId: "lid-1" });
    }
  });

  it("parses kind=topic", () => {
    const result = GateTargetSchema.safeParse({ kind: "topic", topicId: "tid-1" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ kind: "topic", topicId: "tid-1" });
    }
  });

  it("parses kind=course-completion", () => {
    const result = GateTargetSchema.safeParse({ kind: "course-completion" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual({ kind: "course-completion" });
    }
  });

  it("rejects an unknown kind", () => {
    const result = GateTargetSchema.safeParse({ kind: "quiz", quizId: "q-1" });
    expect(result.success).toBe(false);
  });

  it("rejects concept without conceptId", () => {
    const result = GateTargetSchema.safeParse({ kind: "concept" });
    expect(result.success).toBe(false);
  });
});

describe("SuccessCriteriaSchema", () => {
  it("parses kind=mastery-threshold", () => {
    const result = SuccessCriteriaSchema.safeParse({
      kind: "mastery-threshold",
      conceptIds: ["cid-1", "cid-2"],
      minScore: 0.8,
    });
    expect(result.success).toBe(true);
  });

  it("parses kind=exam-pass", () => {
    const result = SuccessCriteriaSchema.safeParse({
      kind: "exam-pass",
      assignmentId: "assign-1",
      minScore: 0.7,
    });
    expect(result.success).toBe(true);
  });

  it("parses kind=and with nested criteria", () => {
    const result = SuccessCriteriaSchema.safeParse({
      kind: "and",
      criteria: [
        { kind: "mastery-threshold", conceptIds: ["cid-1"], minScore: 0.8 },
        { kind: "exam-pass", assignmentId: "assign-1", minScore: 0.7 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("parses kind=or", () => {
    const result = SuccessCriteriaSchema.safeParse({
      kind: "or",
      criteria: [
        { kind: "mastery-threshold", conceptIds: ["cid-1"], minScore: 0.9 },
        { kind: "mastery-threshold", conceptIds: ["cid-2"], minScore: 0.9 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("parses deeply nested and inside or", () => {
    const result = SuccessCriteriaSchema.safeParse({
      kind: "or",
      criteria: [
        {
          kind: "and",
          criteria: [
            { kind: "mastery-threshold", conceptIds: ["cid-1"], minScore: 0.8 },
            { kind: "exam-pass", assignmentId: "assign-1", minScore: 0.7 },
          ],
        },
        { kind: "mastery-threshold", conceptIds: ["cid-2"], minScore: 0.9 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects minScore as a string", () => {
    const result = SuccessCriteriaSchema.safeParse({
      kind: "mastery-threshold",
      conceptIds: [],
      minScore: "not a number",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown kind", () => {
    const result = SuccessCriteriaSchema.safeParse({ kind: "always" });
    expect(result.success).toBe(false);
  });

  it("rejects mastery-threshold with minScore > 1", () => {
    const result = SuccessCriteriaSchema.safeParse({
      kind: "mastery-threshold",
      conceptIds: ["cid-1"],
      minScore: 1.5,
    });
    expect(result.success).toBe(false);
  });
});
