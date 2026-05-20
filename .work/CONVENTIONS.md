# Project Conventions

## Release mapping

tag-based

Releases are git tags (e.g. `v0`, `v0.2.0`, `v1.0.0`). The retro-release `v0`
captures all phases shipped before the substrate was bootstrapped on
2026-05-09; subsequent releases tag forward from there. Praxis ships an
Electron app and a future hosted Node service, both versioned against the
same tag stream.

## Tag taxonomy

- refactor   structural cleanup or API tightening, no observable behavior change for the student
- perf       throughput, latency, memory, startup time
- content    pedagogy, items, modes, course material, canonical packs, knowledge graph
- ui         editorial design system, surfaces, workspace, chat, library, sketches, concept map
- cleanup    cruft removal, dead code, defensive bloat, AI-accumulated debris (gate-cruft origin)
- docs       foundation-doc rolling-forward, changelog, pattern skills (gate-docs / gate-patterns origin)

Tags are a closed set. Multi-tag is fine; empty tag list is fine for items
that don't fit (e.g. early foundational work). Add new tags only by amending
this list — don't introduce ad-hoc tags.

## Slug conventions

- kebab-case
- Top-level: `<kind>-<topic>` (e.g. `epic-phase-18-study-skills`,
  `feature-claude-cli-sdk-refactor`)
- Children: parent-prefix qualifying the child (e.g. a story under
  `feature-uploads-retry` is `feature-uploads-retry-rate-limits`, not
  `rate-limits`)
- Phases use `phase-<n>-<slug>` (e.g. `epic-phase-18-study-skills`); shipped
  phases keep that form as features in `releases/v0/`

## Stage overrides

None. Stage flow follows the master per kind:
- epic / feature: drafting → implementing → review → done
- story: implementing → review → done (drafting optional)
- release: planned → quality-gate → released
- task: `[ ]` → `[x]` (checklist line in parent body)

## Gate config

```
gates_for_release: [security, tests, cruft, docs, patterns]
```

All five gates run on every `/release-deploy` in this order. Each gate
produces items rather than blocking the release; the release ships when all
items at the current `release_binding` reach `stage: done`.

## Design-system exceptions

CSS modules in `packages/ui/src/` must adhere to the design-system
contract — every color uses `var(--color-*)`, every spacing in
`padding`/`margin`/`gap` uses `var(--space-*)`, every easing uses
`var(--ease-*)`, every duration uses `var(--dur-*)` or `var(--t-*)`.

`pnpm lint:css-contract` enforces the contract.

Exceptions to the contract — for values that genuinely cannot map to a
token (negative-margin overlap tricks, structural pixel offsets,
glyph-grid measurements) — are allowed with an inline comment:

```css
/* design-system-exception: <reason> */
padding-left: 28px;
```

The comment can sit on the same line as the value or on the line
directly above. Reasons should be concrete; "no token applies" is
acceptable shorthand if the structural use is obvious.

The legacy form `/* intentional literal: <reason> */` (used by sweep
steps 2–6 before this guard shipped) is also recognized as an exception
marker. New code should use `/* design-system-exception: */`.
