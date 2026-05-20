---
id: epic-component-library-codify-and-sharpen-sweep
kind: feature
stage: drafting
tags: [refactor]
parent: epic-component-library-codify-and-sharpen
depends_on: [epic-component-library-codify-and-sharpen-contract]
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-19
---

# Migration sweep — apply the design-system contract + lint guard

## Brief

Big-bang sweep that applies the locked design-system contract
(`components.css`, `motion.css`) to every production UI file. Goal: at
the end of this feature, every CSS module in `packages/ui/src/` reaches
the design system via tier-1 primitive classes, the editorial CSS
utility (`composes: editorial from global`), or — for the 4–6 selected
domain widgets — a tier-2 widget class; every raw color/spacing value
resolves to a `var(--token)` reference; every bespoke transition or
keyframe adopts a `--ease-*` / `--duration-*` motion token.

The audit at scope time found ~150 of ~200 component files don't use
editorial primitives today and ~262 raw color/spacing values remain.
Adoption is especially low in `components/document-viewer/` (0/13) and
`components/item-bodies/` (0/17); raw values cluster in `components/`
(173 of 262, ~66%). This feature closes both gaps in one focused
sweep, ending with a lint/CI guard so the contract stays a contract.

This feature does NOT redesign the visual language — that's the
sibling contract feature's job. The sweep applies what's locked. If
sweep work surfaces a contract gap (missing token, missing variant,
under-specified state), feed it back to the contract feature for a
refinement pass rather than improvising inline.

## Epic context

- Parent epic: `epic-component-library-codify-and-sharpen`
- Position in epic: consumer feature — depends on the contract feature
  delivering `components.css` and `motion.css`. Runs after the contract
  is reviewed and locked.

## Foundation references

- `docs/UX.md` — "Design-system contract" paragraph names raw color /
  spacing in CSS modules as drift; this sweep makes that statement true
- `.mockups/design-system/components.css` — contract this sweep adopts
  (produced by the sibling feature)
- `.mockups/design-system/motion.css` — motion vocabulary this sweep
  adopts (produced by the sibling feature)

## Sweep area-slicing (refactor-design seed)

The audit suggests the natural slicing axes. The actual child-story
breakdown is `/agile-workflow:refactor-design`'s call:

- **`components/document-viewer/`** (~13 files, 0/13 adopted today) —
  highest-leverage area; entirely untouched by editorial primitives
- **`components/item-bodies/`** (~17 files, 0/17 adopted today) —
  second-highest leverage; quiz/homework/exam item bodies use raw
  values throughout
- **`components/library/`** (~10 files, 6/10 adopted) — light cleanup
- **`components/` (other)** — broad sweep across remaining
  components: composer suite, modals, badges, status surfaces, sketch
- **`routes/` + `routes/configure/`** (~45 files, 18/45 adopted) —
  route-level cleanup; the route shells already adopt editorial
  primitives; this slice catches inner sections
- **Onboarding + auth + settings** — `onboarding-flow`,
  `claude-auth-modal`, `settings` — small but visible surfaces

Each area becomes one or more child stories during refactor-design.
The acceptance criterion per story: every file in the area uses
primitives + tokens + motion tokens; the `composes: editorial from
global` adoption count goes from ~47 to whatever the post-sweep count
should be (refactor-design quantifies); the raw-value count for that
area drops to zero.

## Enforcement (rolled into this feature, not its own)

After the sweep lands, add a lint rule (Biome custom rule or a
post-build grep CI check) that fails the build when a CSS module in
`packages/ui/src/` introduces:

- A hex color literal (only `var(--color-*)` allowed)
- A bare `Xpx` spacing value in `padding`/`margin`/`gap` (only
  `var(--space-*)` allowed)
- A `cubic-bezier(...)` literal or bare-`ms` `transition-duration` (only
  `var(--ease-*)` / `var(--duration-*)` allowed)

Exceptions documented inline with `/* design-system-exception: <reason> */`.
The exact rule implementation is a feature-design call; if the lint
config is small enough it lands as a single child story; if it needs
its own design (e.g., custom Biome plugin), it spawns a child feature
during this feature's design pass.

## Mockups

Inherits from the contract feature — no new mocks at this tier. The
contract IS the visual reference; the sweep applies it. The
`/agile-workflow:refactor-design` pass on this feature does NOT call
`/ux-ui-design:screens` or `/ux-ui-design:flows` — there are no new
surfaces being designed, only existing surfaces being aligned.