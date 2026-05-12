---
id: gate-tests-list-dangling-refs-contract-divergence
kind: story
stage: drafting
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

## Suggested resolution
Surface for review:
- If "throw" is the right contract → rewrite test names to document the rationale ("contract: tool throws on missing draft — design's empty+warning alternative was rejected because ...") and update the feature body to reflect.
- If "empty+warning" is the right contract → change the implementation and tests across all 4 list tools (`list_dangling_refs`, plus the three sibling query tools).

## Test location (suggested)
`packages/tools/src/course/__tests__/list-dangling-refs.test.ts` (and siblings)
