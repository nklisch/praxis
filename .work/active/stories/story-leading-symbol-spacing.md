---
id: story-leading-symbol-spacing
kind: story
stage: review
tags: [ui, design-system]
parent: feature-design-system-polish-sweep
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-25
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

## Implementation notes (2026-05-25)

**Token introduced**: `--space-leading-symbol: 0.35em` — added to both:
- `packages/ui/src/styles/global.css` (production tokens, with full doc comment)
- `.mockups/design-system/tokens.css` (mock tokens, kept in sync)

The value `0.35em` is relative to the element's own font-size, so it scales correctly across all the different kicker/ornament font sizes used in the system (0.6rem, 0.62rem, 0.65rem, 11px, etc.).

**Applied across**:

| File | Location | Change |
|---|---|---|
| `packages/ui/src/components/route-header.module.css` | `.kicker { gap }` | `0.55rem` → `var(--space-leading-symbol, 0.55rem)` |
| `packages/ui/src/components/library/library-section.module.css` | `.sectionHeader { gap }` | `0.65rem` → `var(--space-leading-symbol, 0.65rem)` |
| `packages/ui/src/components/top-nav.module.css` | `.link { gap }` | `var(--space-1-5)` → `var(--space-leading-symbol, var(--space-1-5))` |
| `packages/ui/src/routes/course-create.module.css` | `.kicker { gap }` | `var(--space-2)` → `var(--space-leading-symbol, var(--space-2))` |
| `.mockups/design-system/components.css` | `.editorial-kicker { gap }` | `var(--space-2)` → `var(--space-leading-symbol)` |

**Design note**: Using `var(--token, fallback)` in production means the old value is preserved if token is ever missing (defense-in-depth). The mockup uses the token directly since tokens.css is always loaded there.

**Surfaces not touched**: `::before` pseudo-elements with `content:` symbol patterns (chevrons in `draft-card.module.css`, `note-card.module.css`) were intentionally excluded — those are expand/collapse indicators that depend on their exact positioning and don't follow the leading-symbol pattern.

No new failing tests. No pre-existing lint errors introduced.
