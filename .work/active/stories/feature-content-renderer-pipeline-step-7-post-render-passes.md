---
id: feature-content-renderer-pipeline-step-7-post-render-passes
kind: story
stage: implementing
tags: [content, rendering, markdown]
parent: feature-content-renderer-pipeline
depends_on: [feature-content-renderer-pipeline-step-3-css-primitives]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 7: File-path + unit auto-detection rehype passes

## Scope
Two rehype post-render plugins that walk text nodes and wrap matches in CSS-class spans. Both gated by their respective `renderToggles` flag (wired in step-8).

## Implementation

### File paths
- Create `packages/ui/src/lib/markdown-plugins/rehype-file-paths.ts`:
  - Walk text nodes via `visitParents`; for each `\b[\w-]+(?:\/[\w.-]+)+\.\w{1,8}\b` match, wrap in `<span class="file-path">`
  - Skip ancestors with tag `code` / `pre` / `kbd` / `samp` / `a`
  - Follow `lib/rehype-citation-chips.ts` shape (collect-then-splice)

### Units
- Create `packages/ui/src/lib/markdown-plugins/rehype-units.ts`:
  - Define a `UNIT_TABLE` (constant export for tests): multi-character SI + common imperial units. Examples: `kg`, `mL`, `Hz`, `J`, `N`, `Pa`, `K`, `ft`, `mi`, `lb`, `oz`, `m/s`, `m/s²`, etc.
  - **Exclude** single-letter units (`g`, `m`, `s`) — too high false-positive risk against variable names in prose
  - Regex: `(\d+(?:\.\d+)?)\\s?(${UNIT_TABLE.join("|")})\\b`
  - Wrap matches in `<span class="units"><span class="num">5</span><span class="unit">kg</span></span>`
  - Same ancestor-skip rules as file-paths

### Tests
- `packages/ui/src/__tests__/rehype-file-paths.test.ts`:
  - Matches `packages/core/src/foo.ts`
  - Skips inside `<code>`, `<pre>`, `<a>`
  - Doesn't match URLs (no slashes without dots, or autolinked already)
- `packages/ui/src/__tests__/rehype-units.test.ts`:
  - Matches `5kg`, `100 Hz`, `9.8 m/s²`
  - Doesn't match `5g` (g excluded), `5km` (km not in table by default — confirm)
  - Skips inside `<code>`
  - UNIT_TABLE coverage test asserts the export shape

## Acceptance Criteria
- [ ] `rehype-file-paths.ts` wraps matches with `.file-path` class
- [ ] File-path plugin skips ancestors: code, pre, kbd, samp, a
- [ ] `rehype-units.ts` wraps matches with `.units` (containing `.num` + `.unit`)
- [ ] Unit table excludes single-letter units to avoid prose-variable false positives
- [ ] Both plugins use the `visitParents` + collect-then-splice pattern from `rehype-citation-chips`
- [ ] Unit tests cover happy path + ancestor-skip + false-positive-avoidance

## References
- Parent feature: `.work/active/features/feature-content-renderer-pipeline.md` § Unit 7
- Template: `packages/ui/src/lib/rehype-citation-chips.ts`
