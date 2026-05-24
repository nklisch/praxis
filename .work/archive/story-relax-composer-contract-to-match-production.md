---
id: story-relax-composer-contract-to-match-production
kind: story
stage: done
tags: [design-system, cleanup]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-20
updated: 2026-05-23
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

## Implementation notes

- Files changed:
  - `.mockups/design-system/components.css` — rewrote the `.composer`
    block from a 3-col grid to a flex-column shell; added selectors for
    `.composer__form` (flex row), `.composer__buttons` (vertical button
    stack), `.composer__sketch-container` + `--open` modifier, and
    `.composer__hints`; refreshed the file-header tier-2 selector
    inventory; dropped the never-shipped `.composer__verbs`/
    `.composer-verb`/`.composer-verb--active` selectors (verbs ship as
    a separate sibling widget `.composer-verbs`, not a child of
    `.composer`).
  - `.mockups/design-system/components.html` — restructured the
    composer demo to the new shape: `.composer` → optional
    `.composer__sketch-container` → `.composer__form` (textarea +
    `.composer__buttons` containing sketch + send) → `.composer__hints`.
    Added explicit `type="button"` / `type="submit"` to the demo
    buttons (net -4 useButtonType lint offenders in the file).
  - `packages/ui/src/components/composer.module.css` — renamed
    `composerWrapper` → `composer`, `form` → `composer__form`,
    `hints` → `composer__hints`, `sketchContainer` →
    `composer__sketch-container`, `sketchOpen` →
    `composer__sketch-container--open`, `sketchAttached` →
    `composer__sketch-attached`, `sketchDetachBtn` →
    `composer__sketch-detach`, `buttonGroup` → `composer__buttons`,
    `sketchToggleActive` → `composer__sketch-button--active`.
    Replaced the contract-divergence header comment block with a
    one-paragraph alignment note pointing at the relaxed contract.
  - `packages/ui/src/components/composer.tsx` — updated every
    `styles.X` reference to the new BEM names; kebab/modifier names use
    bracket access (`styles["composer__sketch-container--open"]`).
- Tests added: none — this is a pure rename + contract grooming pass
  with no behavior change. Existing `composer.test.tsx` (9 tests) and
  `composer-verbs.test.tsx` (13 tests) continue to pass, exercising
  rendered DOM rather than class names so they were unaffected by the
  rename.
- Discrepancies from design: the story body anticipated that verbs
  belonged inside `.composer` ("Keep child selectors" with a verbs row
  in the contract showcase). In reality, the verbs row is a separate
  sibling widget (`packages/ui/src/components/composer-verbs.tsx` with
  its own `composer-verbs.module.css` using `.row`/`.chip`), composed
  by the parent layout alongside `<Composer>`. Verbs were dropped from
  the `.composer` contract block accordingly. The standalone
  `.composer-verbs` widget contract is itself drifted (uses `.chip`,
  not the contract's `.composer-verb`) — flagging but leaving for a
  future story per this story's "out of scope" rule.
- Adjacent issues parked: none filed yet — the `composer-verbs` /
  `.chip` divergence noted above is a candidate, but a separate
  follow-up story would be the right place rather than ad-hoc parking.
- Verification: `pnpm --filter @praxis/ui typecheck` clean,
  `pnpm --filter @praxis/ui test` all 1628 tests pass, lint on touched
  files shows only pre-existing offenders unrelated to this change
  (net -4 useButtonType errors in `components.html`).

## Review (2026-05-23)

**Verdict**: Approve

Clean BEM rename across .composer module + matching contract relaxation in
showcase CSS/HTML. The deviation from the brief (verbs ship as sibling
widget, not child of .composer) was discovered during implementation and
documented in notes — implementer made the right call dropping verbs from
the .composer contract. The .composer-verbs / .chip divergence flagged in
notes is filed as `idea-composer-verbs-contract-divergence` for a follow-up.

No tests added is correct — pure rename pass; existing composer.test.tsx
and composer-verbs.test.tsx (22 tests combined) exercise rendered DOM not
class names, so they continue to validate behavior.

**Blockers**: none
**Important**: none
**Nits**:
- Mixed access: `styles.composer` (camel-looking but is now the BEM root)
  alongside `styles["composer__sketch-container--open"]` (bracket access
  for kebab modifiers). Consistent within the constraints of BEM-in-CSS-
  modules — no fix needed, just worth noting that BEM and CSS modules
  have this minor friction.

**Notes**: Story has no parent — archive after review.
