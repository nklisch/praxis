/**
 * Tests for `composeSystemPromptWithAttribution`.
 *
 * Verifies:
 * - Equivalence: result.prompt === composeSystemPrompt(input) for same input.
 * - Invariant: segments.map(s => s.text).join("\n\n") === prompt.
 * - All five source classifications: "default", "override", "append", "global", "additional".
 * - defaultText present for mode fragments, absent for additional/user-layer fragments.
 * - Stale override (id not in mode): tolerated, not reflected in any segment.
 * - Non-customizable override: throws (same behavior as composeSystemPrompt).
 */

import type { PromptFragment } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { preambleFragment } from "../../modes/fragments/preamble.js";
import { principlesFragment } from "../../modes/fragments/principles.js";
import { teachMode } from "../../modes/index.js";
import { composeSystemPrompt, composeSystemPromptWithAttribution } from "../compose.js";

// ── Helpers ────────────────────────────────────────────────────────────────────

const userGlobalFragment: PromptFragment = {
  id: "user.global",
  position: "user-global",
  customizable: true,
  template: "GLOBAL_USER_INSTRUCTION",
};

const userAppendFragment: PromptFragment = {
  id: "user.append.teach",
  position: "user-append",
  customizable: true,
  template: "APPEND_USER_INSTRUCTION",
};

const systemAdditionalFragment: PromptFragment = {
  id: "course.context",
  position: "context",
  customizable: false,
  template: "COURSE_CONTEXT_TEXT",
};

// ── Equivalence ────────────────────────────────────────────────────────────────

describe("composeSystemPromptWithAttribution — equivalence with composeSystemPrompt", () => {
  it("prompt matches composeSystemPrompt for teach mode with no overrides", () => {
    const input = { mode: teachMode };
    expect(composeSystemPromptWithAttribution(input).prompt).toBe(composeSystemPrompt(input));
  });

  it("prompt matches composeSystemPrompt with a customizable override", () => {
    const overrides = new Map([["preamble.default", "CUSTOM_PREAMBLE"]]);
    const input = { mode: teachMode, overrides };
    expect(composeSystemPromptWithAttribution(input).prompt).toBe(composeSystemPrompt(input));
  });

  it("prompt matches composeSystemPrompt with additional fragments", () => {
    const input = {
      mode: teachMode,
      additionalFragments: [userGlobalFragment, userAppendFragment],
    };
    expect(composeSystemPromptWithAttribution(input).prompt).toBe(composeSystemPrompt(input));
  });

  it("prompt matches composeSystemPrompt with override + additional fragments", () => {
    const overrides = new Map([["preamble.default", "OVERRIDDEN_PREAMBLE"]]);
    const input = {
      mode: teachMode,
      overrides,
      additionalFragments: [userGlobalFragment, systemAdditionalFragment],
    };
    expect(composeSystemPromptWithAttribution(input).prompt).toBe(composeSystemPrompt(input));
  });
});

// ── Invariant ─────────────────────────────────────────────────────────────────

describe("composeSystemPromptWithAttribution — segment join invariant", () => {
  it("segments join with \\n\\n to produce prompt (no additional)", () => {
    const { prompt, segments } = composeSystemPromptWithAttribution({ mode: teachMode });
    expect(segments.map((s) => s.text).join("\n\n")).toBe(prompt);
  });

  it("segments join with \\n\\n to produce prompt (with override and additional)", () => {
    const overrides = new Map([["preamble.default", "OVERRIDDEN"]]);
    const { prompt, segments } = composeSystemPromptWithAttribution({
      mode: teachMode,
      overrides,
      additionalFragments: [userGlobalFragment, userAppendFragment, systemAdditionalFragment],
    });
    expect(segments.map((s) => s.text).join("\n\n")).toBe(prompt);
  });
});

// ── Source classifications ─────────────────────────────────────────────────────

describe("composeSystemPromptWithAttribution — source: default", () => {
  it("mode fragment with no override gets source 'default'", () => {
    const { segments } = composeSystemPromptWithAttribution({ mode: teachMode });
    const preamble = segments.find((s) => s.fragmentId === "preamble.default");
    expect(preamble?.source).toBe("default");
  });

  it("default segment has text === defaultText", () => {
    const { segments } = composeSystemPromptWithAttribution({ mode: teachMode });
    const preamble = segments.find((s) => s.fragmentId === "preamble.default");
    expect(preamble?.text).toBe(preamble?.defaultText);
    expect(preamble?.text).toBe(preambleFragment.template);
  });

  it("all mode segments without overrides have defaultText set", () => {
    const { segments } = composeSystemPromptWithAttribution({ mode: teachMode });
    const modeIds = new Set(teachMode.promptFragments.map((f) => f.id));
    for (const seg of segments) {
      if (modeIds.has(seg.fragmentId)) {
        expect(seg.defaultText).toBeDefined();
      }
    }
  });
});

describe("composeSystemPromptWithAttribution — source: override", () => {
  it("overridden mode fragment gets source 'override'", () => {
    const overrides = new Map([["preamble.default", "CUSTOM_PREAMBLE"]]);
    const { segments } = composeSystemPromptWithAttribution({ mode: teachMode, overrides });
    const preamble = segments.find((s) => s.fragmentId === "preamble.default");
    expect(preamble?.source).toBe("override");
  });

  it("override segment has text === override value", () => {
    const overrides = new Map([["preamble.default", "CUSTOM_PREAMBLE"]]);
    const { segments } = composeSystemPromptWithAttribution({ mode: teachMode, overrides });
    const preamble = segments.find((s) => s.fragmentId === "preamble.default");
    expect(preamble?.text).toBe("CUSTOM_PREAMBLE");
  });

  it("override segment preserves defaultText from the original fragment", () => {
    const overrides = new Map([["preamble.default", "CUSTOM_PREAMBLE"]]);
    const { segments } = composeSystemPromptWithAttribution({ mode: teachMode, overrides });
    const preamble = segments.find((s) => s.fragmentId === "preamble.default");
    expect(preamble?.defaultText).toBe(preambleFragment.template);
    expect(preamble?.text).not.toBe(preamble?.defaultText);
  });
});

describe("composeSystemPromptWithAttribution — source: global", () => {
  it("user-global additional fragment gets source 'global'", () => {
    const { segments } = composeSystemPromptWithAttribution({
      mode: teachMode,
      additionalFragments: [userGlobalFragment],
    });
    const global = segments.find((s) => s.fragmentId === "user.global");
    expect(global?.source).toBe("global");
  });

  it("global segment has no defaultText", () => {
    const { segments } = composeSystemPromptWithAttribution({
      mode: teachMode,
      additionalFragments: [userGlobalFragment],
    });
    const global = segments.find((s) => s.fragmentId === "user.global");
    expect(global?.defaultText).toBeUndefined();
  });

  it("global segment text matches its template", () => {
    const { segments } = composeSystemPromptWithAttribution({
      mode: teachMode,
      additionalFragments: [userGlobalFragment],
    });
    const global = segments.find((s) => s.fragmentId === "user.global");
    expect(global?.text).toBe("GLOBAL_USER_INSTRUCTION");
  });
});

describe("composeSystemPromptWithAttribution — source: append", () => {
  it("user-append additional fragment gets source 'append'", () => {
    const { segments } = composeSystemPromptWithAttribution({
      mode: teachMode,
      additionalFragments: [userAppendFragment],
    });
    const append = segments.find((s) => s.fragmentId === "user.append.teach");
    expect(append?.source).toBe("append");
  });

  it("append segment has no defaultText", () => {
    const { segments } = composeSystemPromptWithAttribution({
      mode: teachMode,
      additionalFragments: [userAppendFragment],
    });
    const append = segments.find((s) => s.fragmentId === "user.append.teach");
    expect(append?.defaultText).toBeUndefined();
  });
});

describe("composeSystemPromptWithAttribution — source: additional", () => {
  it("system fragment at non-user position gets source 'additional'", () => {
    const { segments } = composeSystemPromptWithAttribution({
      mode: teachMode,
      additionalFragments: [systemAdditionalFragment],
    });
    const ctx = segments.find((s) => s.fragmentId === "course.context");
    expect(ctx?.source).toBe("additional");
  });

  it("additional segment has no defaultText", () => {
    const { segments } = composeSystemPromptWithAttribution({
      mode: teachMode,
      additionalFragments: [systemAdditionalFragment],
    });
    const ctx = segments.find((s) => s.fragmentId === "course.context");
    expect(ctx?.defaultText).toBeUndefined();
  });

  it("additional segment text matches its template", () => {
    const { segments } = composeSystemPromptWithAttribution({
      mode: teachMode,
      additionalFragments: [systemAdditionalFragment],
    });
    const ctx = segments.find((s) => s.fragmentId === "course.context");
    expect(ctx?.text).toBe("COURSE_CONTEXT_TEXT");
  });
});

// ── All five sources in one input ──────────────────────────────────────────────

describe("composeSystemPromptWithAttribution — all five sources together", () => {
  it("correctly classifies default, override, global, append, and additional segments", () => {
    const overrides = new Map([["preamble.default", "CUSTOM_PREAMBLE"]]);
    const { segments } = composeSystemPromptWithAttribution({
      mode: teachMode,
      overrides,
      additionalFragments: [userGlobalFragment, userAppendFragment, systemAdditionalFragment],
    });

    // Override
    const preamble = segments.find((s) => s.fragmentId === "preamble.default");
    expect(preamble?.source).toBe("override");
    expect(preamble?.text).toBe("CUSTOM_PREAMBLE");

    // Default (any non-overridden mode fragment)
    const principles = segments.find((s) => s.fragmentId === principlesFragment.id);
    expect(principles?.source).toBe("default");

    // Global
    const global = segments.find((s) => s.fragmentId === "user.global");
    expect(global?.source).toBe("global");

    // Append
    const append = segments.find((s) => s.fragmentId === "user.append.teach");
    expect(append?.source).toBe("append");

    // Additional
    const additional = segments.find((s) => s.fragmentId === "course.context");
    expect(additional?.source).toBe("additional");
  });
});

// ── Edge cases ─────────────────────────────────────────────────────────────────

describe("composeSystemPromptWithAttribution — edge cases", () => {
  it("tolerates stale override (id not in mode): no segment carries the stale id", () => {
    const overrides = new Map([["stale.fragment.id", "some value"]]);
    const { segments } = composeSystemPromptWithAttribution({ mode: teachMode, overrides });
    expect(segments.find((s) => s.fragmentId === "stale.fragment.id")).toBeUndefined();
  });

  it("stale override does not throw", () => {
    const overrides = new Map([["stale.fragment.id", "some value"]]);
    expect(() => composeSystemPromptWithAttribution({ mode: teachMode, overrides })).not.toThrow();
  });

  it("throws for non-customizable override (same behavior as composeSystemPrompt)", () => {
    const overrides = new Map([["principles.graded-grounding", "Bad override"]]);
    expect(() => composeSystemPromptWithAttribution({ mode: teachMode, overrides })).toThrow(
      'Fragment "principles.graded-grounding" is not customizable',
    );
  });

  it("segments have the correct position for each fragment", () => {
    const { segments } = composeSystemPromptWithAttribution({ mode: teachMode });
    const preamble = segments.find((s) => s.fragmentId === "preamble.default");
    expect(preamble?.position).toBe("preamble");
  });

  it("segments mirror the customizable field from the fragment", () => {
    const { segments } = composeSystemPromptWithAttribution({ mode: teachMode });
    const principles = segments.find((s) => s.fragmentId === principlesFragment.id);
    // principles.graded-grounding is not customizable
    expect(principles?.customizable).toBe(false);
  });
});

// ── Segment ordering ──────────────────────────────────────────────────────────

describe("composeSystemPromptWithAttribution — segment ordering", () => {
  it("segments are in FRAGMENT_ORDER position order", () => {
    const { segments } = composeSystemPromptWithAttribution({
      mode: teachMode,
      additionalFragments: [userGlobalFragment, userAppendFragment],
    });
    // preamble must appear before user-global
    const preambleIdx = segments.findIndex((s) => s.fragmentId === "preamble.default");
    const globalIdx = segments.findIndex((s) => s.fragmentId === "user.global");
    const appendIdx = segments.findIndex((s) => s.fragmentId === "user.append.teach");
    expect(preambleIdx).toBeGreaterThanOrEqual(0);
    expect(globalIdx).toBeGreaterThan(preambleIdx);
    expect(appendIdx).toBeGreaterThan(globalIdx);
  });
});
