---
id: feature-content-renderer-pipeline-step-1-mode-render-toggles
kind: story
stage: implementing
tags: [content, rendering, config]
parent: feature-content-renderer-pipeline
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 1: `Mode.renderToggles` field + defaults + resolver

## Scope
Add the `RenderToggles` type and the `renderToggles?` field on `Mode`. Provide `DEFAULT_RENDER_TOGGLES` (all true) and `resolveRenderToggles(mode)` as the single merge point. Every existing mode typechecks unchanged (the field is optional).

## Implementation
- Edit `packages/core/src/types/mode.ts`:
  - Add `export interface RenderToggles { callouts?; figures?; definitions?; conceptRefs?; glossary?; bareGlyphMath?; unitAutoDetect?; filePathAutoDetect? }` (all `?: boolean`)
  - Add `renderToggles?: RenderToggles` to the `Mode` interface
  - Export `DEFAULT_RENDER_TOGGLES: Required<RenderToggles>` with all values `true`
  - Export `resolveRenderToggles(mode: Pick<Mode, "renderToggles">): Required<RenderToggles>` that spreads defaults under explicit values
- Confirm all existing modes in `packages/curriculum/src/modes/` typecheck unchanged (no field needed; the option is optional)
- Add `packages/core/src/__tests__/mode-render-toggles.test.ts` covering: undefined → defaults; partial override preserves defaults for unset keys; all-false override returns all-false.

## Acceptance Criteria
- [ ] `RenderToggles` interface exported with 8 optional boolean fields
- [ ] `Mode.renderToggles?: RenderToggles` field added
- [ ] `DEFAULT_RENDER_TOGGLES` exported (Required, all true)
- [ ] `resolveRenderToggles(mode)` returns merged `Required<RenderToggles>`
- [ ] All 8 existing modes (`teach`, `homework`, `quiz`, `exam`, `course-create`, `configure`, `study-skills`, +any others) typecheck without modification
- [ ] Unit tests cover undefined / partial / all-false merge cases
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green

## References
- Parent feature: `.work/active/features/feature-content-renderer-pipeline.md` § Unit 1
- File: `packages/core/src/types/mode.ts`
