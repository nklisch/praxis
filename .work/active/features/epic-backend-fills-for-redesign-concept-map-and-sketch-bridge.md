---
id: epic-backend-fills-for-redesign-concept-map-and-sketch-bridge
kind: feature
stage: drafting
tags: []
parent: epic-backend-fills-for-redesign
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Concept-map UX completion + Sketch ↔ concept-map conversion

## Brief

Two tightly-related additions to the concept-map editor surface:

**Concept-map best-guess UX.** The locked editor mock distinguishes
three node states: **linked ✓** (canonical link confirmed),
**best-guess ?** (Praxis's tentative link awaiting confirmation), and
**unlinked** (default). Canonical-link matching infrastructure exists
(`ConceptLinkOverlay`, `CanonicalHintsOverlay`); what's missing is the
three-state model, the per-candidate confidence display, the
**hover-to-preview ghost edges** (show how a candidate link would
connect to the canonical graph before committing), and the
**ripples panel** (compute downstream effects of a link confirmation
— concept count delta, notes re-tagged, tutor references — and
display them).

**Sketch ↔ concept-map conversion.** The locked sketch editor shows
a `↗ convert to concept map` bridge. This feature adds a conversion
service: extract candidate nodes from labelled tldraw text shapes,
create a new concept-map artifact, preserve the original sketch
alongside (default keep-both), and support a 24h undo window.

What this feature does **not** cover: the editor UI shells (already
in workspace feature implementation); tldraw integration (already
shipped); the canonical knowledge graph (already shipped).

## Epic context

- Parent epic: `epic-backend-fills-for-redesign`
- Position in epic: **independent** — no within-epic deps.
- UI co-ships with: `epic-ui-redesign-ground-up-workspace`
  implementation (consumes both the new states and the conversion).

## Foundation references

- `docs/ARCHITECTURE.md` § "Artifact lifecycle" → concept maps
  paragraph mentions `ConceptMapDrawing` artifacts and canonical
  linking
- `packages/core/src/services/concept-map-service.ts` — extends with
  the three-state + ripples + conversion APIs
- `packages/ui/src/components/concept-link-overlay.tsx` and
  `canonical-hints-overlay.tsx` — existing overlay primitives the
  new UX extends
- `.mockups/screens/.../-workspace/concept-map-editor.html` and
  `.mockups/flows/concept-map-link/` — locked editor + the 4-step
  link-confirmation flow
- `.mockups/flows/sketch-to-concept-map/` — the conversion flow

<!-- Two sub-capabilities ship together because they share the
concept-map editor surface and the canonical knowledge-graph
queries; splitting would force redundant work. -->
