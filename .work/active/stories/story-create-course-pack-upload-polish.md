---
id: story-create-course-pack-upload-polish
kind: story
stage: implementing
tags: [ui]
parent: feature-course-create-improvements
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Polish the course-create pack / upload / create-your-own row to match the original mocks

## Brief
The "pack / upload / create your own" row on the course-create entry screen has drifted from the source mocks: spacing between the three options feels crowded, items are justified to the bottom rather than aligned with the upload text baseline, leading symbols sit too close to the words next to them, and the pack tiles render undersized. Revisit the layout against `.mockups/screens/<course-create-feature-id>/` (or the equivalent flow mock), tighten alignment, padding, and tile sizing.

## Related cross-cutting parks
- `story-leading-symbol-spacing` (sibling under `feature-design-system-polish-sweep`) handles the global leading-symbol-spacing token. If that lands first, this story inherits the fix for the leading-symbol piece and only needs to address the row-specific issues (crowding, baseline justification, tile size).

## Source idea
`idea-create-course-pack-upload-polish` (parked 2026-05-24).
