---
id: idea-pptx-slide-image-map-dead-fallback
created: 2026-05-11
tags: [ingestion, cleanup]
---

`buildSlideImageNamesMap` in `packages/tools/src/runtime/ingestion/pptx-ingestor.ts:174-185` falls back to using the array index as the map key when `metadata.slideNumber` is missing on a slide node — but `tryChunkBySlide` only ever looks up image names by `slideNumber` (line 259). The fallback branch is dead code: any slide without `slideNumber` will silently lose its image correlation. Fix one of two ways: (a) drop the array-index fallback and skip slides without slideNumber (fail-loud), or (b) propagate the same `slideNumber ?? idx` fallback to the lookup site in `tryChunkBySlide` so both paths agree. In practice officeparser v6 always emits `slideNumber` for PPTX inputs, so this is edge-case hygiene, not a known-failing bug. Originating review: `feature-powerpoint-ingestion`. Five-minute fix.
