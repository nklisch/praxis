---
id: gate-tests-attach-document-configure-mode-includes
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
