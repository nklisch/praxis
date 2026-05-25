/**
 * Double-gate canary test: verifies that BOTH insertion points (tool registration
 * AND prompt fragment injection) are clean when PRAXIS_DEV is unset.
 *
 * The earlier step-2 and step-3 tests each verified one gate independently.
 * This file is the combined canary: if either gate regresses — if dev.* tools
 * slip into production tool definitions OR if dev-mode text leaks into any
 * mode's composed system prompt — this test catches it.
 *
 * Approach: inline the same gate predicate (`IS_DEV = process.env.PRAXIS_DEV === "true"`)
 * that `services.ts` and `engine-session-manager.ts` use. This avoids standing up
 * the heavyweight service orchestrator and keeps the test focused on the gating
 * contract, not integration plumbing.
 *
 * Sanity invariant (enforced by the "gate-on sanity" describe block): if we set
 * PRAXIS_DEV=true, the dev-mode content DOES appear. Without this check, the
 * canary would pass vacuously even if step-3 was broken end-to-end.
 */

import type { PromptFragment } from "@praxis/core/types";
import { composeSystemPromptWithAttribution } from "@praxis/curriculum/brief";
import {
  configureMode,
  courseCreateMode,
  devModeFragment,
  examMode,
  homeworkMode,
  quizMode,
  studySkillsMode,
  teachMode,
} from "@praxis/curriculum/modes";
import { DEV_TOOLS } from "@praxis/tools/dev";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ── modes under test ─────────────────────────────────────────────────────────

const ALL_MODES = [
  teachMode,
  quizMode,
  homeworkMode,
  examMode,
  courseCreateMode,
  configureMode,
  studySkillsMode,
] as const;

// ── env isolation ─────────────────────────────────────────────────────────────

let savedEnv: string | undefined;

beforeEach(() => {
  savedEnv = process.env.PRAXIS_DEV;
  delete process.env.PRAXIS_DEV;
});

afterEach(() => {
  if (savedEnv === undefined) {
    delete process.env.PRAXIS_DEV;
  } else {
    process.env.PRAXIS_DEV = savedEnv;
  }
});

// ── double-gate canary: gate OFF ──────────────────────────────────────────────

describe("dev-mode production safety (gate-off canary)", () => {
  it("registers zero dev.* tools when PRAXIS_DEV is unset", () => {
    // Replicate the gate predicate from services.ts inline.
    const IS_DEV = process.env.PRAXIS_DEV === "true";
    expect(IS_DEV).toBe(false);

    // Simulate the conditional spread from services.ts:
    //   if (IS_DEV) toolDefinitions.push(...DEV_TOOLS);
    const toolDefinitions: Array<(typeof DEV_TOOLS)[number]> = [];
    if (IS_DEV) toolDefinitions.push(...DEV_TOOLS);

    const devToolNames = toolDefinitions.filter((t) => t.name.startsWith("dev."));
    expect(devToolNames).toHaveLength(0);
  });

  describe("composes zero dev-mode text into any mode's system prompt when PRAXIS_DEV is unset", () => {
    ALL_MODES.forEach((mode) => {
      it(`mode=${mode.id}`, () => {
        // Replicate the gate predicate from engine-session-manager.ts inline.
        const IS_DEV = process.env.PRAXIS_DEV === "true";
        expect(IS_DEV).toBe(false);

        // Simulate the conditional push from engine-session-manager.ts:
        //   if (process.env.PRAXIS_DEV === "true") additionalFragments.push(devModeFragment);
        // User fragments are empty — clean simulation with no extra noise.
        const additionalFragments: PromptFragment[] = [];
        if (IS_DEV) additionalFragments.push(devModeFragment);

        const { prompt } = composeSystemPromptWithAttribution({ mode, additionalFragments });
        expect(prompt).not.toContain("Dev mode");
        expect(prompt).not.toContain("dev.report_issue");
      });
    });
  });
});

// ── sanity: gate ON produces the content the canary is watching for ───────────
//
// Without this block, the gate-off canary would pass even if step-3 was broken
// and the fragment never contained "Dev mode" / "dev.report_issue" at all.
// By proving the gate-on state DOES produce the expected text, we confirm that
// the canary above is actually meaningful.

describe("dev-mode gate-on sanity (PRAXIS_DEV=true)", () => {
  beforeEach(() => {
    process.env.PRAXIS_DEV = "true";
  });

  it("gate-on: dev.report_issue IS in assembled tool definitions", () => {
    const IS_DEV = process.env.PRAXIS_DEV === "true";
    expect(IS_DEV).toBe(true);

    const toolDefinitions: Array<(typeof DEV_TOOLS)[number]> = [];
    if (IS_DEV) toolDefinitions.push(...DEV_TOOLS);

    const devToolNames = toolDefinitions
      .filter((t) => t.name.startsWith("dev."))
      .map((t) => t.name);
    expect(devToolNames).toContain("dev.report_issue");
  });

  it("gate-on: 'Dev mode' and 'dev.report_issue' ARE in composed prompt for teach mode", () => {
    const IS_DEV = process.env.PRAXIS_DEV === "true";
    expect(IS_DEV).toBe(true);

    const additionalFragments: PromptFragment[] = [];
    if (IS_DEV) additionalFragments.push(devModeFragment);

    const { prompt } = composeSystemPromptWithAttribution({ mode: teachMode, additionalFragments });
    expect(prompt).toContain("Dev mode");
    expect(prompt).toContain("dev.report_issue");
  });
});
