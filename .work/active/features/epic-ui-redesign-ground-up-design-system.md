---
id: epic-ui-redesign-ground-up-design-system
kind: feature
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Design System — Palette, Typography, Tokens

## Brief

Redefine Praxis's visual language from scratch: color palette, typography
scale, spacing system, motion tokens, and the `tokens.css` file every other
surface mock will consume. This is the foundation feature — every other
child of `epic-ui-redesign-ground-up` depends on it.

The current system (Phase 13 editorial-foundation, established in
`packages/ui/src/styles/global.css`) is a system-serif editorial language
with whisper-faint mode tints and uppercase mono kickers. That posture is
captured in `docs/UX.md` and may be honored, evolved, or replaced — the
design pass treats it as a starting reference, not a constraint. The
literary-review aesthetic and the anti-notification commitments in
`docs/VISION.md` ("How Praxis feels") DO remain constraints; the visual
choices that express them are up for redesign.

What lands: `.mockups/design-system/palette.html`,
`.mockups/design-system/typography.html`, and
`.mockups/design-system/tokens.css`. Multiple palette and type options up
front for sign-off, then a locked token set every downstream surface mock
references via `<link rel="stylesheet" href="../../design-system/tokens.css">`.

## Epic context

- Parent epic: `epic-ui-redesign-ground-up`
- Position in epic: **foundation feature** — every other child feature
  depends on this. Lands first; gates the rest of the epic.

## Foundation references

- `docs/VISION.md` § "How Praxis feels" — editorial restraint, anti-notification posture
- `docs/UX.md` § "Editorial language" — current typographic motif, mode tints, ornaments
- `packages/ui/src/styles/global.css` — current token surface (color, radius, font, mode tints)

## Mockups

- Design system: `.mockups/design-system/`
  - Palette: **Option 3 — Studio Quiet** (warm off-white + true near-black
    + muted brick accent; mode tints as 7px color dots, not washes)
  - Typography: **Option A — System Editorial** (system serif chain:
    Iowan / Sitka / Charter / Source Serif / Georgia; system mono for
    kickers; zero remote font fetch, satisfies Electron CSP)
  - Tokens locked: 2026-05-17 → `.mockups/design-system/tokens.css`
  - Considered: Options 1 (Editorial Refined), 2 (Library Twilight),
    4 (Cream & Indigo remix), 5 (Field Guide) all available in git
    history at the prior commit

Downstream surface mocks (`app-shell`, `chat-workspace`,
`discovery-surfaces`, `workspace`, `configure`) inherit these tokens by
linking `<link rel="stylesheet" href="../../design-system/tokens.css">`.

### Post-lock additions

- **Theme override mechanism added** during the app-shell pass. `tokens.css`
  now resolves dark mode via two paths: `@media (prefers-color-scheme: dark)`
  for system-follow (default), and `:root[data-theme="dark"]` (or `"light"`)
  for explicit user toggle. The app-shell mock surfaces a 3-state toggle
  (auto · light · dark) at the right edge of the running head.

### Design alignment · done

All downstream surface mocks have successfully linked and rendered against
`tokens.css` — no missing tokens reported during the surface design passes
(chat-workspace, discovery, workspace, configure). The token vocabulary
held: bg-primary/secondary/tertiary/inverse, text 4-level, accent +
hover + muted, status 4, mode tints 7, font-serif/sans/mono, font-size
scale, weights, line-heights, spacing 8pt scale, radius scale.

### Implementation outlook

Implementation work (single story when this advances to `stage:implementing`):
swap `packages/ui/src/styles/global.css` to consume `tokens.css`-shaped
variables; rename CSS variables in the codebase to match the locked
vocabulary; preserve the existing `--tint-*` per-mode tokens (renamed
internally as needed). Backend rename of mode id `bootstrap` →
`course_create` will affect `--tint-bootstrap` → `--tint-course-create`
when it lands — tracked in `.work/backlog/idea-rename-bootstrap-and-explorer.md`.

## Design decisions

- **One story, not two**: `tokens.css` adoption + variable rename are a single
  atomic transition with no parallelism — same surface (CSS), same stride.
  Splitting into "land tokens" then "rename consumers" leaves the repo in a
  visually-inconsistent intermediate state that breaks every screen. Keep it
  as one stride.
- **Keep `--tint-bootstrap` name, not `--tint-course-create`**: the rename
  parked at `idea-rename-bootstrap-and-explorer.md` is a backend rename; the
  mode id itself stays `bootstrap` until that ships. Tokens.css already uses
  the legacy name and downstream surface mocks have aligned against it.
  Re-align when the backend rename lands, not pre-emptively.
- **`--tint-route` is retained**: the existing graphite route-header tint is
  not in tokens.css. Re-introduce it in the consolidated `global.css` as
  `--tint-route: var(--color-text-secondary)` (was `--color-text-muted`).
  Studio Quiet's text-secondary IS graphite, so the visual stays.
- **Bubble colors become mode-tinted**: `--color-user-bubble` and
  `--color-assistant-bubble` no longer earn dedicated tokens; the locked
  chat-workspace mock (Option 4 — Refined Bubbles) drives bubble color from
  the active mode tint plus a low-alpha surface. Implementation removes
  these tokens; consumers compute the value from `--tint-<mode>` instead.
- **Status tokens consolidate**: existing `--color-error` collapses into
  `--color-danger` (tokens.css uses `danger`); existing `--color-badge` and
  `--color-badge-text` retire — the badge becomes `--color-warning` on
  `--color-text-inverse`, no dedicated tokens needed.

## Architectural choice

**Single-file token swap with an aliasing window.** The locked `tokens.css`
becomes the new source of truth. `global.css` shrinks to a thin file that
(a) imports/inlines the token block and (b) declares the editorial reset
(box-sizing, body defaults, `.editorial` composable). All 116 CSS modules
already reference variables via `var(--…)` — the work is rename-only at the
consumer level.

Considered and rejected:
- **Two stories (tokens-first, rename-second)**: cleaner-looking commits but
  introduces an intermediate state where consumers reference variables that
  don't exist. The visual contract would shatter for the duration.
- **Alias-only**: define both old and new names in `global.css`, defer the
  rename. Leaves dead names in the codebase indefinitely; downstream surface
  features can't reliably reference the new vocabulary in the mocks.

## Implementation Units

### Unit 1: `tokens.css` adoption + variable rename

**Files**:
- `packages/ui/src/styles/global.css` — replace token block with the locked
  vocabulary; keep the reset and `.editorial` composable.
- All 116 `*.module.css` files under `packages/ui/src/` — rename consumer
  references per the map below.

**Variable rename map** (old → new):

```
--color-bg               →  --color-bg-primary
--color-bg-subtle        →  --color-bg-tertiary
--color-canvas-bg        →  --color-bg-primary
--color-surface          →  --color-bg-secondary
--color-surface-alt      →  --color-bg-tertiary
--color-surface-muted    →  --color-bg-tertiary
--color-surface-raised   →  --color-bg-secondary
--color-card-bg          →  --color-bg-secondary
--color-card-bg-hover    →  --color-accent-muted
--color-input-bg         →  --color-bg-tertiary
--color-panel-bg         →  --color-bg-secondary

--color-text             →  --color-text-primary
--color-fg               →  --color-text-primary
--color-text-muted       →  --color-text-secondary
--color-fg-muted         →  --color-text-secondary

--color-border           →  --color-border (no change)
--color-rule             →  --color-border

--color-accent           →  --color-accent (no change)
--color-primary          →  --color-accent

--color-error            →  --color-danger
--color-danger           →  --color-danger (no change)
--color-danger-bg        →  --color-accent-muted  (close visual, single source)
--color-success          →  --color-success (no change)
--color-warning          →  --color-warning (no change)

--color-user-bubble      →  (removed; computed per-mode)
--color-assistant-bubble →  (removed; computed per-mode)
--color-badge            →  --color-warning
--color-badge-text       →  --color-text-inverse

--radius                 →  --radius-md
--radius-sm              →  --radius-sm (no change)
--radius-md              →  --radius-md (no change)

--font-mono              →  --font-mono (no change)
--font-display           →  --font-display (no change)
--tint-route             →  --tint-route (RE-ADD; `var(--color-text-secondary)`)
```

**Implementation Notes**:
- Bubble-color removal: every consumer of `--color-user-bubble` /
  `--color-assistant-bubble` becomes a mode-aware computed value. The
  shortest path is per-message-class — e.g.
  `.userBubble { background: color-mix(in oklab, var(--tint-teach) 12%, var(--color-bg-secondary)); }`
  and resolve the tint via a `--message-tint` custom property set on the
  message container by `MessageList` based on `session.modeId`. If
  `color-mix` proves shaky cross-platform, fall back to a fixed
  `--color-accent-muted` and revisit later.
- The rename uses an explicit table per consumer file rather than a
  blanket sed — there are subtle "no change" entries above, and the
  bubble-color migration is non-trivial. Walk file-by-file with the map.
- `tokens.css` lives at `.mockups/design-system/tokens.css` (mockup
  surface). The implementation **inlines** the token block into
  `packages/ui/src/styles/global.css` rather than `@import`-ing the
  mockup file — production should not depend on `.mockups/`. The mockup
  file remains the authored source and is hand-mirrored on changes.

**Acceptance Criteria**:
- [ ] `pnpm typecheck` passes; `pnpm lint` passes; `pnpm test` passes.
- [ ] `global.css` token block matches `.mockups/design-system/tokens.css`
      verbatim (sans the mockup-only header comment).
- [ ] No `--color-bg`, `--color-surface`, `--color-text`, `--color-fg`,
      `--color-fg-muted`, `--color-text-muted`, `--color-error`,
      `--color-bg-subtle`, `--color-canvas-bg`, `--color-card-bg`,
      `--color-card-bg-hover`, `--color-input-bg`, `--color-panel-bg`,
      `--color-surface-alt`, `--color-surface-muted`,
      `--color-surface-raised`, `--color-rule`, `--color-user-bubble`,
      `--color-assistant-bubble`, `--color-badge`, `--color-badge-text`,
      `--color-primary`, `--color-danger-bg`, or bare `--radius`
      remain anywhere in `packages/ui/src/`.
- [ ] All mode-tint tokens (`--tint-teach`, `--tint-bootstrap`,
      `--tint-quiz`, `--tint-homework`, `--tint-exam`,
      `--tint-configure`, `--tint-study-skills`) are defined in
      `global.css` and accept both system-follow and explicit
      `data-theme` dark mode.
- [ ] `--tint-route` is re-declared as
      `var(--color-text-secondary)` and is unchanged at consumer sites.
- [ ] Visual smoke test: `pnpm dev` boots Electron; the app shell, chat
      workspace, library, progress map, and configure mode all render
      with the Studio Quiet palette — warm off-white background, true
      near-black text, muted brick accent. Switching the system theme
      flips the surface; toggling `data-theme="dark"` on `<html>` from
      devtools flips it explicitly.

## Implementation Order

Single story `epic-ui-redesign-ground-up-design-system-token-swap` — sequenced
internally as:

1. Rewrite `global.css`: inline the locked token block, keep the reset +
   `.editorial` composable, re-add `--tint-route`.
2. Walk `packages/ui/src/components/*.module.css` and other CSS modules
   applying the rename map. Resolve bubble-color migration inline.
3. Run `pnpm typecheck && pnpm lint && pnpm test`; fix fallout.
4. Visual smoke via `pnpm dev`.

## Testing

The rename is mechanical at the CSS level — there's no behavioral surface to
unit-test that wasn't already covered by existing UI tests. The acceptance
criteria above lean on existing tests staying green plus the visual smoke.

If a regression hits a specific component test (e.g. a snapshot or a
computed-style assertion), fix it in-story rather than spawning a follow-up.

## Risks

- **`color-mix` cross-platform**: Electron 41 / Chromium 121+ supports
  `color-mix` in `oklab`. If smoke surfaces a rendering bug on the user's
  build target, fall back to fixed `--color-accent-muted` and accept the
  bubble color being mode-agnostic in v1 — file a follow-up.
- **Snapshot drift**: any UI test that snapshots computed styles may fail
  the variable rename. These should be refreshed, not gated on — the new
  tokens ARE the contract.
- **Mode-tint coverage**: the locked `tokens.css` defines tints for
  `teach`, `bootstrap`, `quiz`, `homework`, `exam`, `configure`,
  `study-skills`. If a new mode lands before this story, add its tint to
  `tokens.css` first (the mockup file is the SSOT) and mirror into
  `global.css`.
