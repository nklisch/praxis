---
id: epic-component-library-codify-and-sharpen-contract
kind: feature
stage: drafting
tags: []
parent: epic-component-library-codify-and-sharpen
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-19
---

# Design-system contract — components + motion

## Brief

Author the full design-system contract under `.mockups/design-system/`:
the two-tier `components.{html,css}` (tier 1 shared primitives + tier 2
selected domain widgets) and `motion.{html,css}` (named easing curves,
Doherty-coupled durations, designed pauses, reduced-motion fallbacks).
Both contracts ship from this feature as a single design pass — motion
runs alongside components per the locked epic decision, so the design
review covers a coherent visual + kinetic voice in one round.

The Studio Quiet sharpening pass folds in here: while authoring the
primitives, push italics, restraint of the brick accent, ornament-first
status signaling (no color-only state), and the editorial layout
patterns (asymmetric, hanging ornaments, dropped initials, sectional
rules, generous trapped white space) as the primitive defaults — so the
contract is more opinionated than what we have today, not less.

This feature delivers `.mockups/` artifacts only. No production code
changes. The migration that applies the contract is the sibling feature
`epic-component-library-codify-and-sharpen-sweep`, which depends on
this one.

## Epic context

- Parent epic: `epic-component-library-codify-and-sharpen`
- Position in epic: foundation feature — `epic-component-library-codify-and-sharpen-sweep`
  depends on this one's deliverables (`components.css`, `motion.css`)
  before it can apply them across the codebase.

## Foundation references

- `docs/UX.md` — Editorial language section + the new "Design-system
  contract" paragraph that names the two-tier `.mockups/design-system/`
  layout as canonical
- `.mockups/design-system/tokens.css` — locked color/type/spacing
  vocabulary (Studio Quiet); reusable as `var(--token)` references
- `packages/ui/src/components/{modal,route-header,empty-state,loading-state,error-message}.tsx`
  — current editorial primitives whose patterns get codified

## Tier-2 widget candidates (epic-design seed)

Identified by usage frequency during epic-design (counts = number of
files importing the component):

- `composer` (11) — message composer with sketch + verb-pills
- `assignment-item-card` (9) — assignment item card with status
- `claude-auth-modal` (6) — auth modal with Claude CLI status
- `library-section` (5) — editorial section heading + body
- `composer-verbs` (5) — verb-pill row inside composer
- `prompt-block` (4), `assignment-card` (4), `batch-summary-modal` (4),
  `concept-link-overlay` (4) — second-tier candidates

The feature-design pass selects the 4–6 widgets that actually warrant
hoisting. The criterion: heavy reuse + composes from primitives + the
shape would appear in mocks that live in `.mockups/screens/` or
`.mockups/flows/`. Per-feature compositions stay per-feature.

## Mockups

This feature IS the mockup work. Outputs land at:

- `.mockups/design-system/components.html` — two-tier showcase (every
  primitive + every selected domain widget, every state)
- `.mockups/design-system/components.css` — the contract; downstream
  mocks link via `<link rel="stylesheet" href="../../design-system/components.css">`
- `.mockups/design-system/motion.html` — motion showcase (every named
  curve + duration + spring playable in browser)
- `.mockups/design-system/motion.css` — motion vocabulary; downstream
  CSS modules adopt named tokens (e.g., `--ease-emphasized`,
  `--duration-quick`) instead of inline `cubic-bezier(...)`

Token gaps surfaced during components design extend `tokens.css`
in-place (the palette artifact already exists; refinement is allowed
when the contract genuinely needs new tokens).

The design pass runs `/ux-ui-design:components` and
`/ux-ui-design:motion` in sequence (motion depends on tokens.css; both
inform each other). The Studio Quiet aesthetic is locked — no aesthetic
re-pitching; the sharpening pass refines within the locked direction.