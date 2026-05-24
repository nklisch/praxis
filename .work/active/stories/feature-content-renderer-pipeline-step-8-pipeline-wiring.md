---
id: feature-content-renderer-pipeline-step-8-pipeline-wiring
kind: story
stage: implementing
tags: [content, rendering, ui]
parent: feature-content-renderer-pipeline
depends_on: [feature-content-renderer-pipeline-step-1-mode-render-toggles, feature-content-renderer-pipeline-step-4-callout-figure-components, feature-content-renderer-pipeline-step-5-definition-tracking, feature-content-renderer-pipeline-step-6-concept-glossary-components, feature-content-renderer-pipeline-step-7-post-render-passes]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 8: Wire renderToggles into `markdown-content.tsx` — merge point

## Scope
The merge story. Extend `MarkdownContent` props with `renderToggles` + `studentId` + `sessionId` + `conceptOpen` + `recordDefinitionOccurrence`. Build `REMARK_PLUGINS` / `REHYPE_PLUGINS` arrays conditionally. Wire all new component overrides. Wire `ChatTabBody` (and per-mode tab bodies) to resolve toggles via `resolveRenderToggles(currentMode)` and pass through.

## Implementation
- Edit `packages/ui/src/components/markdown-content.tsx`:
  - New props: `renderToggles?: Required<RenderToggles>`, `studentId?: string`, `sessionId?: string`, `conceptOpen?: (slug: string) => void`, `recordDefinitionOccurrence?: boolean`
  - Build `REMARK_PLUGINS` array conditionally:
    - Base: `[remarkGfm, remarkMath, remarkDirective]`
    - + `remarkAdmonitions` if `toggles.callouts`
    - + `remarkDefinitions` if `toggles.definitions`
  - Build `REHYPE_PLUGINS` array conditionally (order matters — post-passes LAST):
    - Base: `[rehypeKatex, [rehypeHighlight, ...], rehypeCitationChips]`
    - + `rehypeFilePaths` if `toggles.filePathAutoDetect`
    - + `rehypeUnits` if `toggles.unitAutoDetect`
    - (Math-glyph wrap from feature-math-rendering will append here too)
  - Extend `components` overrides:
    - `admonition` → `<Callout type={node.attributes.type}>` (after remark-directive lifts it to HAST)
    - `figure` → `<Figure caption={...} verdict={...}>`
    - `definition` → wraps in `<Definition term=... isFirstOccurrence={useFirstOccurrence(...)}>`
    - `abbr` → `<abbr className={styles.glossary} title={title}>`
    - extend `a` override: `href.startsWith("concept:")` → `<ConceptRef conceptSlug={href.slice(8)} onOpen={conceptOpen}>`
- Edit `packages/ui/src/components/chat-tab-body.tsx` (and per-mode tab bodies):
  - Resolve toggles via `resolveRenderToggles(currentMode)`
  - Pass `renderToggles`, `studentId`, `sessionId`, `conceptOpen` (wired to concept side-panel open), `recordDefinitionOccurrence={isActiveStream}` to `<MessageBubble>` / `<MarkdownContent>` instances
- Add kitchen-sink integration test:
  - `packages/ui/src/__tests__/markdown-content.test.tsx` (extend): render a message that exercises one of every primitive (callout, figure, definition, concept-ref, glossary, code-block, file-path, units, citation, passage). Assert each renders with the expected class.
- Mode-toggle integration test: render same content under a mode with `definitions: false` → no `.definition` classes present.
- Run `pnpm typecheck && pnpm lint && pnpm test`. All green before claiming done.

## Acceptance Criteria
- [ ] `MarkdownContent` accepts all new props
- [ ] `REMARK_PLUGINS` / `REHYPE_PLUGINS` built conditionally by toggle
- [ ] All component overrides wired: Callout, Figure, Definition, ConceptRef, abbr
- [ ] Plugin order verified: post-render passes positioned AFTER structural plugins
- [ ] `ChatTabBody` (and per-mode bodies) resolve and pass toggles correctly
- [ ] Kitchen-sink integration test passes; renders every primitive
- [ ] Mode-toggle test: `definitions: false` mode emits no `.definition` classes
- [ ] All existing `markdown-content.test.tsx` tests still pass
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green

## References
- Parent feature: `.work/active/features/feature-content-renderer-pipeline.md` § Unit 8
- Depends on steps 1, 4, 5, 6, 7 (the merge point)
