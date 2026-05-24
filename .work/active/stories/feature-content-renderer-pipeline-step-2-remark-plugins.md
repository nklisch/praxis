---
id: feature-content-renderer-pipeline-step-2-remark-plugins
kind: story
stage: implementing
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
- [ ] `remarkAdmonitions` plugin parses all 5 admonition types into containerDirective nodes
- [ ] Plugin skips non-`[!type]` blockquotes
- [ ] `remark-directive` added to `packages/ui/package.json` dependencies; lockfile updated
- [ ] Smoke test confirms `remark-directive` parses `::: figure :::` correctly
- [ ] Plugin tests cover each type + nested markdown preservation
- [ ] No regression on existing markdown render tests

## References
- Parent feature: `.work/active/features/feature-content-renderer-pipeline.md` § Unit 2
- Template: `packages/ui/src/lib/rehype-citation-chips.ts`
