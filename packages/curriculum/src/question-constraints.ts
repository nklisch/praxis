import type { QuestionConstraints } from "@praxis/core/types";

export const FALLBACK_QUESTION_CONSTRAINTS: Required<QuestionConstraints> = {
  promptMaxWords: 60,
  choiceMaxWords: 25,
  choiceCount: 5,
  multiSelectCap: 6,
};

export const DEFAULT_QUESTION_CONSTRAINTS_BY_MODE: Record<string, Required<QuestionConstraints>> = {
  teach: { promptMaxWords: 30, choiceMaxWords: 10, choiceCount: 4, multiSelectCap: 4 },
  homework: { promptMaxWords: 60, choiceMaxWords: 25, choiceCount: 5, multiSelectCap: 6 },
  quiz: { promptMaxWords: 60, choiceMaxWords: 25, choiceCount: 5, multiSelectCap: 6 },
  exam: { promptMaxWords: 60, choiceMaxWords: 25, choiceCount: 5, multiSelectCap: 6 },
  "course-create": { promptMaxWords: 50, choiceMaxWords: 15, choiceCount: 5, multiSelectCap: 6 },
  configure: { promptMaxWords: 50, choiceMaxWords: 15, choiceCount: 5, multiSelectCap: 6 },
  "study-skills": { promptMaxWords: 40, choiceMaxWords: 12, choiceCount: 4, multiSelectCap: 4 },
};

export function resolveQuestionConstraints(
  modeId: string,
  override?: QuestionConstraints,
): Required<QuestionConstraints> {
  const base = DEFAULT_QUESTION_CONSTRAINTS_BY_MODE[modeId] ?? FALLBACK_QUESTION_CONSTRAINTS;
  if (!override) return base;
  return {
    promptMaxWords: override.promptMaxWords ?? base.promptMaxWords,
    choiceMaxWords: override.choiceMaxWords ?? base.choiceMaxWords,
    choiceCount: override.choiceCount ?? base.choiceCount,
    multiSelectCap: override.multiSelectCap ?? base.multiSelectCap,
  };
}
