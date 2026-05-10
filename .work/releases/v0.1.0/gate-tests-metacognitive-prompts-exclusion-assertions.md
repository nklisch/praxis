---
id: gate-tests-metacognitive-prompts-exclusion-assertions
kind: story
stage: done
tags: [testing]
parent: feature-release-v0.1.0-test-findings
depends_on: []
release_binding: v0.1.0
gate_origin: tests
created: 2026-05-10
updated: 2026-05-10
---

# Negative assertions for metacognitive-prompts fragment exclusion

## Priority
Medium

## Spec reference
Item: `epic-phase-18-metacognitive-prompts-impl`
Acceptance criteria:
- "`study-skills` mode does NOT include this fragment (its role IS the coach voice)"
- "`bootstrap` and `configure` modes also do NOT include the metacognitive-prompts fragment"

## Gap type
Adversarial-spec-silent — exclusion asserted by absence-of-code only

## Suggested test

```ts
// Append to packages/curriculum/src/modes/__tests__/metacognitive-prompts-integration.test.ts
describe("modes that must NOT carry the metacognitive-prompts fragment", () => {
  it.each(["study-skills", "bootstrap", "configure"])(
    "%s mode has no metacognitive-prompts fragment",
    (modeId) => {
      const mode = requireMode(modeId);
      expect(mode.promptFragments.find((f) => f.id === "metacognitive-prompts"))
        .toBeUndefined();
    },
  );
});
```

## Test location (suggested)
`packages/curriculum/src/modes/__tests__/metacognitive-prompts-integration.test.ts`

## Rationale
Spec is explicit about exclusion; today the only protection is that the
imports aren't there. A future refactor that "helpfully" adds the fragment
to study-skills (where it would duplicate the role voice) or bootstrap
(pre-curricular onboarding) wouldn't trip any test.

## Implementation notes
Added a `describe` block using `it.each` over `[["study-skills", studySkillsMode], ["bootstrap", bootstrapMode], ["configure", configureMode]]` — imported the three mode objects directly (same pattern as the existing opt-in tests, no `requireMode` indirection needed). All 37 tests pass.

## Review (2026-05-10)

Approve. All 3 required modes covered (study-skills, bootstrap,
configure). Implementation uses direct mode imports with `as const`
tuples — cleaner than the suggested `requireMode` indirection, and
equally correct. Reuses `METACOGNITIVE_FRAGMENT_ID` constant from the
existing file — no magic string duplication. The `toBeUndefined()`
assertion on the live mode object means any future refactor that wires
in the fragment will trip the test. No tautology; no blockers.
