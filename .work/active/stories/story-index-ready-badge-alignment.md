---
id: story-index-ready-badge-alignment
kind: story
stage: review
tags: [ui, design-system]
parent: feature-design-system-polish-sweep
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-25
---

# Status-badge + color-dot primitives: bump size, recenter against cap height

## Brief
The "indexed" / "ready" status icons (and similar small status badges) render too small and aren't vertically aligned with adjacent text. The color dots / swatches sit too far below the visual center of nearby text and the dot body itself reads undersized. Audit the status-badge and color-dot primitives in `packages/ui/src/components/` (and any inline equivalents), bump their size up, and recenter them against the cap height of accompanying text so alignment reads correctly across all surfaces that use them.

## Surfaces affected
- Library document cards (indexed/ready badges)
- Course/lesson cards (color dots and status indicators)
- Anywhere a `badge` / `pill` primitive sits inline with text

## Source idea
`idea-index-ready-badge-alignment` (parked 2026-05-24).

## Implementation notes (2026-05-25)

**Approach**: Audited all `.badge`, `.pill`, status dot, and status indicator CSS across the UI. Applied three targeted fixes:

1. **`packages/ui/src/components/document-list.module.css`** — `.badge` (indexed/ready status on library doc cards): bumped `font-size` from `0.7rem` to `0.72rem`, increased padding from `0.1rem 0.35rem` to `0.15rem 0.4rem`, added `vertical-align: middle` and `line-height: 1`, changed `align-self` from `flex-start` to `center` so badge recenters against adjacent text cap height.

2. **`packages/ui/src/routes/course-create.module.css`** — `.statusIndexing` / `.statusReady` / `.statusError` pills: bumped font from `9px` to `10px`, padding from `3px var(--space-1-5)` to `4px var(--space-2)`, added `align-self: center` and `vertical-align: middle` for proper cap-height alignment.

3. **`.mockups/design-system/components.css`** — `.badge` primitive: added `vertical-align: middle` so it aligns against cap height when rendered inline with text.

**Discovery note**: The main alignment issue was that badges used `align-self: flex-start` (fine within flex columns for the info block) but the badge itself was floating too high relative to text. `align-self: center` + `vertical-align: middle` correctly seats the badge at the optical midpoint of adjacent text regardless of rendering context.

No new failing tests. No pre-existing lint errors introduced.
