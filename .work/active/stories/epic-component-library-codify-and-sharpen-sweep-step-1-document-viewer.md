---
id: epic-component-library-codify-and-sharpen-sweep-step-1-document-viewer
kind: story
stage: done
tags: [refactor]
parent: epic-component-library-codify-and-sharpen-sweep
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-20
updated: 2026-05-20
---

# Step 1 — Proof slice: adopt the contract in `components/document-viewer/`

## Brief

Apply the locked design-system contract (`.mockups/design-system/components.css`,
`tokens.css`, `motion.css`) to the five document-viewer CSS modules. This
is the proof slice — its job is to lock in the per-token translation
table the other five area sweeps will reuse.

## Files in scope

- `packages/ui/src/components/document-viewer/fallback-renderer.module.css`
- `packages/ui/src/components/document-viewer/html-renderer.module.css`
- `packages/ui/src/components/document-viewer/markdown-renderer.module.css`
- `packages/ui/src/components/document-viewer/pdf-renderer.module.css`
- `packages/ui/src/components/document-viewer/structured-renderer.module.css`

## Current state

Verified 2026-05-20:

- 0/5 files declare `composes: ... editorial from global`
- 1 `rgb()`/`rgba()` literal
- 5 raw `Npx` values in `padding`/`margin`/`gap`
- 0 bare-`ms` transitions
- 0 `cubic-bezier(...)` literals

## Target state

- Every container that renders editorial body text composes the
  `editorial` utility (`composes: editorial from global;`)
- Every color value is `var(--color-*)`
- Every spacing value is `var(--space-*)`
- Where the surface prints metadata above a heading: use
  `.editorial-kicker`
- Where the surface separates sections: use `.section-rule`

## Implementation notes

This slice locks the **token translation table** the other five sweeps
will reuse. Capture it in the "Translation table" section below as work
proceeds. Common substitutions to expect:

- `4px → var(--space-1)`, `8px → var(--space-2)`, `12px → var(--space-3)`,
  `16px → var(--space-4)`, `24px → var(--space-6)`, `32px → var(--space-8)`,
  `48px → var(--space-12)`, `64px → var(--space-16)`
- `rgba(0, 0, 0, 0.05)` family → `color-mix(in srgb, var(--color-text-primary) 5%, transparent)`
- Hairline borders stay as `1px solid var(--color-border)` (no spacing
  token applies; matches the contract's primitives)
- Focus outlines stay as `2px solid var(--color-accent)` (matches `.btn`,
  `.input`, etc. in `components.css`)

If a needed value doesn't have a token, **pause and refine `tokens.css`
in-place** — that's an expected contract-refinement loop, not a
violation. Document the addition in this story's body.

## Acceptance criteria

- [ ] `pnpm build && pnpm typecheck && pnpm test` green
- [ ] `grep -rnE '\b(rgb|rgba)\(' --include='*.module.css' packages/ui/src/components/document-viewer | wc -l` returns `0`
- [ ] `grep -rnE '\b(padding|margin|gap)[^:]*:\s*[^v;]*[0-9]+px' --include='*.module.css' packages/ui/src/components/document-viewer | grep -v 'var(--' | wc -l` returns `0`
- [ ] Token translation table captured in this story body for downstream slices
- [ ] All editorial-body containers in scope compose `editorial from global`

## Translation table

Locked 2026-05-20 during the document-viewer proof slice.

### Spacing
- `4px → var(--space-1)` (exact match)
- `5px → var(--space-1)` (inline-code horizontal pad; 1px shift invisible at this scale)
- `1px → var(--space-0-5)` (inline-code vertical pad; NEW token)
- `2px → var(--space-0-5)` (page-label vertical pad; NEW token — exact match)
- `6px → var(--space-1-5)` (table-cell vertical pad; NEW token — exact match)
- `8px → var(--space-2)` (exact match)
- `12px → var(--space-3)` (exact match)
- `16px → var(--space-4)` (exact match)
- `24px → var(--space-6)` (exact match)
- `32px → var(--space-8)` (exact match)
- `48px → var(--space-12)` (exact match)
- `64px → var(--space-16)` (exact match)

### New tokens added to `.mockups/design-system/tokens.css`
- `--space-0-5: 2px` — tight chip / inline-label padding (inline-code vertical, page-label vertical)
- `--space-1-5: 6px` — table-cell vertical padding and tab-indicator drift; sits between `--space-1` (4px) and `--space-2` (8px)

### Color
- `rgba(255, 255, 255, 0.85) → color-mix(in srgb, var(--color-bg-secondary) 85%, transparent)`
  Rationale: `--color-bg-secondary` is `#ffffff` in light mode, `#21221f` in dark mode — the `color-mix` expression tracks the theme correctly; `rgba` hardcoded white would break in dark mode.
  `color-mix(in srgb, ...)` is supported in Electron 41 / Chromium 130+ — no fallback needed.
- `rgba(0, 0, 0, α)` general form → `color-mix(in srgb, var(--color-text-primary) α%, transparent)`
- `rgba(255, 255, 255, α)` general form → `color-mix(in srgb, var(--color-bg-secondary) α%, transparent)`

### Editorial adoption decisions
- `fallback-renderer.module.css` `.message`: **composed** — italic serif "preview not available" notice is an editorial surface. Removed explicit `font-family: var(--font-serif)` and `font-style: italic` (both provided by `composes: editorial from global`).
- `html-renderer.module.css` `.container`: **composed** — prose container for sanitised arbitrary HTML (h1–h6, p, ul/ol, blockquote, etc.). Child selectors set `font-family` explicitly per element; composing `editorial` on the container is safe because `--font-display` = `--font-serif` in this system, so any non-explicit child text inherits the correct serif stack.
- `markdown-renderer.module.css` `.container`: **composed** — prose container for react-markdown output (same shape as html-renderer). All rendered child elements are explicitly styled; composition is safe for the same reason.
- `pdf-renderer.module.css`: **not composed** — image rendering surface; no prose body. `.status`, `.noPages`, `.hint` already set `font-style: italic` explicitly; no editorial container exists.
- `structured-renderer.module.css` `.sectionBody`: **not composed** — this is a `<pre>` element using `white-space: pre-wrap` for DOCX/PPTX structured content. Pre-formatted content rendered italic would be wrong for this surface. `.container` is purely a layout div with no text of its own.

### Exceptions
None in this slice. All values mapped cleanly to tokens (including two new micro-spacing tokens added during the contract-refinement loop).

### Acceptance gate verification (2026-05-20)
- `rgb|rgba` count in scope: **0** (was 1)
- bare-px in padding/margin/gap count in scope: **0** (was 7 declarations across 4 files)
- `pnpm vitest run packages/ui`: **157 files, 1628 tests, all passed**
- `pnpm build`: **passed**
- `pnpm typecheck`: pre-existing failure in `tests/configure-end-to-end.test.ts:197` (unrelated; documented in CLAUDE.md)
- `pnpm biome check packages/ui/src/components/document-viewer`: **clean (15 files, no fixes)**

## Risk

Low. Five files, six drift values, no shared subclasses, no cross-file
state. The risk is mis-locking a translation rule that the rest of the
sweep then has to undo — mitigation is to keep the table conservative
(prefer exact-match substitutions; don't generalize from a single
example).

## Rollback

`git revert <commit>` — single-area scope, no cross-file dependencies.

## Review (2026-05-20)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Proof slice delivered as scoped. The translation table was the explicit downstream deliverable — every other sweep story referenced it. Two new tokens (`--space-0-5: 2px`, `--space-1-5: 6px`) cleanly extend the spacing scale without breaking the 8pt baseline rhythm. `color-mix` adoption verified in Electron 41. 1628/1628 UI tests green; final lint guard catches no drift in this scope.
