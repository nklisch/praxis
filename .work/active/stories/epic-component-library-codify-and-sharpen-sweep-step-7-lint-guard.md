---
id: epic-component-library-codify-and-sharpen-sweep-step-7-lint-guard
kind: story
stage: implementing
tags: [refactor]
parent: epic-component-library-codify-and-sharpen-sweep
depends_on:
  - epic-component-library-codify-and-sharpen-sweep-step-2-item-bodies
  - epic-component-library-codify-and-sharpen-sweep-step-3-tab-bodies
  - epic-component-library-codify-and-sharpen-sweep-step-4-composer-library-auth
  - epic-component-library-codify-and-sharpen-sweep-step-5-components-other
  - epic-component-library-codify-and-sharpen-sweep-step-6-routes
release_binding: null
gate_origin: refactor-design
created: 2026-05-20
updated: 2026-05-20
---

# Step 7 — Lint guard: lock the contract into CI

## Brief

Add an automated guard that fails the build when a CSS module in
`packages/ui/src/` introduces design-system drift. Without it, the
sweep is a moment-in-time clean state rather than a durable contract.

## Files in scope

- New: a guard script (default: a small Node script under `scripts/`)
- `package.json` — wire the script into the existing
  `pnpm lint`/`pnpm typecheck` cadence
- `.work/CONVENTIONS.md` — short append documenting the inline-exception
  convention (`/* design-system-exception: <reason> */`)
- New test(s): one failing-on-drift case, one passing-on-clean case

## Current state

No automated guard exists. Drift accumulates between reviews unless
reviewers spot it (which has been happening — the 132 rgba and 558
bare-px values caught by the audit are the proof).

## Target state

A guard that fails when any `*.module.css` under `packages/ui/src/`
introduces:

1. A hex color literal (`#abc`, `#aabbcc`, `#aabbccdd`) — only
   `var(--color-*)` allowed
2. A bare `Npx` value in `padding`, `margin`, or `gap` declarations —
   only `var(--space-*)` allowed
3. A `cubic-bezier(...)` literal — only `var(--ease-*)` allowed
4. A bare-`Nms` value inside `transition`, `transition-duration`, or
   `animation` declarations — only `var(--dur-*)` or `var(--t-*)`
   allowed

Exceptions must be marked inline with
`/* design-system-exception: <reason> */` on the same or preceding
line.

## Implementation notes

- Default to a Node script (`scripts/check-css-contract.mjs`) using the
  same regexes the audit script used; Biome's custom-rule plugin
  surface is heavier than this enforcement need
- The check should be fast (<1s on this workspace) so it can run inside
  the standard `pnpm lint` flow
- Read the file line-by-line; when a forbidden pattern is found, walk
  backwards one line to look for the exception comment on the prior line
  (and check the current line for an inline exception)
- Output format: GitHub Actions / Biome-compatible
  `<file>:<line>:<col>: <message>` so CI annotations work

## Acceptance criteria

- [ ] `scripts/check-css-contract.mjs` (or equivalent) exists and runs
- [ ] `pnpm lint:css-contract` exits 0 on `HEAD` after all five area
      sweeps are merged
- [ ] Wired into top-level `pnpm lint` (CI catches drift on every push)
- [ ] Two unit cases: known-drift CSS string fails with a line-targeted
      error; known-clean CSS string passes silently
- [ ] Inline exception convention documented in `.work/CONVENTIONS.md`
- [ ] Runs in <1s on the current workspace

## Risk

Low. Pure additive scaffolding; doesn't modify any existing CSS. The
risk is a guard that's too noisy (false positives) or too quiet (false
negatives). Mitigation: the two unit cases anchor both directions.

## Rollback

`git revert <commit>` — script and `package.json` entry; no existing
files mutated.
