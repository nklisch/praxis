import { describe, expect, it } from "vitest";
import {
  DEFAULT_QUESTION_CONSTRAINTS_BY_MODE,
  FALLBACK_QUESTION_CONSTRAINTS,
  resolveQuestionConstraints,
} from "../question-constraints.js";

describe("question-constraints", () => {
  it("each mode resolves to documented defaults", () => {
    expect(resolveQuestionConstraints("teach")).toEqual({
      promptMaxWords: 30,
      choiceMaxWords: 10,
      choiceCount: 4,
      multiSelectCap: 4,
    });
    expect(resolveQuestionConstraints("homework")).toEqual({
      promptMaxWords: 60,
      choiceMaxWords: 25,
      choiceCount: 5,
      multiSelectCap: 6,
    });
    expect(resolveQuestionConstraints("quiz")).toEqual({
      promptMaxWords: 60,
      choiceMaxWords: 25,
      choiceCount: 5,
      multiSelectCap: 6,
    });
    expect(resolveQuestionConstraints("exam")).toEqual({
      promptMaxWords: 60,
      choiceMaxWords: 25,
      choiceCount: 5,
      multiSelectCap: 6,
    });
    expect(resolveQuestionConstraints("course-create")).toEqual({
      promptMaxWords: 50,
      choiceMaxWords: 15,
      choiceCount: 5,
      multiSelectCap: 6,
    });
    expect(resolveQuestionConstraints("configure")).toEqual({
      promptMaxWords: 50,
      choiceMaxWords: 15,
      choiceCount: 5,
      multiSelectCap: 6,
    });
    expect(resolveQuestionConstraints("study-skills")).toEqual({
      promptMaxWords: 40,
      choiceMaxWords: 12,
      choiceCount: 4,
      multiSelectCap: 4,
    });
  });

  it("unknown mode falls back", () => {
    expect(resolveQuestionConstraints("nonexistent")).toEqual(FALLBACK_QUESTION_CONSTRAINTS);
  });

  it("partial override preserves defaults for unset keys", () => {
    expect(resolveQuestionConstraints("teach", { choiceCount: 6 })).toEqual({
      promptMaxWords: 30,
      choiceMaxWords: 10,
      choiceCount: 6, // overridden
      multiSelectCap: 4,
    });
  });

  it("all-undefined override returns base defaults", () => {
    expect(resolveQuestionConstraints("teach", {})).toEqual(
      DEFAULT_QUESTION_CONSTRAINTS_BY_MODE.teach,
    );
  });
});
