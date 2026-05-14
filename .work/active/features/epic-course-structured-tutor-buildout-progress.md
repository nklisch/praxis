---
id: epic-course-structured-tutor-buildout-progress
kind: feature
stage: done
tags: [tutor-ux, bootstrap]
parent: epic-course-structured-tutor
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Buildout progress claims — stop the bootstrap explorer from promising bad ETAs

## Brief

The "misleading ETA" the user reported is not a UI element. It's the
**bootstrap explorer agent itself**, in its response text, saying
things like "this should take about 30 seconds" while the actual run
takes minutes. Anchor verification confirmed there is no ETA component
in `bootstrap-tab-body.tsx` or adjacent UI. The agent is freelancing
a time estimate based on no real signal, the user reads it as a
commitment, and when the run blows past the quoted time the UI looks
stalled.

This feature is a **prompt fix to the bootstrap explorer's mode
fragments**. The fragment(s) that drive the explorer's response style
get instructions that explicitly **forbid time-estimate claims**
("don't promise specific durations") and **direct the model to
describe progress in structural terms only** if it talks about
progress at all ("Unit 3 of 8 drafted" rather than "30 seconds left").
Bounded to the curriculum modes/fragments package — no UI changes, no
activity-rail integration, no service wiring.

## Epic context

- Parent epic: `epic-course-structured-tutor`
- Position in epic: independent. Parallelizable with the other two
  features.

## Scope absorbed from backlog

- `idea-course-buildout-time-estimate` — replace the misleading ETA
  with structural progress signals.

## Foundation references

- `CLAUDE.md` — pattern `mode-prompt-fragment-composition`
- `docs/ARCHITECTURE.md` — bootstrap explorer pipeline; mode + pedagogy
  pack composition

## Anchors (current implementation)

- Bootstrap mode definition —
  `packages/curriculum/src/modes/bootstrap.ts` (mode declares the
  `promptFragments` array that drives the explorer's response style)
- Shared fragment directory —
  `packages/curriculum/src/modes/fragments/` (the specific fragment
  responsible for response-style guidance lives here; feature-design
  locates the exact file by reading the bootstrap mode's fragment
  imports and the fragment text that today permits ETA claims)
- Prompt composition pipeline —
  `packages/curriculum/src/compose-system-prompt.ts` (or wherever
  `composeSystemPrompt` lives — for context, no changes expected
  here)

## Pre-design decisions (2026-05-14)

- **Source of the bad ETA**: agent prompt output, NOT a UI element.
  The original brief was based on a misread; corrected here. No
  `<ActivityRail>` integration, no service wiring, no UI work in this
  feature.
- **Fix shape**: update the bootstrap explorer's mode prompt fragment
  to (a) explicitly forbid time-estimate claims like "this should take
  X seconds/minutes", and (b) instruct the model to describe progress
  in structural terms only ("Unit 3 of 8 drafted", "current step:
  drafting assessment plan for Lesson 5") if it talks about progress
  at all.
- **Scope**: bounded to `packages/curriculum/src/modes/` — the
  bootstrap mode definition and the fragment file that drives response
  style. No other packages touched.

## Architectural choice

**Inline edit of existing prompt fragments** — no new fragment, no
restructuring of the bootstrap mode's `promptFragments` array.

Considered:

1. **Inline edit (chosen)** — strike the three sentences that contain
   the "30–90 seconds" claim and replace the role-fragment paragraph
   with structural-progress guidance. Smallest possible change; keeps
   the existing fragment composition intact; matches the pattern of
   prior bootstrap fragment edits (see
   `bootstrap-no-inline-outline.test.ts` — the "chat discipline" rule
   was added the same way).
2. **New dedicated `bootstrap-progress-style` fragment** — would
   centralise response-style guidance into a single file. Rejected:
   over-abstraction for one paragraph of guidance that is bootstrap-
   specific and already lives next to other bootstrap chat-discipline
   rules in `bootstrap-role.ts`. Adds a fragment-ordering decision
   without payoff.
3. **Promote to a shared cross-mode `time-claims` constraint** in
   `constraints.ts`. Rejected: only the explorer-launching modes
   (bootstrap, configure) have this hazard; the rest of the modes have
   no long-running async tool to misquote. Globalising the constraint
   pollutes the prompts that don't need it.

The codebase scan found **three** locations carrying the bad ETA — not
one. Listed in Unit 1 below. All three are inside
`packages/curriculum/src/modes/fragments/` so the scope boundary holds.

## Implementation Units

### Unit 1: Strike time-estimate claims from bootstrap + configure prompt fragments

**Files**:

- `packages/curriculum/src/modes/fragments/bootstrap-role.ts`
- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts`
- `packages/curriculum/src/modes/fragments/configure-tools.ts`

**Story**: implemented inline as part of this feature (no child story
spawned — see "Implementation order" rationale).

#### 1a. `bootstrap-role.ts` — replace the ETA sentence + add a
positive structural-progress instruction

Today, step 4 of the role fragment says (line 17):

> It usually takes 30–90 seconds. Tell the user: "I'm exploring your
> materials — this'll take a bit."

Change to (exact replacement text):

> It runs as a background agent and may take a while — there is no
> reliable up-front estimate. When you hand off to the explorer, tell
> the user you're starting it and that you'll show what it produces
> when it returns. Do NOT promise a specific duration ("30 seconds",
> "about a minute", "shouldn't be long"). If you mention progress at
> all while it runs or after it returns, describe it in **structural
> terms only** — what stage of the draft you're on, not how much time
> is left. Examples: "exploration returned 6 units, 18 lessons —
> outline is on the right", "draft has 4 of an expected 8 units;
> continuing exploration would extend it". Never invent a percentage
> or an ETA.

Also add a short bullet to the existing "Chat discipline" paragraph at
the end of `bootstrapRoleFragment.template`:

> Never quote durations or ETAs ("about 30 seconds", "shouldn't take
> long"). The exploration is a multi-turn agent loop with no reliable
> time signal. If you report progress, use structural terms ("Unit 3
> of 8 drafted", "currently drafting the assessment plan for Lesson
> 5") — not time.

#### 1b. `bootstrap-tools.ts` — drop the "(30–90 seconds)" parenthetical

Line 9 today:

> `course.start_exploration` — run the concept-explorer agent on
> selected documents to produce a course draft (30–90 seconds)

Change to:

> `course.start_exploration` — run the concept-explorer agent on
> selected documents to produce a course draft (runs as a background
> agent; duration varies — do not quote ETAs to the student)

#### 1c. `configure-tools.ts` — same drop in the Phase 11 configure mode

Line 24 today:

> `course.start_exploration` — run the concept-explorer on selected
> documents (30–90 seconds)

Change to:

> `course.start_exploration` — run the concept-explorer on selected
> documents (runs as a background agent; duration varies — do not
> quote ETAs to the student)

**Implementation Notes**:

- The wording across the three files intentionally repeats "do not
  quote ETAs to the student" — three independent recall surfaces in
  the prompt (role guidance, bootstrap tool catalogue, configure tool
  catalogue) reinforce the same rule, matching how the existing "Do
  NOT re-narrate the outline in chat" rule is reinforced in both
  `bootstrap-role.ts` and `bootstrap-tools.ts`.
- No fragment ordering changes; no new fragment added; `promptFragments`
  array in `bootstrap.ts` (and `configure.ts`) is unchanged.
- The fragments are plain template strings — no runtime logic to
  change, no DB migration, no IPC contract change.

**Acceptance Criteria**:

- [ ] `bootstrap-role.ts` does NOT contain the substring `30–90 seconds`
- [ ] `bootstrap-role.ts` does NOT contain the substring `30 seconds`
- [ ] `bootstrap-role.ts` does NOT contain `this'll take a bit`
- [ ] `bootstrap-role.ts` DOES contain `Do NOT promise a specific duration` (or close paraphrase the test pins exactly)
- [ ] `bootstrap-role.ts` DOES contain `structural terms` and an explicit "Unit N of M" example
- [ ] `bootstrap-tools.ts` does NOT contain `30–90 seconds`
- [ ] `bootstrap-tools.ts` DOES contain `do not quote ETAs`
- [ ] `configure-tools.ts` does NOT contain `30–90 seconds`
- [ ] `configure-tools.ts` DOES contain `do not quote ETAs`
- [ ] Existing `bootstrap-no-inline-outline.test.ts` assertions still pass (chat-discipline rules are preserved, not overwritten)
- [ ] `pnpm --filter @praxis/curriculum test` passes

---

### Unit 2: Test — fragments do not promise durations

**File**: `packages/curriculum/src/modes/fragments/__tests__/bootstrap-no-time-estimate.test.ts`

**Story**: implemented inline as part of this feature.

New colocated test file modelled on the existing
`bootstrap-no-inline-outline.test.ts`. Asserts the
forbidden-substring / required-substring shape above. The test is the
behavioural specification for the prompt fix — it is the only
automated guard preventing a future edit from quietly re-introducing
an ETA.

```ts
import { describe, expect, it } from "vitest";
import { bootstrapRoleFragment } from "../bootstrap-role.js";
import { bootstrapToolsFragment } from "../bootstrap-tools.js";
import { configureToolsFragment } from "../configure-tools.js";

describe("bootstrap fragments — no time-estimate claims", () => {
  for (const [name, frag] of [
    ["bootstrapRoleFragment", bootstrapRoleFragment],
    ["bootstrapToolsFragment", bootstrapToolsFragment],
    ["configureToolsFragment", configureToolsFragment],
  ] as const) {
    describe(name, () => {
      it("does not contain the literal '30–90 seconds'", () => {
        expect(frag.template).not.toContain("30–90 seconds");
      });
      it("does not contain the literal '30 seconds'", () => {
        expect(frag.template).not.toContain("30 seconds");
      });
      it("does not contain 'this'll take a bit'", () => {
        expect(frag.template).not.toContain("this'll take a bit");
      });
    });
  }
});

describe("bootstrapRoleFragment — structural-progress guidance", () => {
  it("forbids promising a specific duration", () => {
    expect(bootstrapRoleFragment.template).toContain(
      "Do NOT promise a specific duration",
    );
  });
  it("directs the model to describe progress in structural terms", () => {
    expect(bootstrapRoleFragment.template).toContain("structural terms");
  });
  it("gives a Unit-N-of-M style example", () => {
    expect(bootstrapRoleFragment.template).toMatch(/Unit \d+ of \d+/);
  });
});

describe("bootstrapToolsFragment + configureToolsFragment — ETA rule in tool catalogue", () => {
  it("bootstrapToolsFragment instructs not to quote ETAs", () => {
    expect(bootstrapToolsFragment.template).toContain("do not quote ETAs");
  });
  it("configureToolsFragment instructs not to quote ETAs", () => {
    expect(configureToolsFragment.template).toContain("do not quote ETAs");
  });
});
```

**Acceptance Criteria**:

- [ ] New test file lives at the path above
- [ ] All cases pass after Unit 1's edits land
- [ ] `pnpm --filter @praxis/curriculum test` is green

---

## Implementation Order

1. Unit 1a, 1b, 1c — three template edits (sequential within a single
   stride; tightly cohesive, all touch the same package, all the same
   shape of change)
2. Unit 2 — colocated test that pins the new wording

These are inline tightly-cohesive edits in one package, exercised by
one new test file. No parallelism is available, no resume points are
needed, the acceptance surface is a single set of string assertions —
**no child story spawned**, per the feature-design "when stories are
pure overhead" rubric (single-stride, tight cohesion, retroactive
spawning would be ceremony).

## Testing

### Unit Tests: `packages/curriculum/src/modes/fragments/__tests__/bootstrap-no-time-estimate.test.ts`

Snapshot-style substring assertions exactly as in Unit 2 above. Mirrors
the pattern used by `bootstrap-no-inline-outline.test.ts` — pin
forbidden substrings (negative tests) and required substrings
(positive tests) so a future careless edit fails fast.

### Regression: existing colocated tests must still pass

- `bootstrap-no-inline-outline.test.ts` — the chat-discipline rules
  must not be accidentally clobbered when editing
  `bootstrapRoleFragment.template`. The new "Chat discipline" bullet
  about ETAs is **additive** to the existing block, not a rewrite.
- `bootstrap-toolnames.test.ts` — unchanged (no `toolNames` change).

### No integration / e2e tests

Prompt content is verified at the fragment level. End-to-end behaviour
(does the model actually stop quoting ETAs?) is an emergent property
of the prompt and is observed live, not asserted in CI — consistent
with how every other prompt-fragment edit in the codebase is tested.

## Risks

- **Risk: the model still quotes durations from its own training prior,
  even with the negative instruction.** Likelihood: low. The same
  negative-instruction pattern ("Do NOT re-narrate the outline in
  chat") shipped in `story-bootstrap-prompt-no-inline-outline` and
  held up. Mitigation: if observed in the wild, escalate the
  instruction to the top of the role fragment (currently inside step
  4) and/or add a postamble reinforcement. Out of scope for this
  feature.
- **Risk: a future fragment edit accidentally re-introduces the
  "30–90 seconds" wording.** Mitigated by the negative-substring test
  in Unit 2.
- **Risk: configure-tools wording change is technically out of the
  scope sentence in the brief ("the bootstrap mode definition and the
  fragment file").** Resolution: the same explorer tool exists in
  configure mode, the same hazard exists, the change is one line in
  the same package directory. Treating it as out of scope would leave
  a known regression site, and reviewer cost is zero (identical
  parenthetical edit). Including it.

## Implementation notes (2026-05-14)

Landed inline as a single stride. All three template edits applied:

- `bootstrap-role.ts`: replaced step-4 ETA sentence with structural-progress instruction; added "Never quote durations or ETAs" bullet to chat-discipline block.
- `bootstrap-tools.ts`: removed "(30–90 seconds)" parenthetical from `course.start_exploration` entry; replaced with "do not quote ETAs" guidance.
- `configure-tools.ts`: same change for the Phase-11 configure-mode tool catalogue.

New test file: `packages/curriculum/src/modes/fragments/__tests__/bootstrap-no-time-estimate.test.ts` — 12 substring assertions (negative + positive) across all three fragments.

Verification: `pnpm --filter @praxis/curriculum test` → 415 tests, all green (28 existing test files + 1 new).

Note: the negative-substring guard for "30 seconds" forced one small wording tweak to the role-fragment example ("a few seconds" instead of "30 seconds") — the principle is preserved, the literal substring is no longer present anywhere.

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: 14 tests pass in the new `bootstrap-no-time-estimate.test.ts`. No children spawned (correct per the single-stride/tight-cohesion rubric). Three fragments edited; ETA wording removed; structural-progress guidance added; negative + positive substring guards landed. No foundation drift.
