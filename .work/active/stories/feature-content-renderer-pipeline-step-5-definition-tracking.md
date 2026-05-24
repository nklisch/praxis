---
id: feature-content-renderer-pipeline-step-5-definition-tracking
kind: story
stage: implementing
tags: [content, rendering, memory, cross-package]
parent: feature-content-renderer-pipeline
depends_on: [feature-content-renderer-pipeline-step-3-css-primitives]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 5: First-introduction definition tracking — projection + plugin + component

## Scope
Adds the `term_first_occurrences` projection in `@praxis/memory` with `hasSeenTerm` / `markTermSeen` API. Plus the `remarkDefinitions` plugin that parses `[[def:term]]` markers, and the `<Definition>` component that conditionally emits `.definition` styling based on first-occurrence per student.

## Implementation

### Memory layer
- Edit `packages/memory/src/schema.ts`:
  - Add `termFirstOccurrences` table: `studentId`, `termNormalized`, `firstSeenSessionId`, `firstSeenAt`; PK on `(studentId, termNormalized)`
- Generate migration: `pnpm db:generate` → review SQL in `drizzle/` and commit
- Create `packages/memory/src/term-first-occurrences.ts`:
  - Export `TermFirstOccurrencesService` interface with `hasSeenTerm(studentId, term): Promise<boolean>` + `markTermSeen(studentId, term, sessionId): Promise<void>`
  - Implementation: normalize term (lowercase, strip punctuation, collapse whitespace); `hasSeenTerm` queries by PK; `markTermSeen` uses `ON CONFLICT DO NOTHING` insert
- Wire into `@praxis/core` `ServiceDeps` via `build-memory-services.ts` pattern; expose on `services.memory.termFirstOccurrences`
- Add `packages/memory/src/__tests__/term-first-occurrences.test.ts` using `useTempDb()` (per `temp-db-test-helper` pattern):
  - hasSeenTerm returns false before any markTermSeen
  - markTermSeen + hasSeenTerm returns true
  - Idempotent: marking the same term twice doesn't update firstSeenSessionId
  - Different students isolated

### Renderer layer
- Create `packages/ui/src/lib/markdown-plugins/remark-definitions.ts`:
  - Walks text nodes; for each `\[\[def:([^\]]+)\]\]` match, replaces the marker with a custom HAST element `<definition term="...">term-text</definition>` (the term-text equals the matched term itself, preserving the agent's display)
  - Skip ancestors with tag `code` / `pre`
  - Follow `lib/rehype-citation-chips.ts` shape
- Create `packages/ui/src/components/markdown/definition.tsx`:
  - Props: `term: string`, `isFirstOccurrence: boolean`, `children: ReactNode`
  - Renders `<dfn className={isFirstOccurrence ? styles.definition : undefined}>` (or wraps inline text + dfn semantic)
  - Pure presentational
- Add `packages/ui/src/hooks/use-first-occurrence.ts`:
  - `useFirstOccurrence({ studentId, sessionId, hasSeenTerm, recordOccurrence, terms })` builds a per-turn `Map<term, boolean>` once and returns `isFirst(term)`. Uses `useMemo` keyed by `studentId + termsHash` to prevent re-computation.
  - When `recordOccurrence === true`, calls `markTermSeen` for each genuinely-first term after render (one-shot, side-effect).
- Tests:
  - `packages/ui/src/__tests__/remark-definitions.test.ts` — parse `[[def:term]]` markers; skip ancestors
  - `packages/ui/src/__tests__/markdown/definition.test.tsx` — renders styled when isFirstOccurrence=true
  - `packages/ui/src/__tests__/hooks/use-first-occurrence.test.tsx` — per-turn cache: second occurrence of same term returns false

## Acceptance Criteria
- [ ] Drizzle migration creates `term_first_occurrences` table; `pnpm db:reset` succeeds
- [ ] `TermFirstOccurrencesService` implemented with both methods; idempotent insert via `ON CONFLICT DO NOTHING`
- [ ] Term normalization: lowercase + punctuation-stripped + whitespace-collapsed
- [ ] `remarkDefinitions` parses `[[def:term]]` and emits HAST `<definition>` elements
- [ ] `<Definition>` renders `.definition` class when `isFirstOccurrence=true`, plain prose otherwise
- [ ] `useFirstOccurrence` per-turn cache: second occurrence of same term returns false
- [ ] Integration test: three definitions, two repeated → exactly the unique-first occurrences get `.definition`
- [ ] All tests pass (`pnpm test`)

## References
- Parent feature: `.work/active/features/feature-content-renderer-pipeline.md` § Unit 5
- Patterns: `.claude/skills/patterns/temp-db-test-helper.md`, `.claude/skills/patterns/builder-module-composition.md`
- Files: `packages/memory/src/schema.ts`, `packages/ui/src/lib/rehype-citation-chips.ts` (template)
