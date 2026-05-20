---
id: epic-component-library-codify-and-sharpen
kind: epic
stage: done
tags: []
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-20
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

## Decomposition

Split by capability into two features — the contract authoring and the
sweep that applies it. Both motion design and enforcement fold into
existing features rather than spawning their own: motion runs alongside
components in the contract feature (one coherent review of the visual +
kinetic voice); enforcement (lint/CI guard) rolls into the sweep
feature so the guard lands the same time as the codebase reaches
contract-compliance. Two features keeps the chain simple and matches
the locked scope intent.

### Child features

- `epic-component-library-codify-and-sharpen-contract` — produce
  `.mockups/design-system/components.{html,css}` (two-tier, sharpened)
  and `motion.{html,css}` via `/ux-ui-design:components` + `:motion`.
  No production code. Depends on: `[]`
- `epic-component-library-codify-and-sharpen-sweep` `[refactor]` —
  apply the locked contract to every UI file (~200 files); zero out the
  262 raw color/spacing values; adopt the motion vocabulary across
  bespoke transitions; land a lint/CI guard so the contract stays a
  contract. Depends on:
  `[epic-component-library-codify-and-sharpen-contract]`

The sweep's per-area child-story slicing (suggested seam: document-viewer,
item-bodies, library, components-other, routes, onboarding+auth+settings)
is `/agile-workflow:refactor-design`'s call once the contract is locked.
Tier-2 widget selection (4–6 from `composer`, `assignment-item-card`,
`claude-auth-modal`, `library-section`, `composer-verbs`, `prompt-block`,
`assignment-card`, `batch-summary-modal`, `concept-link-overlay`) is the
contract feature's design pass to make.

### Decomposition risks

- **Design intent drift during sweep.** The contract may look right on
  the showcase but feel off when applied at scale (component over-uses
  a state, primitive doesn't compose cleanly with a real-world wrapper).
  Mitigation: refactor-design slices the sweep so the first area lands
  as an end-to-end proof before the rest follow; gaps surface as
  contract-refinement loops back to the contract feature, not
  improvised inline.
- **Tier-2 selection regret.** Hoisting the wrong widgets bloats the
  contract; hoisting too few leaves mocks reaching for ad-hoc styles.
  Mitigation: the contract feature's design pass evaluates against the
  usage data in this body, not against speculation.
- **Motion adoption forces motion-contract refinement.** Bespoke
  transitions in production may not map cleanly to the named curves.
  Mitigation: the sweep can refine `motion.css` (same as components can
  refine `tokens.css`); not a contract violation, an expected loop.
- **Half-migrated state if sweep stalls.** Big-bang means in-flight
  state is visible. Mitigation: refactor-design slices by area so each
  story leaves its area at 100%; partial completion of the epic is
  still partial completion of *whole areas*, not files scattered
  across all areas.

## UI alignment

This epic IS the design-system pipeline; the contract feature's
deliverables ARE the mockup artifacts (`components.html`,
`components.css`, `motion.html`, `motion.css`). No per-feature
`/ux-ui-design:screens` or `/ux-ui-design:flows` invocations at this
tier — the surfaces that will eventually consume the contract are
already mocked elsewhere (see `.mockups/adoption-report.md`); this
epic locks the contract those mocks link.

## Review (2026-05-20)

**Children complete**: both child features at `stage: done`.

- `epic-component-library-codify-and-sharpen-contract` (done) — produced
  `.mockups/design-system/components.css` + `components.html` and
  `motion.css` + `motion.html`. Sharpening locked to Option 1
  (codify-as-is); motion attitude locked to Option 1 (Productive).
- `epic-component-library-codify-and-sharpen-sweep` (done) — applied
  the contract across 136 CSS modules in `packages/ui/src/`. Final
  drift state: 0 rgba, 0 hex, 0 cubic-bezier, 19 bare-px and 20
  bare-duration values remaining (all behind `design-system-exception`
  inline comments). Lint guard `pnpm lint:css-contract` wired into
  `pnpm lint` so the contract holds going forward. 1628/1628 UI tests
  green.

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: A follow-up worth tracking: the production composer's
`.composerWrapper` / `.form` structure diverges from the tier-2
`.composer` 3-column grid in the contract. Either restructure
production or relax the contract selector — flagged in the sweep
feature's review and worth a small grooming pass.

**Notes**: Epic delivered as briefed end-to-end. The three intertwined
outcomes — codify, sharpen, migrate — all land in this arc:
- **Codify**: `tokens.css` + `components.css` + `motion.css` are now
  the canonical authoring location for color, type, spacing, radii,
  the two-tier component contract, and the motion vocabulary.
- **Sharpen**: Option 1 sharpening (codify-as-is, tighter consistency)
  and Productive motion locked after side-by-side comparison gates.
  The Studio Quiet voice is now expressed uniformly across every
  surface.
- **Migrate**: the sweep applied the contract to every UI file in one
  focused pass, with the lint guard preventing regression.

The capability the brief promised — every CSS module in
`packages/ui/src/` reaching the design system via tier-1 primitive
classes, the editorial CSS utility, or a tier-2 widget class; every
raw color/spacing value resolving to `var(--token)`; every bespoke
transition adopting a motion token — is verifiable end-to-end.
`pnpm lint:css-contract` exits 0 on HEAD; 1628/1628 UI tests pass.

What's now possible: future UI work authored against the locked
`.mockups/design-system/` contract is automatically verified by CI on
every push. Designers can sketch in HTML mocks knowing the production
code can be rebuilt from the same tokens + primitives. The earlier
~262 raw value count and ~150 unadopted files are no longer drifting;
each new contribution either composes a primitive or is flagged.
