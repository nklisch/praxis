/**
 * GRADER_REGISTRY — single source of truth for kind→grader dispatch.
 *
 * `buildGraderRegistry()` returns a `Record<AssignmentItem["kind"], ItemGrader>`.
 * TypeScript's exhaustiveness check on the Record type enforces that every
 * AssignmentItem kind has a grader entry. Adding a new kind means:
 *   1. Extend `AssignmentItem` union in types/artifacts.ts
 *   2. Write a grader class
 *   3. Register it here
 * No switch statements anywhere else.
 */

import type { AssignmentItem } from "../../types/artifacts.js";
import { CodeGrader } from "./code-grader.js";
import { FreeResponseGrader } from "./free-response-grader.js";
import { MatchingGrader } from "./matching-grader.js";
import { MathGrader } from "./math-grader.js";
import { MultiSelectGrader } from "./multi-select-grader.js";
import { NumericalGrader } from "./numerical-grader.js";
import { OrderingGrader } from "./ordering-grader.js";
import { ShortAnswerGrader } from "./short-answer-grader.js";
import { SingleChoiceGrader } from "./single-choice-grader.js";
import { TwoTierGrader } from "./two-tier-grader.js";
import type { ItemGrader } from "./types.js";

export function buildGraderRegistry(): Record<AssignmentItem["kind"], ItemGrader> {
  return {
    "single-choice": new SingleChoiceGrader(),
    "multi-select": new MultiSelectGrader(),
    "short-answer": new ShortAnswerGrader(),
    math: new MathGrader(),
    code: new CodeGrader(),
    "free-response": new FreeResponseGrader(),
    numerical: new NumericalGrader(),
    matching: new MatchingGrader(),
    ordering: new OrderingGrader(),
    "two-tier": new TwoTierGrader(),
  };
}
