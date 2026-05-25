---
id: story-refactor-composer-verbs-contract-divergence
kind: story
stage: review
tags: [refactor, design-system, cleanup]
parent: feature-design-system-polish-sweep
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-25
---

# Refactor: relax the .composer-verbs widget contract to match production

## Brief
Surfaced during the review of `story-relax-composer-contract-to-match-production` (d4daae7). The standalone `.composer-verbs` widget in `.mockups/design-system/components.css` declares `.composer-verb` / `.composer-verb--active` child selectors, but production `packages/ui/src/components/composer-verbs.module.css` uses `.row` and `.chip` — same divergence pattern as the just-fixed composer/composerWrapper.

## Resolution
Same shape as the prior fix: relax the contract to describe the production structure (`.row` / `.chip`, or rename per BEM `composer-verbs__row` / `composer-verbs__chip`), update the showcase HTML to match, then rename the production module classes if a BEM alignment is chosen. Pure naming/contract work, no behavior change.

## Source idea
`idea-composer-verbs-contract-divergence` (parked 2026-05-23).

## Implementation notes (2026-05-25)

**Discovery**: The mockup CSS (`components.css`) had no `.composer-verbs` CSS rules at all — only a comment in the `.composer` block noting that "The verbs row is a separate sibling widget". The brief described the divergence as if CSS rules existed with the wrong class names (`.composer-verb` / `.composer-verb--active`), but they were simply absent.

**Resolution chosen**: Add the missing `.composer-verbs` widget definition to the mockup CSS using **BEM-aligned names** that document the production structure:
- Outer wrapper: `.composer-verbs` (maps to `styles.row` div in production TSX)
- Row container: `.composer-verbs__row` (maps to production `.row`)
- Individual chips: `.composer-verbs__chip` (maps to production `.chip`)

Production classes (`.row`, `.chip`) were **not renamed** — the production module already uses clear, scoped names within CSS Modules hashing. The BEM names live only in the mockup as documentation.

**Files changed**:

1. **`.mockups/design-system/components.css`**: Added `.composer-verbs`, `.composer-verbs__row`, `.composer-verbs__chip` (with `::after` hairline + hover transitions) with full doc comment explaining the class-name mapping. Updated the `.composer` block comment to say "separate sibling widget" clearly.

2. **`.mockups/design-system/components.html`**: Added showcase in the Tier 2 composer cell — shows the verbs rail above the composer shell, with a class-map comment, includes a disabled chip to demonstrate the opacity state.

**Verified**: buttons in the new showcase have `type="button"` so no new biome lint errors are introduced. Total components.html error count stays at 50 (all pre-existing).
