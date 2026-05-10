---
id: gate-tests-metacognitive-prompts-exclusion-assertions
kind: story
stage: drafting
tags: [testing]
parent: null
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
