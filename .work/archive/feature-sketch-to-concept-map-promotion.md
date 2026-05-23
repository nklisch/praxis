---
id: feature-sketch-to-concept-map-promotion
kind: feature
stage: drafting
tags: [ui, content]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-23
---

# Sketch to concept-map promotion

## Brief

The sketch → concept-map conversion is described end-to-end in
`.mockups/flows/sketch-to-concept-map/` but there is no user-facing CTA
wired into the sketch editor today. Sketches live as a note format;
concept-maps are managed separately; the connecting affordance ("turn
this sketch into a concept map") doesn't exist in the UI.

The conversion itself may already have backend pieces (shape recognition,
canonical linkage in the concept-map editor) — but the entry point is
missing. Build the CTA: likely a "Promote to concept map" action in the
sketch note editor that opens the concept-map editor pre-populated with
the sketch's shapes, so the journey the existing mock describes becomes
reachable.

## Design questions for feature-design

- Confirm what backend pieces already exist (shape recognition, canonical
  linkage) and what — if anything — needs to ship alongside the CTA.
- Decide CTA placement and copy in the sketch editor.
- Decide the navigation behavior: open the new concept-map in a tab,
  inline-promote into the same tab, or surface a confirmation step
  first.

## Mockups

Existing flow: `.mockups/flows/sketch-to-concept-map/`. `feature-design`
confirms this is still the intended journey or proposes refinements.
