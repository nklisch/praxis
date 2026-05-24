---
id: story-refactor-composer-verbs-contract-divergence
kind: story
stage: implementing
tags: [refactor, design-system, cleanup]
parent: feature-design-system-polish-sweep
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-24
---

# Refactor: relax the .composer-verbs widget contract to match production

## Brief
Surfaced during the review of `story-relax-composer-contract-to-match-production` (d4daae7). The standalone `.composer-verbs` widget in `.mockups/design-system/components.css` declares `.composer-verb` / `.composer-verb--active` child selectors, but production `packages/ui/src/components/composer-verbs.module.css` uses `.row` and `.chip` — same divergence pattern as the just-fixed composer/composerWrapper.

## Resolution
Same shape as the prior fix: relax the contract to describe the production structure (`.row` / `.chip`, or rename per BEM `composer-verbs__row` / `composer-verbs__chip`), update the showcase HTML to match, then rename the production module classes if a BEM alignment is chosen. Pure naming/contract work, no behavior change.

## Source idea
`idea-composer-verbs-contract-divergence` (parked 2026-05-23).
