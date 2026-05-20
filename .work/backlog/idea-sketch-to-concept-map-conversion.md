---
id: idea-sketch-to-concept-map-conversion
created: 2026-05-19
tags: []
---

The sketch → concept-map conversion is described end-to-end in
`.mockups/flows/sketch-to-concept-map/` but there is no user-facing CTA
wired into the sketch editor today. Sketches live as a note format;
concept-maps are managed separately; the connecting affordance ("turn
this sketch into a concept map") doesn't exist in the UI. The conversion
itself may already have backend pieces (shape recognition, canonical
linkage in the concept-map editor) but the entry point is missing.
Build the CTA — likely a "Promote to concept map" action in the sketch
note editor that opens the concept-map editor pre-populated with the
sketch's shapes — so the journey the mock describes becomes reachable.
