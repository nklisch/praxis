---
id: gate-tests-list-dangling-refs-contract-divergence
kind: story
stage: implementing
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: tests
created: 2026-05-12
updated: 2026-05-12
---

# `course.list_dangling_refs` (and siblings) "draft-not-found" contract — design preferred empty+warning, impl picked throw

## Priority
Medium

## Spec reference
Item: `epic-bootstrap-readiness-expressive-draft-api-query-tools` (Unit 2)
Acceptance criterion (design): "All four tools share a 'draft not found' handler shape: return an output with empty arrays + a single warning string. Or, alternatively, the tool throws... Pick one and use it consistently. **Prefer the 'return empty + warning' pattern since `course.list_*` tools shouldn't fail-hard.**"

## Gap type
tautological-rework / spec-vs-impl divergence — current handler tests assert "throws when draft is not found." Either the design's preference was inverted in implementation, or the design statement is stale. A test pinning the actual contract resolves which it is.

## Resolution (autopilot judgment)
Pick **"throw" as the contract** — current implementation behavior. Rationale: the design's stated preference for "empty+warning" would lose the distinction between "draft doesn't exist (caller error)" and "draft exists but is empty (legitimate empty state)". Lock current behavior in tests with explicit rationale in test names.

## Implementation direction
- Rewrite the existing tests' descriptions to document the rationale, e.g. `it("throws when draft does not exist — distinguishes draft-not-found from draft-empty")`.
- Add a brief note to the feature body (`epic-bootstrap-readiness-expressive-draft-api`) documenting that the design's empty+warning alternative was rejected for this reason.

## Test location (suggested)
`packages/tools/src/course/__tests__/list-dangling-refs.test.ts` (and siblings)
