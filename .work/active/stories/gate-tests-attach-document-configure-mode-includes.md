---
id: gate-tests-attach-document-configure-mode-includes
kind: story
stage: review
tags: [testing]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: tests
created: 2026-05-12
updated: 2026-05-12
---

# `course.attach_document` symmetry: present in `configureMode.toolNames` is not asserted

## Priority
Medium

## Spec reference
Item: `story-bootstrap-attach-document-fix`
Acceptance criterion: "A regression test asserts the tool is absent from `bootstrapMode.toolNames`. ... The tool itself stays available in `configureMode.toolNames` where a course can actually be in scope."

## Gap type
Missing test for valid partition (regression-symmetry assertion)

## Suggested test
```ts
// packages/curriculum/src/modes/__tests__/bootstrap-toolnames.test.ts
it("course.attach_document IS still in configureMode.toolNames (course-scoped sessions only)", () => {
  expect(configureMode.toolNames).toContain("course.attach_document");
});
```

## Test location (suggested)
`packages/curriculum/src/modes/__tests__/bootstrap-toolnames.test.ts`

## Implementation notes

Added the symmetry assertion inside the existing `"bootstrapMode.toolNames — excluded tools"` describe block in `packages/curriculum/src/modes/__tests__/bootstrap-toolnames.test.ts`. The new test imports `configureMode` from `../configure.js` and asserts `configureMode.toolNames` contains `"course.attach_document"`, sitting directly below its sibling exclusion test so future readers see them as a matched pair. All 368 curriculum tests pass; typecheck clean.
