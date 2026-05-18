---
id: epic-backend-fills-for-redesign-ui-completion-bundle-quiz-confidence-debounce-fix
kind: story
stage: implementing
tags: [bug]
parent: epic-backend-fills-for-redesign-ui-completion-bundle
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Fix: debounce timer silently clears confidence after selection

## Context

Review finding from `epic-backend-fills-for-redesign-ui-completion-bundle-quiz-confidence`.

## Bug

In `packages/ui/src/hooks/use-assignment.ts`, `recordResponse` uses
`useCallback` with `confidences` in its dependency array. When the student
selects a confidence level, `recordConfidence` updates local state and
immediately persists to DB. React then re-creates `recordResponse` — but any
**already-scheduled debounce timer** holds a stale closure over the old
`confidences` Map (before the confidence was set). When that timer fires 1 s
later, `confidences.get(itemId)` returns `undefined`, the service receives no
`confidence` field, and the upsert writes `confidence = null` — silently
overwriting the just-persisted confidence value.

## Reproduction scenario

1. Student types an answer → debounce timer T starts (old closure, no confidence yet).
2. Student clicks "certain" → `recordConfidence` fires, immediately persists
   `confidence = "certain"` to DB. React re-creates `recordResponse` with the
   new `confidences` Map.
3. Timer T fires 1 s later using the old closure → sends
   `recordResponse({ response, confidence: undefined })` → DB upsert sets
   `confidence = null`.

## Fix

Replace the captured `confidences` Map in the debounce closure with a
`useRef` that always points to the current confidences value.

```ts
// In useAssignment — add near the top of the function body:
const confidencesRef = useRef(confidences);
useEffect(() => { confidencesRef.current = confidences; }, [confidences]);

// In the setTimeout callback, replace:
//   const currentConfidence = confidences.get(itemId);
// with:
//   const currentConfidence = confidencesRef.current.get(itemId);
```

Remove `confidences` from `recordResponse`'s `useCallback` dependency array
after this change (the ref removes the need for it).

## Tests

Add a test to `assignment-item-card.test.tsx` or `use-assignment` test (if one
exists) verifying that confidence is not cleared when a debounced response save
fires after confidence was already selected.
