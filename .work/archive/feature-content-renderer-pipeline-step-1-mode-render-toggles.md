---
id: feature-content-renderer-pipeline-step-1-mode-render-toggles
kind: story
stage: done
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

## Implementation notes (2026-05-24)

Added `RenderToggles` interface, `DEFAULT_RENDER_TOGGLES` constant (Object.freeze, all `true`), and `resolveRenderToggles(mode)` to `packages/core/src/types/mode.ts`. Added `renderToggles?: RenderToggles` to the `Mode` interface alongside the existing `questionConstraints?` field.

Runtime exports (`DEFAULT_RENDER_TOGGLES`, `resolveRenderToggles`) surfaced from `packages/core/src/types/index.ts` via an explicit value export line (the existing `export type *` would have omitted them).

Resolver mirrors `resolveQuestionConstraints` pattern: field-by-field `??` rather than spread, so an explicit `undefined` value in the override never inadvertently shadows the default.

All 8 existing modes in `packages/curriculum/src/modes/` typecheck unchanged — field is optional. 5 unit tests added covering: frozen defaults, undefined→defaults, partial override, all-false override, empty-object override. `pnpm typecheck && pnpm lint && pnpm test` all green (1192 tests pass).

## References
- Parent feature: `.work/active/features/feature-content-renderer-pipeline.md` § Unit 1
- File: `packages/core/src/types/mode.ts`

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none / **Important**: none / **Nits**: none

**Notes**: 8 LoC interface + field on `Mode` + `Object.freeze`d `DEFAULT_RENDER_TOGGLES` + `resolveRenderToggles` with field-by-field `??` merge (mirrors `resolveQuestionConstraints` pattern exactly). 5 tests cover frozen defaults, all-undefined, partial override, all-false, empty-object. Existing 8 modes typecheck unchanged. Barrel export pattern correctly distinguishes type vs runtime-value exports (`export type *` doesn't re-export values, so explicit export line added).
