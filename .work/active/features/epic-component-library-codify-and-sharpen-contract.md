---
id: epic-component-library-codify-and-sharpen-contract
kind: feature
stage: done
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

## Design decisions

- **Tier-2 widget pack**: broad 6-pack — composer family (composer +
  composer-verbs + composer-sketch) · assignment-item-card ·
  assignment-card · prompt-block · concept-link-overlay ·
  claude-auth-modal. Selected by usage frequency + distinct shape
  criteria; library-section dropped to tier-1 since it's a section
  primitive, not a domain widget.
- **Sharpening intensity**: locked to Option 1 — codify-as-is, tighter
  consistency. Comparison gate ran 2026-05-19 with Options 1 and 2
  side-by-side in the showcase; user picked Option 1 after iterating
  on the assignment-item-card left hang (settled at `--space-6`).
  Hairlines stay where they already live; primary accent used freely
  on the dominant action of every surface; status colors paired with
  the badge chrome; 2px-border tab indicator on the active tab.
  Option 2 (push restraint — ornament-first status, fewer hairlines,
  restricted accent) and Option 3 (Literary push) were not chosen.
- **Motion attitude**: locked to Option 1 — Productive. Comparison gate
  ran 2026-05-19 with Productive and Calm-tech side-by-side in the
  showcase; user picked Productive after also iterating on Calm-tech's
  hold-beat (briefly tried 50ms and 100ms in Productive before settling
  on 0ms — focus appears immediately on modal arrival). Snap-to-final
  easing dominant (all of emphasized/standard/productive/decelerate
  collapse to `cubic-bezier(0, 0, 0.2, 1)`); `--dur-quick` at 160ms;
  `--dur-instant` at 80ms; `--dur-ambient` at 480ms; `--dur-pulse` at
  1400ms; `--hold-beat` at 0ms. Skeleton shimmer at 1.6s (decoupled
  from --dur-ambient; its own breathing pace). Indeterminate progress
  bounces between edges at --dur-pulse. Reduced-motion collapses all
  durations to 0ms and all curves to linear.

## Architectural choice

Sequential design pipeline with two comparison gates:

1. Optional palette refinement — `/ux-ui-design:palette` runs in
   refinement mode only if components design surfaces missing tokens
   (likely no-op; tokens.css already locks Studio Quiet).
2. **Components pass** — `/ux-ui-design:components` produces
   `components.css` + `components.html` with the tier-1 primitives,
   the broad 6-pack tier-2 widgets, AND two sharpening variants
   rendered side-by-side in the showcase. The two variants share the
   same primitive set + tier-2 widgets; what differs is the visual
   restraint level.
3. **Sharpening gate** — user reviews the showcase, picks Option 1 or
   Option 2. The unchosen variant's CSS is deleted; the chosen
   variant becomes the locked `components.css`.
4. **Motion pass** — `/ux-ui-design:motion` produces `motion.css` +
   `motion.html` with two attitude variants (Productive vs Calm-tech)
   rendered side-by-side. Both variants share the named-curve and
   duration-scale infrastructure; what differs is the curve shapes
   and duration values.
5. **Motion gate** — user reviews the showcase, picks Option 1 or
   Option 3. The unchosen variant's CSS is deleted; the chosen
   variant becomes the locked `motion.css`.
6. Both contracts ship in `.mockups/design-system/` as final artifacts.

Comparison gates were chosen over up-front pick because the visual
deltas between sharpening options (and between motion attitudes) are
hard to predict from descriptions — the wrong call would force a
re-run after the sweep starts. The marginal cost of producing two
variants in one showcase is low; the marginal value of seeing them
side-by-side is high.

## Implementation units

This feature implements through skill invocations, not code authoring.
No child stories — the two skill runs + two comparison gates are
tightly coupled and run in one interactive session with the user.

### Unit 1: Components contract (with sharpening comparison)

**Skill**: `/ux-ui-design:components` (comparison mode)
**Outputs**:
- `.mockups/design-system/components.html` — showcase with tier-1
  primitives, broad 6-pack tier-2 widgets, AND Option 1 / Option 2
  sharpening variants rendered side-by-side
- `.mockups/design-system/components.css` — the contract (post-gate,
  with only the chosen variant)

**Acceptance criteria**:
- [ ] Every tier-1 primitive renders in every state (default, hover,
      focus-visible, active, disabled, error where applicable)
- [ ] All 6 tier-2 widgets render with realistic content + every
      meaningful variant
- [ ] Showcase includes a side-by-side sharpening comparison (Option
      1 vs Option 2) that makes the difference visible
- [ ] Every color value is `var(--color-*)`; every spacing value is
      `var(--space-*)`; every radius is `var(--radius-*)`
- [ ] User picks a sharpening variant; the unchosen variant's CSS is
      removed from `components.css`

### Unit 2: Motion contract (with attitude comparison)

**Skill**: `/ux-ui-design:motion` (comparison mode)
**Outputs**:
- `.mockups/design-system/motion.html` — showcase with named curves +
  durations + designed pauses, with Option 1 (Productive) and Option
  3 (Calm-tech) variants rendered side-by-side as playable motion
- `.mockups/design-system/motion.css` — the motion vocabulary
  (post-gate, with only the chosen attitude)

**Acceptance criteria**:
- [ ] Named curves (`--ease-emphasized`, `--ease-standard`,
      `--ease-decelerate`, `--ease-accelerate`) defined for the chosen
      attitude
- [ ] Doherty-coupled duration scale (`--duration-instant`,
      `--duration-quick`, `--duration-ambient`) defined
- [ ] Designed-pause token (`--pause-ma`) defined for Calm-tech;
      omitted for Productive
- [ ] `prefers-reduced-motion` fallback defined — all durations
      collapse to 1ms, curves to linear
- [ ] Showcase includes a side-by-side attitude comparison (Option 1
      vs Option 3) with every transition type playable in both
- [ ] User picks an attitude variant; the unchosen variant's CSS is
      removed from `motion.css`

## Foundation alignment

After both gates close, verify the `docs/UX.md` "Design-system
contract" paragraph still accurately describes what shipped. Update
in place if the chosen variants name anything the paragraph promised
differently (e.g., if the chosen sharpening level reframes how the
brick accent is restricted, the paragraph should reflect that).

## Risks

- **Sharpening gate deadlock.** User can't pick between the two
  variants because they want pieces of each. Mitigation: pre-commit
  to picking; the unchosen variant becomes a backlog idea for a
  future sharpening pass if appetite remains. The contract feature
  closes on one chosen variant.
- **Motion attitude doesn't survive contact with composer.** The
  chosen motion may feel wrong specifically on the composer (which
  handles real-time input with high responsiveness expectations).
  Mitigation: render the composer in the motion showcase, not just
  abstract primitives, so the chosen attitude is validated against
  the highest-stakes interaction up-front.
- **Token gaps surface mid-design.** Components design may need
  tokens that don't exist in `tokens.css`. Mitigation: pause the
  components run, refine `tokens.css` in-place, resume. Documented as
  expected behavior, not contract violation.
- **Showcase comparisons are visually noisy.** Two-variants-in-one-
  showcase risks looking cluttered. Mitigation: showcase uses
  side-by-side columns or toggleable layers; the comparison is a
  review feature, not part of the final showcase shipped after the
  gate closes.

## Out of scope

- Production-code migration — that's the sibling sweep feature.
- Lint/CI enforcement — also in the sweep feature.
- Refining `tokens.css` beyond gap-fill — palette aesthetic stays
  locked.
- New `.mockups/screens/` or `.mockups/flows/` artifacts — surfaces
  consume the contract but aren't produced here.

## Implementation notes

- 2026-05-19 — Both units delivered.
  - **Unit 1 (components)** — `.mockups/design-system/components.css`
    + `components.html` written. Tier-1 set: editorial primitives
    (Modal/RouteHeader/EmptyState/LoadingState/ErrorMessage refined +
    ornament/editorial-kicker/editorial-deck/section-head/section-rule
    extracted) plus common slots (btn / field / input / textarea /
    select / checkbox / card / modal-backdrop / dropdown / tabs / badge
    / pill / skeleton / progress / step-dots). Tier-2 broad 6-pack:
    composer family (with verbs + sketch-button + send) ·
    assignment-item-card (with answered variant) · assignment-card ·
    prompt-block · concept-link-overlay · claude-auth-modal.
    Sharpening locked to Option 1 (codify-as-is) after side-by-side
    review. Iteration: assignment-item-card left hang ended at
    `--space-6` (tried `--space-8`, pulled back); padding-left reset
    on the option-1 variant was removed so the hang survives the
    top/bottom-rule treatment. Folded the variant scaffolding into the
    base; no toggle remaining in the showcase. Skeleton shimmer
    contrast bumped from `--color-border` to `--color-border-strong`
    as the middle gradient stop so the shimmer is visible (previous
    pair was effectively the same color).
  - **Unit 2 (motion)** — `.mockups/design-system/motion.css` +
    `motion.html` written. Six named curves (emphasized / standard /
    productive / decelerate / accelerate / linear), four durations
    (instant / quick / ambient / pulse), plus `--hold-beat` (0ms in
    Productive) and `--t-*` transition helpers. Three keyframes
    (motion-fade-in/-out, motion-rise-in/-out, motion-skeleton-shimmer,
    motion-editorial-ellipsis, motion-progress-bounce). Reduced-motion
    fallback collapses every value to 0ms / linear. Productive locked
    after side-by-side review. Folded the variant scaffolding into
    `:root`; no toggle remaining. Skill's optional channels
    (springs/Disney/stepped/Lottie) deliberately omitted with reasons
    captured in the file header.
- Foundation alignment: the existing `docs/UX.md` "Design-system
  contract" paragraph (rolled forward at scope time) still accurately
  names the two-tier `.mockups/design-system/` contract; no further
  doc rolls needed at this stage.

## Acceptance criteria (final)

Unit 1 (components):
- [x] Every tier-1 primitive renders in every state
- [x] All 6 tier-2 widgets render with realistic content + variants
- [x] Showcase had a side-by-side sharpening comparison; user picked
- [x] Every color / spacing / radius is `var(--token)`
- [x] Sharpening variant CSS removed from `components.css` post-gate

Unit 2 (motion):
- [x] Named curves defined for locked attitude (Productive)
- [x] Doherty-coupled duration scale defined (instant / quick / ambient)
- [x] `--dur-pulse` token defined for breathing/scanning motion
- [x] `--hold-beat` defined (0ms in Productive)
- [x] `prefers-reduced-motion` fallback — all durations 0ms, curves linear
- [x] Showcase had a side-by-side attitude comparison; user picked
- [x] Attitude variant CSS removed from `motion.css` post-gate

## Review (2026-05-19)

**Verdict**: Approve with comments

**Blockers**: none (one foundation-doc drift fixed inline — see Notes)
**Important**: none
**Nits**:
- A handful of micro-element pixel values (`14px` checkbox glyph, `6px` step-dot, `5px` select-chevron art, `1px` hairlines, `2px` focus outlines and tab indicator) sit outside the `var(--space-*)` scale. They're glyph-grid / border-width measurements, not spacing — and the design explicitly calls out `2px` indicators and hairline borders. No drift; flagged here for visibility only.
- `motion.css` defines `--ease-emphasized`, `--ease-standard`, `--ease-productive`, and `--ease-decelerate` as the same `cubic-bezier(0,0,0.2,1)`. Intentional under the Productive attitude (snap-to-final dominant), called out in the file header.

**Notes**:
- Foundation roll-forward applied in this review: `docs/UX.md` "Design-system contract" paragraph named tier-2 widgets as `ArtifactCard, AssignmentCard, CitationChip` — three of which weren't in the actual shipped set. Updated to enumerate the real tier-1 primitives (editorial marks, heads, btn, field/input/textarea/select/checkbox, card, empty-state, error-message, loading-state, modal, dropdown, tabs, badge, pill, skeleton, progress, step-dots) and tier-2 widgets (composer family, assignment-item-card, assignment-card, prompt-block, concept-link-overlay, claude-auth-modal), and to note the motion attitude is locked to Productive.
- Tokens-only discipline holds: zero hex/rgb/named colors anywhere in `components.css` or `motion.css`; every color is `var(--color-*)`. All meaningful spacing uses `var(--space-*)`.
- Acceptance criteria for both units check out against the shipped files.