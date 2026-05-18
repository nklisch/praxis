---
id: investigate-flaky-use-fragment-overrides-test
kind: story
stage: implementing
tags: [testing]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Investigate flaky `use-fragment-overrides` UI test

## Brief

Multiple agents during the 2026-05-18 autopilot run reported a pre-existing
test failure in `packages/ui/src/hooks/__tests__/use-fragment-overrides.test.tsx`
(or similarly named — verify exact path). The failure reproduces on a clean
tree without any of the recent changes (loadOrThrow adoption, helper extracts,
branded IDs, comment sweep).

Symptoms reported:
- Reproduces cleanly on `main` before any 2026-05-18 commits
- Does NOT reproduce when run in isolation? (verify — agent reports were
  inconsistent on isolation behavior)
- Single test failing inside `use-fragment-overrides.test.tsx`

## Implementation plan

1. Reproduce the failure cleanly and capture the diff between expected and
   actual output.
2. Determine whether it's order-dependent (other tests poisoning state) or
   a genuine bug in the hook.
3. If order-dependent: identify the upstream test polluting state; tighten
   isolation (`beforeEach`/`afterEach`, module mocks, fresh stores).
4. If genuine bug: open a separate fix story for the hook and reference it
   from this one.
5. If neither: convert to `it.fails(...)` with a comment naming the
   investigation outcome and re-park if more analysis is needed.

Honest failing test beats a green test that lies — see the `test-integrity`
guidance in the autopilot skill.
