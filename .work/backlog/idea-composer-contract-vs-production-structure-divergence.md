---
id: idea-composer-contract-vs-production-structure-divergence
kind: idea
stage: backlog
tags: []
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-20
updated: 2026-05-20
---

# Reconcile composer contract vs production structure

Surfaced during the design-system migration sweep (review of
`epic-component-library-codify-and-sharpen-sweep-step-4-composer-library-auth`,
which renamed three composer classes to match the tier-2 contract
selectors).

The tier-2 `.composer` widget in
`.mockups/design-system/components.css` is a 3-column grid. The
production composer in `packages/ui/src/components/composer.module.css`
is a flex-column shell wrapping a form row, with the sketch expansion
area and hints strip living outside what the contract describes. The
production wrapper class (`.composerWrapper`) was deliberately NOT
renamed to `.composer` during the sweep because that would have been a
naming lie — the structures differ.

Two ways to resolve, neither blocking:

1. **Restructure production** — rebuild the production composer as a
   3-column grid matching the contract. Cleaner contract, more work,
   visible visual change.
2. **Relax the contract** — update `.mockups/design-system/components.css`
   to describe the actual shipped composer (flex-column with form row +
   optional expansion areas). Less work, contract more accurately
   describes reality, accepts the existing shape.

Option 2 is probably right: the sketch expansion area and hints strip
are real product capabilities the showcase composer omitted. Treat the
showcase as the simplification; production is the truth.

Worth a small grooming pass during the next design-system iteration.
