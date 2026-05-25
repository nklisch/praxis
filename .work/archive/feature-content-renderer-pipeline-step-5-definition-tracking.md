---
id: feature-content-renderer-pipeline-step-5-definition-tracking
kind: story
stage: done
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

## Implementation notes (2026-05-24)

All acceptance criteria landed and verified:

- **Schema**: `term_first_occurrences` table added to `packages/memory/src/schema.ts` with composite PK `(student_id, term_normalized)`. Migration generated as `drizzle/0027_faulty_random.sql`; `pnpm db:reset` succeeds.
- **Service**: `packages/memory/src/term-first-occurrences.ts` — `TermFirstOccurrencesService` with `hasSeenTerm` (sync `.get()`) and `markTermSeen` (`insert().onConflictDoNothing().run()`). `normalizeTerm` strips punctuation, lowercases, and collapses whitespace.
- **Wiring**: Exported from `@praxis/memory` index; `TermFirstOccurrencesService` added as optional `toolServices.termFirstOccurrences` on `ServiceDeps` in `@praxis/core`; instantiated in `packages/desktop/electron/main/services/build-memory-services.ts` and wired in `services.ts`.
- **`vitest.config.ts`**: Created for `@praxis/memory` so `packages/*` glob in root vitest config discovers the package.
- **`tsconfig.electron.json`**: Added `@praxis/memory` and `@praxis/memory/*` path aliases so the Bundler-resolution electron tsconfig can resolve the package without `dist/`.
- **Remark plugin**: `packages/ui/src/lib/markdown-plugins/remark-definitions.ts` — `visitParents` on `"text"` nodes; collects `[[def:term]]` matches; splices in `definition-term` MDAST nodes; collect-then-splice pattern (mirrors `remark-admonitions.ts`). Note: `code`/`inlineCode` in MDAST are Literals, not Parents, so text inside them is never visited — no ancestor guard needed.
- **Component**: `packages/ui/src/components/markdown/definition.tsx` — `<dfn title={term} className={isFirst ? styles.definition : undefined}>`. Pure presentational.
- **Hook**: `packages/ui/src/hooks/use-first-occurrence.ts` — `useRef` for map (no re-render on populate); single `useEffect` that clears map, populates via `hasSeenTerm`, then records via `markTermSeen` in sequence. `terms` array is a direct dep (no hash intermediary) — biome exhaustive-deps compliant.
- **Tests**: 6 memory tests, 13 remark plugin tests, 6 component tests, 8 hook tests — all pass.

## References
- Parent feature: `.work/active/features/feature-content-renderer-pipeline.md` § Unit 5
- Patterns: `.claude/skills/patterns/temp-db-test-helper.md`, `.claude/skills/patterns/builder-module-composition.md`
- Files: `packages/memory/src/schema.ts`, `packages/ui/src/lib/rehype-citation-chips.ts` (template)

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none / **Important**: none / **Nits**: none

**Notes**: Cross-package work landed cleanly. Memory layer: schema + Drizzle migration `0027_faulty_random.sql` + `TermFirstOccurrencesService` (PK lookup + `onConflictDoNothing` insert) + `normalizeTerm` helper. Service exported, wired into `ServiceDeps` via `build-memory-services.ts`. `tsconfig.electron.json` path alias for `@praxis/memory` added (Bundler-resolution requirement). Created `packages/memory/vitest.config.ts` so root workspace discovers the package. Renderer: `remarkDefinitions` plugin (MDAST `code`/`inlineCode` are Literals → no ancestor guard needed; correct insight); `<Definition>` component with `<dfn title=...>`; `useFirstOccurrence` hook uses `useRef` for map (no re-render on populate) + single effect for hasSeenTerm/markTermSeen sequence. 33 tests across all 4 surfaces. Heaviest story this wave; well-executed.
