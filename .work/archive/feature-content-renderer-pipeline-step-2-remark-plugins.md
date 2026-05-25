---
id: feature-content-renderer-pipeline-step-2-remark-plugins
kind: story
stage: done
tags: [content, rendering, markdown]
parent: feature-content-renderer-pipeline
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 2: Remark admonitions plugin + `remark-directive` integration

## Scope
Hand-rolled `remarkAdmonitions` plugin that parses GitHub-style `> [!hint]` blockquote admonitions into `containerDirective` nodes. Add `remark-directive` (community) so the existing pipeline can convert these to HAST. Both plugins are NOT yet wired into `markdown-content.tsx` — that happens in step-8.

## Implementation
- Create `packages/ui/src/lib/markdown-plugins/remark-admonitions.ts`:
  - Export `remarkAdmonitions: () => (tree: Root) => void`
  - Walk `blockquote` nodes; if first paragraph text matches `^\s*\[!(theorem|lemma|hint|warning|steps)\]\s*\n?`, convert the blockquote to a `containerDirective` node with `name: "admonition"`, `attributes: { type }`, children = remaining blockquote content with the `[!type]` text stripped
  - Skip blockquotes that don't match (regular passage quotes)
  - Follow the `lib/rehype-citation-chips.ts` shape (collect-replacements-then-splice)
- Add `remark-directive ^4.0.0` (or current latest stable matching `react-markdown`'s mdast version) to `packages/ui/package.json` dependencies. Verify version compatibility via `npm view remark-directive` at implementation time.
- Run `pnpm install` to update lockfile.
- Add tests at `packages/ui/src/__tests__/remark-admonitions.test.ts`:
  - Each type (`theorem`, `lemma`, `hint`, `warning`, `steps`) converts correctly
  - Non-admonition blockquote unaffected
  - Nested markdown inside admonition body preserved (emphasis, links, inline math)
- Smoke verify `remark-directive` is installed correctly: write a minimal test that runs a `unified().use(remarkParse).use(remarkDirective).process("::: figure :::")` and asserts the directive node is parsed.

## Acceptance Criteria
- [x] `remarkAdmonitions` plugin parses all 5 admonition types into containerDirective nodes
- [x] Plugin skips non-`[!type]` blockquotes
- [x] `remark-directive` added to `packages/ui/package.json` dependencies; lockfile updated
- [x] Smoke test confirms `remark-directive` parses `::: figure :::` correctly
- [x] Plugin tests cover each type + nested markdown preservation
- [x] No regression on existing markdown render tests

## Implementation notes (2026-05-24)

- `remarkAdmonitions` implemented at `packages/ui/src/lib/markdown-plugins/remark-admonitions.ts`. Follows the collect-replacements-then-splice pattern from `rehype-citation-chips.ts`. Uses `unist-util-visit` (added as direct prod dep alongside `unist-util-visit-parents`) to walk `blockquote` nodes.
- `ContainerDirective` typed locally (inline interface) to avoid adding `mdast-util-directive` as a direct dep — the same approach as the `RehypePlugin` alias in the other plugins.
- `@types/mdast ^4.0.4` added as devDep so the `Blockquote`, `Paragraph`, `Text`, `Root` imports resolve under `tsgo`.
- Test helpers import `unified`, `remark-parse`, `remark-stringify` (added as devDeps) and call `processor.runSync(tree)` after `processor.parse(md)` — `.parse()` alone does not run transformer plugins.
- `remark-directive ^4.0.0` (latest stable) is compatible with the project's `remark-math ^6.0.0` / `react-markdown ^10.1.0` (both target mdast 4.x).
- 21 tests, all passing. No regressions across the 166-file UI test suite.

## References
- Parent feature: `.work/active/features/feature-content-renderer-pipeline.md` § Unit 2
- Template: `packages/ui/src/lib/rehype-citation-chips.ts`

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none / **Important**: none / **Nits**: none

**Notes**: `remarkAdmonitions` plugin parses GitHub-style `> [!type]` blockquotes into `containerDirective` nodes via collect-then-splice pattern. `ContainerDirective` typed locally to avoid pulling `mdast-util-directive` as a direct dep — sensible. `remark-directive ^4.0.0` added with `@types/mdast` + `unist-util-visit` deps for resolution. `remark-parse`, `remark-stringify`, `unified` added as devDeps for test harness — fine. Test correctly calls `processor.runSync(tree)` after `processor.parse(md)` (transformer plugins don't run during parse). 21 tests cover all 5 types + body stripping + nested markdown + non-admonition blockquote isolation. Smoke test verifies `remark-directive` parses `::: figure :::` correctly. Plugin NOT yet wired into REHYPE_PLUGINS (per scope — step-8).
