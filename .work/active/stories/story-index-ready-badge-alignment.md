---
id: story-index-ready-badge-alignment
kind: story
stage: implementing
tags: [ui, design-system]
parent: feature-design-system-polish-sweep
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
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
