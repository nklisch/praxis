---
id: epic-ui-redesign-ground-up-design-system
kind: feature
stage: drafting
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
