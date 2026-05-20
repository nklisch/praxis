---
id: epic-component-library-codify-and-sharpen
kind: epic
stage: drafting
tags: []
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-19
---

# Component library: codify and sharpen

## Brief

Unify the Praxis UI by codifying the existing component layer into a proper
design-system contract at `.mockups/design-system/`, sharpening the locked
Studio Quiet voice during the pass, and sweeping every production component
onto the new contract in one focused migration.

Today the project has ~200 component files in `packages/ui/src/components/`
plus editorial primitives (`Modal`, `RouteHeader`, `EmptyState`,
`LoadingState`, `ErrorMessage`, the `composes: editorial from global` CSS
utility) and strong token adoption (~3192 `var()` references, ~92%
tokenised). But the editorial primitives are only used in ~47 of those
files, ~262 raw color/spacing values still drift, and
`.mockups/design-system/components.{html,css}` doesn't exist yet — so
mocks can't link a shared contract and migration drift goes unflagged.
The voice (Studio Quiet — warm off-white, true near-black, muted brick
accent, system serif italics) is also expressed unevenly: some components
lean into it (the editorial primitives), others use the tokens but feel
generic, and the older cards (`artifact-card`, `assignment-card`,
`citation-chip`) carry inline values from before the editorial pass.

The epic delivers three intertwined outcomes:

1. **Codify** — produce the design-system contract: `components.html` +
   `components.css` (two-tier — primitives + selected domain widgets) and
   `motion.html` + `motion.css` (named easing curves, Doherty-coupled
   durations, designed pauses, reduced-motion fallbacks). The
   tier-1 primitives lift from current editorial primitives + the missing
   common slots (`btn`, `input`/`field`, `card`, `tabs`, `badge`,
   `dropdown`) drawn from the most-used patterns already in code. The
   tier-2 widgets hoist the heavily-reused domain compositions
   (`ArtifactCard`, `AssignmentCard`, `CitationChip`, and ~1-3 others
   identified during design) so future mocks can render full surfaces
   from the contract alone.

2. **Sharpen** — during codification, push the Studio Quiet voice more
   deliberately: stronger italic display, more disciplined use of the
   muted brick accent (restraint is the point), ornament-first status
   signaling everywhere (no color-only state), the editorial layout
   patterns (asymmetric, hanging ornaments, dropped initials, sectional
   rules, generous trapped white space) baked into the primitive
   defaults. Output is more opinionated than today's average.

3. **Migrate** — one big-bang sweep feature applies the new contract to
   every UI file: every component composes the editorial CSS utility
   or a tier-1 primitive class, every raw color/spacing value goes to
   `var(--token)`, every domain card/widget either uses its tier-2
   class or is documented as why-not in the sweep notes. The sweep
   also lands the new motion language across the codebase (every
   bespoke `transition`/`@keyframes` adopts the named curves +
   durations from `motion.css`).

## Strategic decisions

- **Migration approach**: big-bang sweep — one dedicated feature that
  walks every UI file applying primitives + token replacement + motion
  language in a single pass. High disruption but uniform output;
  prevents the "incremental migration that never finishes" trap. Motion
  rides along as a parallel note within the sweep — every transition
  touched during the migration moves to the new motion vocabulary.
- **DS scope**: two-tier — tier 1 (editorial primitives + common slots:
  Modal, RouteHeader, EmptyState, LoadingState, ErrorMessage, button,
  input/field, card, tabs, badge, dropdown) and tier 2 (a "domain
  widgets" layer for the heavily-reused project-unique cards/widgets,
  composed from primitives, so mocks can render full surfaces from the
  contract alone). Project-unique components that aren't heavily reused
  stay per-feature.
- **Motion lock-in**: include in this arc — run `/ux-ui-design:motion`
  alongside `/ux-ui-design:components` so `motion.css` lands in the
  same epic. While we're already touching every component for the
  migration sweep, sharpening the kinetic language has zero marginal
  cost; doing it later would require a second sweep.

## Foundation roll-forward

- `docs/UX.md` — added a "Design-system contract" paragraph to the
  Editorial language section. The two-tier `.mockups/design-system/`
  contract (`tokens.css` + `components.css` + `motion.css`) is now
  named as the canonical authoring location; raw color/spacing in CSS
  modules is named as drift. Locked at scope time so the design family
  decomposing this epic inherits the framing.

## Mockups

Will be produced by `/ux-ui-design:components` + `/ux-ui-design:motion`
during epic-design / feature-design. Expected outputs:
- `.mockups/design-system/components.html` (two-tier showcase)
- `.mockups/design-system/components.css` (the contract)
- `.mockups/design-system/motion.html` (motion showcase)
- `.mockups/design-system/motion.css` (motion vocabulary)

The `palette` artifacts (`tokens.css`, `palette.html`, `typography.html`)
already exist and are NOT regenerated by this epic.

## Decomposition (handed to /agile-workflow:epic-design)

This epic should decompose into roughly three features — exact shape
is epic-design's call:

1. **Codify + sharpen** — produce the components.{html,css} and
   motion.{html,css} contract via the `/ux-ui-design:*` skills, with
   the sharpening pass folded in. Output is `.mockups/design-system/`
   artifacts plus a review/sign-off gate. No production code yet.
2. **Migration sweep** — apply the contract to every UI file. Tagged
   `[refactor]`. Probably bin-packed by area (library, chat, configure,
   workspace, onboarding, surfaces) as child stories. Includes the
   raw-value sweep and the motion-vocabulary adoption.
3. **Enforcement** — optional follow-on. Lint/CI gate that flags raw
   color/spacing or non-token transitions in CSS modules going forward,
   so the contract stays a contract. May be a single story rather than
   a feature if the lint config is small.

Carry forward to epic-design:
- The two-tier DS rule is locked; tier-2 widget selection is epic-design's
  call (which 4–6 widgets get hoisted).
- The big-bang migration shape is locked; child-story slicing by area
  is epic-design's call.
- The motion-in-this-arc decision is locked; whether motion lands as a
  dedicated feature or as a track within the codify feature is
  epic-design's call.
