---
id: feature-content-renderer-pipeline-step-7-post-render-passes
kind: story
stage: done
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

## Implementation notes (2026-05-24)

### rehype-file-paths
- Created `packages/ui/src/lib/markdown-plugins/rehype-file-paths.ts`
- `FILE_PATH_RE = /\b[\w-]+(?:\/[\w.-]+)+\.\w{1,8}\b/g` — requires at least one slash and a dot-extension
- `SKIP_TAGS = Set(["code", "pre", "kbd", "samp", "a"])` — ancestor skip
- Mirrors `rehype-math-glyph-wrap.ts` collect-then-splice pattern exactly
- Wraps matches in `<span class="file-path">` (unhashed class name for CSS global selector; CSS Module `.filePath` styles it via the module)
- Tests `packages/ui/src/__tests__/rehype-file-paths.test.ts` (14 tests): all pass

### rehype-units
- Created `packages/ui/src/lib/markdown-plugins/rehype-units.ts`
- `UNIT_TABLE` exported `as const` — multi-char SI + imperial only; single-letter J/N/W/V/A/g/m/s excluded (false-positive risk vs variable names)
- Longer/compound tokens ordered first in table to prevent prefix shadowing in alternation regex (e.g. `m/s²` before `m/s`, `kHz` before `Hz`)
- `UNIT_RE` uses lookahead `(?=[\s.,;:!?)]|$)` instead of `\b` to handle compound units ending in `²` (which is not a `\w` char)
- Wraps matches in `<span class="units"><span class="num">N</span><span class="unit">U</span></span>`
- Same ancestor-skip pattern as file-paths
- Tests `packages/ui/src/__tests__/rehype-units.test.ts` (20 tests): all pass

### Design discovery
- `°C`/`°F` degree-sign units end in a word char so `\b` works; `m/s²` ends in `²` (non-word) so lookahead boundary used instead.
- Both plugins ship unwired — step-8 adds them to `REHYPE_PLUGINS` in `markdown-content.tsx`.

## References
- Parent feature: `.work/active/features/feature-content-renderer-pipeline.md` § Unit 7
- Template: `packages/ui/src/lib/rehype-citation-chips.ts`

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none / **Important**: none / **Nits**: none

**Notes**: Two rehype plugins shipped, both mirroring `rehype-math-glyph-wrap.ts` collect-then-splice pattern. File-paths: regex requires slash + 1-8-char extension; skips code/pre/kbd/samp/a. Units: 58-entry `UNIT_TABLE` (multi-char only; single-letter J/N/W/V/A/g/m/s excluded for false-positive prevention); longer compounds ordered first to prevent prefix shadowing; lookahead boundary `(?=[\s.,;:!?)]|$)` instead of `\b` to handle `m/s²` (ends in non-word `²`) — sharp design discovery. Wraps `<span class="units"><span class="num">N</span><span class="unit">U</span></span>`. 14 + 20 tests. Both plugins unwired (step-8 territory).
