---
id: idea-composer-verbs-contract-divergence
kind: idea
stage: null
tags: [design-system, cleanup]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# Composer-verbs widget contract divergence

Surfaced during the review of `story-relax-composer-contract-to-match-production`
(d4daae7). The standalone `.composer-verbs` widget in
`.mockups/design-system/components.css` declares `.composer-verb` /
`.composer-verb--active` child selectors, but the production
`packages/ui/src/components/composer-verbs.module.css` uses `.row` and
`.chip` — same divergence pattern as the just-fixed composer/composerWrapper.

Same resolution shape applies: relax the contract to describe the
production structure (`.row` / `.chip` or rename per BEM
`composer-verbs__row` / `composer-verbs__chip`), update the showcase HTML
to match, then rename the production module classes if a BEM alignment is
chosen. Pure naming/contract work, no behavior change.

Scope as a story when the design-system sweep picks up the next divergence.
