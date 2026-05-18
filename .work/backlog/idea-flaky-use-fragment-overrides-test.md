---
id: idea-flaky-use-fragment-overrides-test
kind: idea
tags: [testing]
created: 2026-05-18
---

# Flaky `use-fragment-overrides` UI test

Multiple agents during the 2026-05-18 autopilot run reported a pre-existing
test failure in `packages/ui/src/hooks/__tests__/use-fragment-overrides.test.tsx`
(or similarly named — verify exact path). The failure reproduces on a clean
tree without any of the recent changes (loadOrThrow adoption, helper
extracts, branded IDs, comment sweep).

Symptoms:
- Reproduces cleanly on `main` before any 2026-05-18 commits
- Does NOT reproduce when run in isolation? (verify — agent reports were
  inconsistent on isolation behavior)
- Single test failing inside `use-fragment-overrides.test.tsx`

Scope a story to:

1. Reproduce the failure cleanly and capture the diff between expected and
   actual
2. Determine whether it's order-dependent (other tests poisoning state) or
   a genuine bug in the hook
3. If order-dependent: identify the upstream test polluting state; tighten
   isolation
4. If genuine bug: open a separate fix story for the hook
5. If neither: convert to `it.fails(...)` with a comment naming the
   investigation outcome and re-park if more analysis is needed

Honest failing test beats a green test that lies — see the `test-integrity`
guidance in the autopilot skill.
