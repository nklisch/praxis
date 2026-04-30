/**
 * validateItems unit tests.
 *
 * Tests item-create validation (Fail Fast pattern):
 * - Per-kind required fields
 * - Rubric weight sum validation
 * - Exam mode free-response requires rubric
 */

import { describe, expect, it } from "vitest";
import { validateItems } from "../services/assignment-service.js";
import type { AssignmentItem } from "../types/index.js";

describe("validateItems", () => {
  describe("multiple-choice", () => {
    it("passes for valid MC item", () => {
      const item: AssignmentItem = {
        id: "mc-1",
        kind: "multiple-choice",
        prompt: "What is 2+2?",
        options: ["3", "4", "5"],
        correctOptionIndex: 1,
      };
      expect(() => validateItems([item], "quiz")).not.toThrow();
    });

    it("throws when options is missing", () => {
      const item: AssignmentItem = { id: "mc-1", kind: "multiple-choice", prompt: "Q?" };
      expect(() => validateItems([item], "quiz")).toThrow("mc-1");
    });
  });

  describe("short-answer", () => {
    it("passes for valid SA item", () => {
      const item: AssignmentItem = {
        id: "sa-1",
        kind: "short-answer",
        prompt: "Spell cat.",
        acceptedAnswers: ["cat"],
      };
      expect(() => validateItems([item], "quiz")).not.toThrow();
    });

    it("throws when acceptedAnswers is missing", () => {
      const item: AssignmentItem = { id: "sa-1", kind: "short-answer", prompt: "Q?" };
      expect(() => validateItems([item], "quiz")).toThrow("sa-1");
    });
  });

  describe("math", () => {
    it("passes for valid math item", () => {
      const item: AssignmentItem = {
        id: "m-1",
        kind: "math",
        prompt: "2x=4",
        expectedSolution: { variable: "x", value: "2" },
      };
      expect(() => validateItems([item], "quiz")).not.toThrow();
    });

    it("throws when expectedSolution is missing", () => {
      const item: AssignmentItem = { id: "m-1", kind: "math", prompt: "2x=4" };
      expect(() => validateItems([item], "quiz")).toThrow("m-1");
    });
  });

  describe("code", () => {
    it("passes for valid code item", () => {
      const item: AssignmentItem = {
        id: "c-1",
        kind: "code",
        prompt: "Write hello world",
        language: "javascript",
        testCases: [{ expectedStdout: "hello" }],
      };
      expect(() => validateItems([item], "quiz")).not.toThrow();
    });

    it("throws when testCases is missing", () => {
      const item: AssignmentItem = {
        id: "c-1",
        kind: "code",
        prompt: "code",
        language: "javascript",
      };
      expect(() => validateItems([item], "quiz")).toThrow("c-1");
    });

    it("throws when language is missing", () => {
      const item: AssignmentItem = {
        id: "c-1",
        kind: "code",
        prompt: "code",
        testCases: [{ expectedStdout: "x" }],
      };
      expect(() => validateItems([item], "quiz")).toThrow("c-1");
    });
  });

  describe("rubric weight validation", () => {
    it("throws when rubric weights don't sum to 1.0", () => {
      const item: AssignmentItem = {
        id: "fr-1",
        kind: "free-response",
        prompt: "Explain X.",
        rubric: {
          criteria: [
            { id: "c1", description: "Quality", weight: 0.3 },
            { id: "c2", description: "Clarity", weight: 0.3 },
          ],
          maxScore: 10,
        },
      };
      expect(() => validateItems([item], "quiz")).toThrow("weights must sum to 1.0");
      expect(() => validateItems([item], "quiz")).toThrow("0.6000");
    });

    it("passes when rubric weights sum to exactly 1.0", () => {
      const item: AssignmentItem = {
        id: "fr-1",
        kind: "free-response",
        prompt: "Explain X.",
        rubric: {
          criteria: [
            { id: "c1", description: "Quality", weight: 0.6 },
            { id: "c2", description: "Clarity", weight: 0.4 },
          ],
          maxScore: 10,
        },
      };
      expect(() => validateItems([item], "quiz")).not.toThrow();
    });

    it("passes when rubric weights sum to 1.0 within ±0.01 tolerance", () => {
      const item: AssignmentItem = {
        id: "fr-1",
        kind: "free-response",
        prompt: "Explain X.",
        rubric: {
          criteria: [
            { id: "c1", description: "A", weight: 0.334 },
            { id: "c2", description: "B", weight: 0.333 },
            { id: "c3", description: "C", weight: 0.333 },
          ],
          maxScore: 10,
        },
      };
      expect(() => validateItems([item], "quiz")).not.toThrow();
    });
  });

  describe("exam mode", () => {
    it("throws for free-response without rubric in exam mode", () => {
      const item: AssignmentItem = {
        id: "fr-1",
        kind: "free-response",
        prompt: "Explain X.",
        acceptedAnswers: ["X is..."],
      };
      expect(() => validateItems([item], "exam")).toThrow("requires a rubric");
    });

    it("passes for free-response with rubric in exam mode", () => {
      const item: AssignmentItem = {
        id: "fr-1",
        kind: "free-response",
        prompt: "Explain X.",
        rubric: {
          criteria: [{ id: "c1", description: "Quality", weight: 1.0 }],
          maxScore: 10,
        },
      };
      expect(() => validateItems([item], "exam")).not.toThrow();
    });

    it("allows free-response without rubric in quiz mode (acceptedAnswers fallback)", () => {
      const item: AssignmentItem = {
        id: "fr-1",
        kind: "free-response",
        prompt: "What is X?",
        acceptedAnswers: ["X"],
      };
      expect(() => validateItems([item], "quiz")).not.toThrow();
    });
  });
});
