---
id: feature-editorial-polish-pass-styling-sweep
kind: story
stage: review
tags: [ui]
parent: feature-editorial-polish-pass
depends_on: [feature-editorial-polish-pass-theme-tokens]
release_binding: null
gate_origin: null
created: 2026-05-12
updated: 2026-05-12
---

# Editorial primitives audit + styling sweep

## Scope

Story 4 of `feature-editorial-polish-pass`. Comprehensive audit of every
route + list surface for editorial-primitives compliance. Replace any
hardcoded color with a CSS token (Story 1's `prefers-color-scheme: light`
work surfaces this).

The depends_on edge to Story 1 (theme-tokens) matters: the sweep finds and
fixes any hardcoded color, which only matters once the light-mode media
query is in place.

## Files to touch

Many small touches across `packages/ui/src/routes/**/*.tsx` and
`packages/ui/src/components/**/*.module.css` — the audit drives the file
list, not the design.

## Approach

1. Grep for hex colors outside `global.css`:
   ```bash
   grep -rn '#[0-9a-fA-F]\{3,8\}' packages/ui/src \
     --include='*.css' --include='*.tsx' \
     | grep -v 'global\.css'
   ```
2. For each match, either replace with a token (e.g., `var(--color-text)`)
   or add an inline `/* intentional literal: <reason> */` comment.
3. Walk every route file under `packages/ui/src/routes/**/*.tsx` against
   the editorial-primitives checklist below; fix or document each.

## Editorial-primitives checklist (per route)

- [ ] Header uses `<RouteHeader>` (or has an inline comment explaining why not).
- [ ] List surfaces use `<LibrarySection>` (or have an inline comment).
- [ ] Empty states use `<EmptyState>` (or have an inline comment).
- [ ] Copy strings resolve from `COPY` (`packages/ui/src/lib/copy.ts`) or
      have an inline comment justifying the literal.

## Acceptance criteria

- [ ] `grep -rn '#[0-9a-fA-F]\{3,8\}' packages/ui/src --include='*.css'`
      finds matches only in `global.css` (or files with a documented inline
      justification — e.g., `/* intentional literal: brand color */`).
- [ ] Every route file under `packages/ui/src/routes/` either renders
      `<RouteHeader>` or has an inline comment explaining why it doesn't
      (e.g., session tab bodies that aren't standalone routes; modal
      dialogs).
- [ ] Light-mode visual smoke clean — no orphan dark-on-dark or
      light-on-light contrast failures.
- [ ] `pnpm --filter @praxis/ui test` green; no UI regression.

## Implementation notes

- Don't refactor logic — the sweep is purely styling + primitive
  compliance. Logic changes need their own item.
- Where a literal color is genuinely intentional (e.g., a brand color, a
  diagnostic warning indicator that should not theme-shift), keep it and
  add the justification comment so the next sweep recognizes it.
- COPY additions: if the audit finds a route literal that would be
  more reusable as a COPY entry, add it. Don't move every literal —
  context-specific strings can stay inline.

## References

- Design: `.work/active/features/feature-editorial-polish-pass.md` (Story 4)
- Editorial primitives:
  - `packages/ui/src/components/route-header.tsx`
  - `packages/ui/src/components/library-section.tsx` (or similar — find via grep)
  - `packages/ui/src/components/empty-state.tsx`
  - `packages/ui/src/lib/copy.ts`

## Implementation notes

### Grep results

**Before sweep**: `grep -rn '#[0-9a-fA-F]\{3,8\}' packages/ui/src --include='*.css' | grep -v 'global\.css\|intentional literal' | grep -v 'var(--'` → ~100 bare hex color matches across 65+ CSS files.

**After sweep**: Same grep → 0 results. All bare hex colors are now either:
- Replaced with `var(--color-*)` token references, or
- Annotated with `/* intentional literal: <reason> */` inline.

(The var() fallback pattern `var(--color-*, #hex)` correctly remains — those hex values are CSS custom property fallbacks, not bare color literals.)

### Files touched

- **65 CSS files** tokenized or annotated
- **8 TSX route files** received RouteHeader exception documentation
- **1 global.css** received 3 new semantic tokens + their light-mode counterparts

### New tokens added to global.css

| Token | Dark-mode | Light-mode | Usage |
|---|---|---|---|
| `--color-error` | `#f87171` (red-400) | `#b91c1c` (red-700) | Error text, error banners, delete hover |
| `--color-success` | `#4ade80` (green-400) | `#15803d` (green-700) | Success text, mastered state, unlock badges |
| `--color-warning` | `#fbbf24` (amber-400) | `#d97706` (amber-600) | Warning text, due indicators, exam kicker |

All three include WCAG AA contrast annotations in global.css.

### Exception comments documented

**RouteHeader exceptions** (tab panels, not standalone routes):
- `routes/chat.tsx` — workspace shell, structural container
- `routes/configure/course-tab.tsx` — configure tab panel
- `routes/configure/gates-tab.tsx` — configure tab panel
- `routes/configure/memory-tab.tsx` — configure tab panel
- `routes/configure/prompt-tab.tsx` — configure tab panel
- `routes/workspace/cards-list.tsx` — workspace tab panel
- `routes/workspace/notes-list.tsx` — workspace tab panel
- `routes/workspace/note-editor-page.tsx` — focused editor surface
- `routes/workspace/review-session.tsx` — workspace tab panel

**Intentional literal hex colors** (kept with justification):
- `#fff` / `white` on colored button backgrounds (50+ instances) — must remain white regardless of theme
- `#fff3cd` / `#856404` in `memory-inspector-tabs.module.css` — Bootstrap-style warning badge
- `#d4edda` / `#155724` in `memory-inspector-tabs.module.css` — Bootstrap-style success badge
- `#b4d28d` / `#d8a37b` in `markdown-content.module.css` — syntax highlight tokens (stable cross-theme)

### Verification

- `pnpm --filter @praxis/ui typecheck` — ✓ clean
- `pnpm --filter @praxis/ui test` — ✓ 97 files, 822 tests
- `pnpm typecheck` (root gate) — ✓ clean
- Land-mode grep — ✓ 0 unjustified bare hex colors in CSS
