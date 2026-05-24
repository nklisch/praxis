---
id: story-leading-symbol-spacing
kind: story
stage: implementing
tags: [ui, design-system]
parent: feature-design-system-polish-sweep
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Leading-symbol spacing: introduce a uniform token, apply across editorial primitives

## Brief
Leading symbols / icons that sit immediately before a word — in route headers, on the create-course screen, and elsewhere across the app — render too close to the word they precede. The gap between the glyph and its label needs to be widened consistently so the symbol reads as a leading mark rather than crashing into the text. Introduce a uniform spacing token (likely `--space-leading-symbol` or similar in `.mockups/design-system/tokens.css` + production tokens), apply it across the editorial primitives (`editorial-kicker`, `ornament`, etc.) and any inline symbol-plus-label patterns project-wide.

## Surfaces affected
- `RouteHeader` and `editorial-kicker` / ornament marks
- Course-create entry row (leading symbols on pack / upload / create-your-own options)
- Library section headers
- Any `<§ mark>label</§>` pattern in production CSS modules

## Source idea
`idea-leading-symbol-spacing` (parked 2026-05-24).
