---
id: refactor-useresource-adoption-sweep
kind: feature
stage: drafting
tags: [refactor, ui]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Refactor: adopt useResource across configure routes and misc components

## Brief

The `useResource(loader)` hook at `packages/ui/src/hooks/use-resource.ts`
encapsulates the standard load-with-state-and-error pattern returning
`{ data, loading, error, refresh, setData }`. It's used correctly in
several places (e.g., `study-skills-tab-body`,
`library-document-picker`), but at least 10 components inline the exact
same setState/try/catch/finally block manually instead of using the hook.

This is **pure refactor** — the observable loading/error/refresh
behavior of each component stays identical; only the implementation
shifts from inline to hook-mediated.

## Surface area

### Configure routes (worst offenders)

- `packages/ui/src/routes/configure/memory-tab.tsx:45-130` — **5 inline
  load blocks** (mastery, misconceptions, procedural, affective, episodic
  events). Naming bloat: `masteryLoading`, `miscError`,
  `proceduralLoading`, etc., one per projection. Each block is the
  textbook useResource shape.
- `packages/ui/src/routes/configure/prompt-tab.tsx` — similar pattern
  (verify exact line count during design)
- `packages/ui/src/routes/configure/course-tab.tsx:231,253,265` — same
  pattern in 3 places

### Misc components

- `packages/ui/src/components/page-image-panel.tsx:18,25,50`
- `packages/ui/src/components/attributed-preview-pane.tsx:25,29,41`
- `packages/ui/src/components/document-viewer/pdf-renderer.tsx:31,62,84`
- `packages/ui/src/routes/workspace/note-editor-page.tsx:35,43,63`
- `packages/ui/src/context/tabs-context.tsx:105,109,127` — note: a context
  provider, not a leaf component — extra care so the hook composes
  cleanly with the provider's `useEffect` lifecycle

### Edge: streaming consumers

`memory-tab.tsx`'s `loadEpisodic` (lines 119-150) is **streaming** with an
AbortController, not a single Promise. `useResource` does not cover this
shape today. Either:
- Extend `useResource` (or add `useStreamedResource`) to cover the
  streaming case, OR
- Keep the streaming loader inline and only convert the 4
  single-fetch loaders in memory-tab.

Decide during design.

## Why a feature (not a story)

- 10+ component touch points across 6+ files
- Each has slightly different state shapes (single value vs Map vs Array)
  — design pass should confirm the hook signature is sufficient or
  whether a `useResourceMap<K, V>` variant is worth adding
- Streaming consumer in memory-tab.tsx (`loadEpisodic`) needs an
  explicit decision: extend the hook or leave as-is
- Provider-context call site (`tabs-context.tsx`) is structurally
  different from leaf components

## Discovery findings to design against

- `useResource` is the canonical pattern (documented at
  `.claude/skills/patterns/use-resource-hook.md`)
- Memory-tab alone has 5 inline duplications — single highest-impact file
- Streaming loader is the outlier — confirm scope before adopting
- Borderline candidates: `homework-tab-body`, `quiz-tab-body`,
  `exam-tab-body` — these use `useAssignment` which already wraps the
  pattern. Verify they're not double-inlining.

## Out of scope

- Adding new loading/error UI — only swap implementation, keep the
  rendered loading/error UX identical.
- Refactoring `useAssignment` or `useGates` (they already wrap useResource
  correctly).
- Cross-tab data caching / SWR-style invalidation.

## Acceptance Criteria

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (UI tests for each touched component must pass
      unmodified)
- [ ] `grep -rn 'setLoading(true)\|setLoading(false)' packages/ui/src/ | grep -v use-resource | grep -v node_modules | wc -l` drops to ≤2 (acceptable residuals: streaming-loader holdouts and useResource itself)
- [ ] Every touched component renders identical loading/error states to
      before (verified by snapshot or behavior tests where they exist)

## Risk

**Low-medium** — UI state-management swap, well-typed, narrow blast
radius per component. The provider call site (tabs-context.tsx) carries
slightly higher risk due to React effect-ordering semantics.

## Rollback

`git revert <commit>` per component is clean; recommend one commit per
file or per cluster.
