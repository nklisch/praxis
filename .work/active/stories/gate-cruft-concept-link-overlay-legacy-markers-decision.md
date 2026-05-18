---
id: gate-cruft-concept-link-overlay-legacy-markers-decision
kind: story
stage: drafting
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
Decide:
- (a) The § marker rendering is genuinely unused/legacy in practice. Then
  delete the state declaration (116-117), the effect that populates it
  (206-223), and the render block (382-388).
- (b) It is still load-bearing for the user-visible affordance. Then
  reword the comment to remove "legacy — kept for backwards compat" and
  describe what the § markers are for in the current behavior.

Either path: Praxis convention forbids `// backwards compat` framing — the
comment must change. Likely surgical decision: trace any place that adds to
`markers` in real flows (concept-map tab interactions) and confirm visibility
in the current UI. Outcome may be a tiny commit either way.
