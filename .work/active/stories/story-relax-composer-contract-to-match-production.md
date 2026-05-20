---
id: story-relax-composer-contract-to-match-production
kind: story
stage: implementing
tags: [design-system, cleanup]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-20
updated: 2026-05-20
---

# Relax composer contract to match production structure

## Brief

The tier-2 `.composer` widget in `.mockups/design-system/components.css`
declares a 3-column grid. The production composer in
`packages/ui/src/components/composer.module.css` is a flex-column shell
(`.composerWrapper`) wrapping a flex form row, with the sketch expansion
area and hints strip living outside what the grid contract describes.
The production wrapper was deliberately NOT renamed to `.composer`
during the sweep (`epic-component-library-codify-and-sharpen-sweep-step-4-composer-library-auth`,
archived) because doing so would have been a naming lie — the structures
differ.

Resolution direction (decided in the idea, not in question here): treat
the production composer as the truth and relax the showcase contract to
describe what actually ships. The sketch expansion area and hints strip
are real product capabilities the showcase composer simplified away;
production isn't going to drop them, so the contract should describe
them instead of pretending the simpler shape is canonical.

## Scope

Two-file grooming pass plus a one-file rename:

1. `.mockups/design-system/components.css` — rewrite the `.composer`
   block (around lines 776-785) from a 3-column grid into a flex-column
   wrapper with an inner flex form row. Keep child selectors
   (`.composer__verbs`, `.composer__sketch-button`, `.composer__input`,
   `.composer__send`) — only the outer container layout changes. Add
   contract-side selectors for the production-only structure:
   `.composer__form` (the flex form row), `.composer__hints` (the
   trailing mono hint strip), and an optional sketch-expansion slot
   marker. Match the shipped structure closely enough that the
   production module's class names map 1:1 to the contract.

2. `.mockups/design-system/components.html` — update the `.composer`
   demo (around lines 518-530) to reflect the new shape: an outer
   `.composer` element with an inner `.composer__form` row (verbs
   row + sketch button + textarea + send button) plus a
   `.composer__hints` strip beneath it. The point is the showcase
   composer should visibly demonstrate the production shape.

3. `packages/ui/src/components/composer.module.css` — rename the outer
   wrapper class `composerWrapper` → `composer` now that the contract
   matches. Rewrite the contract-note comment block at the top of the
   file (or remove it — the divergence it documented is gone).

Update all `composer.module.css` consumers in
`packages/ui/src/components/` to reference the new class name.

## Acceptance

- `.mockups/design-system/components.css` `.composer` block describes a
  flex-column wrapper with an inner flex form row, hints strip, and
  optional sketch expansion area — no grid.
- `.mockups/design-system/components.html` composer demo renders the
  new structure (form row + hints strip visible in the showcase).
- `packages/ui/src/components/composer.module.css` outer wrapper class
  is `composer` (not `composerWrapper`); contract-divergence comment
  is rewritten or removed.
- All `composer.module.css` consumers updated to reference the new
  class name; `pnpm typecheck && pnpm lint && pnpm test` green.
- No visual diff in the production composer — this story is a contract
  / naming alignment, not a visual redesign.

## Out of scope

- Restructuring the production composer to a grid (option 1 from the
  idea — explicitly rejected by the resolution direction).
- Changing the sketch expansion behavior, the hints strip copy, or the
  verbs row.
- Any other tier-2 contract reconciliation work — this story is
  composer-only. If similar divergences exist elsewhere in tier-2,
  surface them as new backlog items.
