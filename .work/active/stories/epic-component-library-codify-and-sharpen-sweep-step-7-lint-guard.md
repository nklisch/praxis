---
id: epic-component-library-codify-and-sharpen-sweep-step-7-lint-guard
kind: story
stage: implementing
tags: [refactor]
parent: epic-component-library-codify-and-sharpen-sweep
depends_on: [epic-component-library-codify-and-sharpen-sweep-step-2-item-bodies, epic-component-library-codify-and-sharpen-sweep-step-3-tab-bodies, epic-component-library-codify-and-sharpen-sweep-step-4-composer-library-auth, epic-component-library-codify-and-sharpen-sweep-step-5-components-other, epic-component-library-codify-and-sharpen-sweep-step-6-routes]
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
- **Sweep work also bundled here** (discovered during wave-3 verification):
  - ~100 bare-seconds transitions (`transition: opacity 0.15s` etc.)
    across `packages/ui/src/components/*.module.css` and
    `packages/ui/src/routes/*.module.css`. The parent feature's spec
    used "bare-ms" as shorthand; semantically `0.15s` is identical
    drift. Migrate to the motion contract before the guard ships,
    otherwise CI fails on first push.

## Current state

No automated guard exists. Drift accumulates between reviews unless
reviewers spot it (which has been happening — the 132 rgba and 558
bare-px values caught by the audit are the proof, plus ~100
bare-seconds transitions that the original audit missed because the
regex was `[0-9]+ms`-specific).

## Target state

A guard that fails when any `*.module.css` under `packages/ui/src/`
introduces:

1. A hex color literal (`#abc`, `#aabbcc`, `#aabbccdd`) — only
   `var(--color-*)` allowed
2. A bare `Npx` value in `padding`, `margin`, or `gap` declarations —
   only `var(--space-*)` allowed
3. A `cubic-bezier(...)` literal — only `var(--ease-*)` allowed
4. A bare duration inside `transition`, `transition-duration`,
   `animation`, or `animation-duration` declarations — covers both
   `Nms` (e.g. `240ms`) and `Ns` / `N.Ns` (e.g. `0.15s`, `1.4s`). Only
   `var(--dur-*)` or `var(--t-*)` are allowed.

Exceptions must be marked inline with
`/* design-system-exception: <reason> */` on the same or preceding
line.

## Sweep before guard ships

Before the guard can land green on `HEAD`, the existing bare-seconds
drift must be migrated. The pattern is mechanical:

- `transition: <prop> 0.1s` → `transition: <prop> var(--dur-instant)` (80ms; ±20ms)
- `transition: <prop> 0.12s` → `transition: <prop> var(--dur-quick)` (160ms; ±40ms — at the input-gating ceiling)
- `transition: <prop> 0.15s` → `transition: <prop> var(--dur-quick)` (160ms; ±10ms)
- `transition: <prop> 0.18s` → `transition: <prop> var(--dur-quick)` (160ms; ±20ms)
- `transition: <prop> 0.2s` → `transition: <prop> var(--dur-quick)` (160ms; ±40ms)
- `transition: <prop> 0.25s` → adopt `var(--dur-quick)` (160ms; ±90ms — large shift). If a 90ms snappier feel is wrong for the surface, add `--dur-medium: 240ms` to motion.css and adopt that.
- `transition: <prop> 0.3s` → adopt `var(--dur-ambient)` (480ms) for background motion, OR add `--dur-medium: 240ms`/300ms and adopt for input-gating
- `transition: <prop> Ns ease` → use the shorthand `var(--t-quick)` (which already bundles `--ease-standard`)

Easing tokens to pair with raw `--dur-*` references:
- Snap-out / decelerate (most): `var(--ease-standard)` or `var(--ease-emphasized)` (they collapse to the same curve in Productive)
- Exits / dismissals: `var(--ease-accelerate)`

Group the migration into a single sub-commit (`implement: step-7 — migrate bare-seconds transitions to motion tokens`) before the guard sub-commit.

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
      sweeps are merged AND the bare-seconds migration lands
- [ ] All ~100 bare-seconds transitions migrated to `var(--dur-*)` or
      `var(--t-*)` (verify: `grep -rnE 'transition[^:]*:\s*[^v]*[0-9]+(\.[0-9]+)?s\b' --include='*.module.css' packages/ui/src/ | grep -v 'var(--' | wc -l` returns `0`)
- [ ] Wired into top-level `pnpm lint` (CI catches drift on every push)
- [ ] Three unit cases: known-drift CSS string fails (hex, bare-px,
      cubic-bezier, bare-ms, bare-seconds — pick one of each); known-clean
      CSS string passes silently; CSS with valid `design-system-exception`
      comment on preceding line passes
- [ ] Inline exception convention documented in `.work/CONVENTIONS.md`
- [ ] Runs in <2s on the current workspace

## Risk

Low. Pure additive scaffolding; doesn't modify any existing CSS. The
risk is a guard that's too noisy (false positives) or too quiet (false
negatives). Mitigation: the two unit cases anchor both directions.

## Rollback

`git revert <commit>` — script and `package.json` entry; no existing
files mutated.
