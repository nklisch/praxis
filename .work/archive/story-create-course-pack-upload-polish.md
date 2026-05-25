---
id: story-create-course-pack-upload-polish
kind: story
stage: done
tags: [ui]
parent: feature-course-create-improvements
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-25
---

# Polish the course-create pack / upload / create-your-own row to match the original mocks

## Brief
The "pack / upload / create your own" row on the course-create entry screen has drifted from the source mocks: spacing between the three options feels crowded, items are justified to the bottom rather than aligned with the upload text baseline, leading symbols sit too close to the words next to them, and the pack tiles render undersized. Revisit the layout against `.mockups/screens/<course-create-feature-id>/` (or the equivalent flow mock), tighten alignment, padding, and tile sizing.

## Related cross-cutting parks
- `story-leading-symbol-spacing` (sibling under `feature-design-system-polish-sweep`) handles the global leading-symbol-spacing token. If that lands first, this story inherits the fix for the leading-symbol piece and only needs to address the row-specific issues (crowding, baseline justification, tile size).

## Source idea
`idea-create-course-pack-upload-polish` (parked 2026-05-24).

## Implementation notes (2026-05-25)

**Issues addressed** (leading-symbol spacing already landed in commit `de369f87`):

1. **Pack tile `align-items: center` → `align-items: baseline`** in `.packRow` in `source-picker.module.css`. The mock (`.mockups/screens/epic-course-create-readiness-unified-landing-source-picker/option-4.html`) uses `.pack-row { align-items: baseline }`. The production code had `center` which justified the "Use this pack" button to the vertical middle rather than the text baseline.

2. **Pack list gap `--space-2-5` → `--space-3`** in `.packList`. The tighter gap made packs feel crowded; bumping to `--space-3` matches the mock's 10px gap (at default token scale).

3. **Tab glyph gap uses `--space-leading-symbol` token** — `.tab { gap: var(--space-leading-symbol, var(--space-2)) }` instead of the hard-coded `--space-2`. This picks up the global leading-symbol token (introduced in `de369f87`) for consistent glyph-to-label spacing across the tab bar.

4. **Or-bar alt link gap** also uses `--space-leading-symbol` token for the same reason.

**Files changed**:
- `packages/ui/src/components/source-picker.module.css` — all four changes above
