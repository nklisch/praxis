---
id: feature-design-system-polish-sweep
kind: feature
stage: implementing
tags: [ui, design-system]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Design-system polish sweep: token & contract alignment

## Brief
Three independent design-system fixes surfaced during dogfooding. The feature is a tracking bucket — each child story applies a token or contract alignment in one well-bounded surface. No feature-level design pass needed; children are clear.

## Children
1. **`story-index-ready-badge-alignment`** — "indexed" / "ready" status icons and color-dot swatches render too small and aren't vertically aligned with adjacent text. Audit the status-badge and color-dot primitives, bump sizes, recenter against cap height.
2. **`story-leading-symbol-spacing`** — leading symbols / icons immediately before words (route headers, course-create, etc.) render too close to their labels app-wide. Apply a uniform spacing token to the editorial primitives and inline symbol-plus-label patterns.
3. **`story-refactor-composer-verbs-contract-divergence`** (refactor) — `.composer-verbs` widget contract divergence between `.mockups/design-system/components.css` (declares `.composer-verb` / `.composer-verb--active`) and production (`packages/ui/src/components/composer-verbs.module.css` uses `.row` and `.chip`). Same pattern as previously-fixed composer divergence; pure naming/contract work.

Children are independent — `depends_on: []` each. Implementation can fan out; `story-leading-symbol-spacing` lands first if scheduled so that `story-create-course-pack-upload-polish` (in the sibling course-create feature) inherits the leading-symbol piece automatically.

## Source ideas absorbed
- `idea-index-ready-badge-alignment` → child story
- `idea-leading-symbol-spacing` → child story
- `idea-composer-verbs-contract-divergence` → refactor child story
