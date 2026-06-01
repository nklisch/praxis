---
id: bug-scan-concept-map-stale-concepts
kind: story
stage: review
tags: [bug, state]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-05-31
bug_origin: scan
bug_severity: medium
bug_domain: state
bug_location: packages/ui/src/routes/concept-map-editor.tsx:126
---

# Concept map concepts can be overwritten by an older course response

**Location**: `packages/ui/src/routes/concept-map-editor.tsx:126` · **Severity**: medium · **Pattern**: React async effect race / out-of-order response

When `courseId` changes while a previous `concepts()` request is pending, the older request can resolve last and populate match candidates for the wrong course. Add a cancellation/version guard and only call `setConcepts` when the request still matches the latest course ID.

```ts
useEffect(() => {
  if (!courseId) return;
client.artifacts
  .concepts(courseId as CourseId)
  .then(setConcepts)
  .catch(() => {});
}, [client, courseId]);
```

## Implementation notes

- Changed `packages/ui/src/routes/concept-map-editor.tsx` to clear canonical concepts when the route course changes and ignore stale `artifacts.concepts()` responses after effect cleanup.
- Removed the unnecessary `courseId as CourseId` cast at the fetch boundary.
- Added out-of-order response regression coverage in `packages/ui/src/__tests__/concept-map-editor-route.test.tsx`.
