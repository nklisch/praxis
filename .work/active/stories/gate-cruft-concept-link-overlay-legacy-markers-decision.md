---
id: gate-cruft-concept-link-overlay-legacy-markers-decision
kind: story
stage: review
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: cruft
created: 2026-05-18
updated: 2026-05-18
---

# `concept-link-overlay.tsx` "§ markers (legacy — kept for backwards compat)" decision

## Confidence
Medium

## Category
legacy-comment / possible compatibility shim

## Location
`packages/ui/src/components/concept-link-overlay.tsx:116-117` (state),
`:206-223` (effect), `:382-388` (render)

## Evidence
```ts
// § markers for linked shapes (legacy — kept for backwards compat).
const [markers, setMarkers] = useState<MarkerState[]>([]);
```

The `markers.map(...)` render block at line 383 is still active, rendered
alongside the three-state glyph markers.

## Removal

**Design decision (2026-05-18)**: dead — delete the path.

- Remove the `MarkerState` interface (line 12-17 or wherever it's defined).
- Remove `const [markers, setMarkers] = useState<MarkerState[]>([])` (line 116-117).
- Remove the effect that populates `setMarkers` (line 206-223).
- Remove the `markers.map(...)` render block (line 382-388).
- Trim any local helpers reachable only by the deleted block.
- Run `pnpm typecheck && pnpm lint && pnpm test` to confirm no
  unintentional cascades.

If the deletion uncovers a user-visible regression in concept-map link
rendering (caught by manual smoke or existing UI tests), revert and
re-classify; otherwise treat the path as dead per the gate-cruft finding.

## Implementation notes (2026-05-18)

Deleted the following from `packages/ui/src/components/concept-link-overlay.tsx`:

- `MarkerState` interface (lines 93–97 in original)
- `const [markers, setMarkers] = useState<MarkerState[]>([])` state and comment (lines 116–117)
- The `useEffect` that populated `setMarkers` from `map.conceptLinks` (lines 206–223)
- The `markers.map(...)` JSX render block rendering `§` spans with `styles.linkedMarker` (lines 382–393)
- The unused `ShapeBoundsScreen` interface that lint surfaced during the cleanup pass

Also deleted from `packages/ui/src/components/concept-link-overlay.module.css`:

- `.linkedMarker` CSS class (the `§` ornament style, lines 106–116)

Also updated `packages/ui/src/__tests__/concept-link-overlay.test.tsx`:

- Removed the "renders § markers for linked shapes" test case (it was asserting directly on the now-deleted render path)
- Removed the now-unused `CourseId` import

Verification passed:
- `pnpm --filter @praxis/ui typecheck` — clean
- `pnpm biome check` on all touched files — clean
- `pnpm --filter @praxis/ui test` — 155 test files, 1599 tests, all passed
- `grep -rn "MarkerState|setMarkers|linkedMarker"` across packages — zero results

