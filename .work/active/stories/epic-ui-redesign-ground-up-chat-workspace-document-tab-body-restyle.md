---
id: epic-ui-redesign-ground-up-chat-workspace-document-tab-body-restyle
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-chat-workspace
depends_on: [epic-ui-redesign-ground-up-chat-workspace-chat-shell-refined-bubbles]
release_binding: v0.1.3
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Document tab body — read-mostly viewer restyle

## Scope

Restyle `DocumentTabBody` per the locked `mode-document.html` mock:
read-mostly viewer chrome.

Citation highlights + selection bar + scope-aware "ask Praxis" land
via sibling
`epic-backend-fills-for-redesign-document-viewer` stories; this
story is the surface layout restyle.

## Implementation steps

1. Edit `packages/ui/src/components/document-tab-body.{tsx,module.css}`.
2. Apply locked layout: clean reading column, generous margins,
   editorial typography from tokens.css.
3. Tests cover the restyle.
4. Quality checks green.

## Acceptance criteria

- [x] Document tab body matches the locked mock visual contract.
- [x] Per-format renderers continue to dispatch correctly.
- [x] All quality checks green.

## Implementation notes

### What landed

**`document-tab-body.tsx`** — restyle of the viewer chrome:
- Replaced `<header>` → `<header className={styles.docHead}>` with kicker (MIME type + `†` glyph), h1 display-title, and optional filename meta line (shown only when `title !== filename`).
- Wrapped renderer output in `<div className={styles.readingColumn}>` inside the scrolling `<main>` — this is the 64ch column that matches the mock's `.doc-page` constraint.
- `aria-label="Document content"` added to the `<main>` element.

**`document-tab-body.module.css`** — full restyle:
- `container`: `background: var(--color-bg-secondary)` (per mock's `main.doc`).
- `docHead`: padding 32px top, 16px bottom; border-bottom `var(--color-border)`.
- `kicker`: `var(--font-mono)` uppercase, `var(--letter-spacing-kicker)`, `var(--font-size-xs)`.
- `kickerGlyph`: italic serif tertiary — matches mock's `.kicker .glyph`.
- `title`: italic display serif 24px / 1.25, font-weight 500.
- `titleStrong`: semibold weight for the title text.
- `docMeta`: italic serif 12px tertiary — filename when title differs.
- `body`: padded scroll area (`24px 32px 64px`), `overflow-y: auto`.
- `readingColumn`: `max-width: 64ch`, `margin: 0 auto`.
- Reading-column prose typography: `var(--font-serif)` at `var(--font-size-base)` / `var(--line-height-loose)` (1.75); headings use italic display serif; h5/h6 use mono uppercase kicker style.
- Citation highlights: refactored to use `color-mix(in oklab, var(--color-accent) …)` per design-system token discipline; amber fallbacks removed.

**Per-format renderer CSS modules** — aligned to global tokens:
- Removed all `--text-*`, `--surface-*`, `--border-*` aliases (not in global tokens.css).
- `markdown-renderer.module.css`, `html-renderer.module.css`: cleared duplicate `max-width` / `padding` from `.container` (parent reading column handles these); full prose element styles using `var(--color-*)`, `var(--font-*)`, `var(--font-size-*)`, `var(--space-*)`.
- `fallback-renderer.module.css`: serif/italic/tertiary messaging styles.
- `structured-renderer.module.css`: mono kicker headings, serif body, token-aligned.
- `pdf-renderer.module.css`: removed fallback literal colors, uses token-only values.

**`document-tab-body.test.tsx`** — 5 new visual contract tests added (15 total, all green):
- h1 renders the display title.
- h1 renders filename when title is null (no duplicate text with kicker).
- Kicker renders the MIME type.
- `docMeta` renders filename when title differs from filename.
- `docMeta` absent when title equals filename.

### Scope boundary

Three-column layout shell (TOC left · reading center · right panel) belongs to the parent `-side-panels-restyle` story. This story owns only the center reading column chrome and typography.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `mark.dataset["sessionId"]` in `applyCitationMark` triggers a pre-existing biome `useLiteralKeys` warning (should be `mark.dataset.sessionId`). Pre-existing — this code was not introduced by this story. Tracked separately.
- `noUnusedFunctionParameters` on `root: Element` in `applyCitationMark` is similarly pre-existing.

**Notes**: Token sweep is thorough — no stale `--surface-*`, `--text-*`, or `rgba()` literals in any of the five CSS modules. The `readingColumn` wrapper pattern cleanly delegates max-width and typography to the shell without leaking into per-format renderer modules. Citation highlight refactor from amber fallback values to `color-mix(in oklab, var(--color-accent) …)` is correct token discipline. 15 tests (10 pre-existing + 5 new visual contract) all pass. The `docMeta` condition (`data.title && data.title !== data.filename`) is correct for all three test cases (null title, equal title/filename, different title/filename). Scope boundary with the side-panels story is clearly documented.
