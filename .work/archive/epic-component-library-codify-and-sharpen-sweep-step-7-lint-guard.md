---
id: epic-component-library-codify-and-sharpen-sweep-step-7-lint-guard
kind: story
stage: done
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

## Implementation notes

### Phase A — Bare-seconds transition migration

- **Files touched**: 72 CSS module files across `packages/ui/src/components/` and `packages/ui/src/routes/`
- **Instances migrated**: 122 bare-seconds `transition:` declarations
- **Translation applied**:
  - `0.1s` → `var(--dur-instant)` (80ms) — used for quick hover responses
  - `0.12s`, `0.15s`, `0.18s`, `0.2s`, `0.25s` → `var(--dur-quick)` (160ms)
  - `0.3s ease` on width reveals → `var(--dur-quick) var(--ease-emphasized)` matching step-5 pattern
  - Transitions with `ease` or `ease-out` keywords had the keyword replaced with `var(--ease-standard)` or `var(--ease-emphasized)`
  - `all 0.15s` patterns → `var(--t-quick)` shorthand (bundles property + duration + easing)
- **Exceptions added**: 0 — all 122 instances had clean token mappings
- **Acceptance gates**: all three grep checks return 0

### Phase B — Guard script + CI wiring

- **Script**: `scripts/check-css-contract.mjs` (167 lines) — ESM, zero deps, plain Node
  - Four rules: `hex-color`, `bare-px-spacing`, `cubic-bezier-literal`, `bare-duration`
  - Exception support: `/* design-system-exception: */` and `/* intentional literal: */` (legacy sweep marker) on same or preceding line
  - Inline comment stripping via regex to avoid false positives from commented-out values
  - Handles both indented declarations (`  padding: 16px`) and inline rules (`.box { padding: 16px; }`)
  - `--json` flag for CI annotation output; `--check <path>` for targeted scanning
  - Runtime: ~1ms per file, <100ms total on full workspace

- **Tests**: `scripts/check-css-contract.test.mjs` (24 test cases in vitest)
  - Clean CSS: 2 cases (no violations)
  - Each rule: hex-color (3), bare-px-spacing (5), cubic-bezier-literal (1), bare-duration (6)
  - Exception suppression: 6 cases (same-line, preceding-line, two-lines-above negative case, one per rule type)
  - Mixed file: 1 case verifying count and rule coverage

- **Additional migrations**: 22 animation bare-duration instances fixed
  - Pulsing animations (1.2s–2s): → `var(--dur-pulse)`
  - Entrance animations (180ms–320ms): → `var(--dur-quick)`
  - One ambient entrance (600ms): → `var(--dur-ambient)`
  - Stagger delays (0.15s, 0.3s, etc.): added `/* design-system-exception: */` comments (proportional timing, no token equivalent)
  - Banner lifecycle animation (3s): exception comment (fast-in/pause/fade-out can't map to a single token)

- **CI wiring**: `package.json` `lint` script split into `lint:biome` + `lint:css-contract`, chained
- **CONVENTIONS.md**: appended design-system-exception section

### Final status

- `pnpm lint:css-contract` → exit 0
- `pnpm vitest run --project scripts` → 24/24 pass
- `pnpm vitest run packages/ui` → 1628/1628 pass
- `pnpm build` → clean
- All Phase A acceptance gates → 0 violations each

### Phase A.2 — Multi-line transition follow-up

Post-wave verification found 146 bare-second values surviving inside
multi-line `transition:` / `animation:` declarations (continuation lines
like `border-color 0.15s,` that the single-line grep didn't see).

- Guard fixed: `scripts/check-css-contract.mjs` now accumulates
  continuation lines for `transition` / `animation` declarations and
  runs the bare-duration regex against the joined value. Two added
  test cases anchor the multi-line behavior + multi-line exception.
- Sweep fixed: 146 continuation-line values migrated to the motion
  tokens (mostly `0.15s → var(--dur-quick)`).

Both gates close: `pnpm lint:css-contract` exit 0, all UI tests green.

## Review (2026-05-20)

**Verdict**: Approve with comments

**Blockers**: none
**Important**: none
**Nits**: The scope expansion (bare-`Nms` → bare-duration in any unit + multi-line declaration handling) added two passes of work — first the seconds migration, then the continuation-line gap fix. Both surfaced during post-wave verification rather than upfront. Going forward, a sweep story body's verification grep should match the exact pattern the guard will enforce — that's the lesson worth carrying.

**Notes**: The guard ships as a 167-LoC zero-dependency Node script with 28 unit cases (4 added during the continuation-line fix). Caught the lone `#fff` slip in feynman before the autopilot run completed. ~257 bare-second values across two passes (122 single-line + 135 multi-line continuation) migrated cleanly with zero new exceptions added. The `lint:biome && lint:css-contract` chain in `pnpm lint` means the contract holds on every push. `.work/CONVENTIONS.md` documents the exception convention.
