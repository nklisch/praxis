---
id: gate-tests-library-picker-drag-overlay-child-leave-guard
kind: story
stage: implementing
tags: [testing, ui]
parent: feature-gate-tests-v0.1.4-coverage-sweep
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-23
updated: 2026-05-23
---

# Drop-overlay child-leave guard is comment-only — no test exercises it

## Priority
Low — from gate-tests on release v0.1.4.

## Spec reference
Item: `story-inline-upload-in-attach-from-library`
From feature `## Risks`:
> Drop targeting on nested elements. `onDragLeave` fires when crossing
> into a child element, which would falsely clear the overlay.
> Mitigated by the `e.currentTarget === e.target` guard or by using a
> drag-counter pattern.

## Gap type
adversarial-spec-silent — risk acknowledged, mitigation in code, but
no test verifies that dragging over a child element doesn't dismiss
the overlay.

## Suggested test
```ts
it("drag-over from list-area to a child list-row keeps the drop overlay visible", async () => {
  // dragOver listArea (overlay shows) → dragLeave from a child
  // (currentTarget !== target) → overlay still visible.
});
```

## Test location (suggested)
`packages/ui/src/__tests__/library-document-picker.test.tsx`
