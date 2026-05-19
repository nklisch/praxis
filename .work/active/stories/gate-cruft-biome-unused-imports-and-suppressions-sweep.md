---
id: gate-cruft-biome-unused-imports-and-suppressions-sweep
kind: story
stage: review
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: cruft
created: 2026-05-18
updated: 2026-05-18
---

# Sweep biome-flagged unused imports, suppressions, and variables across the v0.1.3 bundle

## Confidence
High

## Category
unused import / unused variable / dead suppression

## Location
Many files across `packages/core`, `packages/ui`, `packages/client`,
`packages/desktop`, `packages/tools`. See evidence.

## Evidence

**Unused imports (biome `noUnusedImports`):**
- `packages/desktop/electron/main/concept-maps-channel.ts:10` — `brandId`
- `packages/core/src/db/index.ts:8` — `initArtifactsFtsStore` (only re-exported, never called inline)
- `packages/core/src/services/library-service.ts:20` — `SessionId`
- `packages/client/src/__tests__/config-client.test.ts:12`
- `packages/core/src/services/__tests__/concept-map-service.test.ts:4`
- `packages/core/src/services/__tests__/concept-map-snapshotter.test.ts:19`
- `packages/core/src/services/__tests__/library-service.test.ts:23`
- `packages/core/src/services/__tests__/snapshot-restore.test.ts:28`
- `packages/ui/src/__tests__/chat-tab-body-dispatch.test.tsx:11`
- `packages/ui/src/components/__tests__/chat-tab-body-scroll-restore.test.tsx:13`
- `packages/ui/src/components/__tests__/ripples-panel.test.tsx:11`

**Unused suppressions (biome `suppressions/unused`):**
- `packages/core/src/services/library-service.ts:130, 209` — `// biome-ignore lint/suspicious/noExplicitAny` above the wrong line (target moved during refactor)
- `packages/ui/src/components/chat-tab-body.tsx:223` — useExhaustiveDependencies ignore where the rule no longer fires
- `packages/ui/src/components/note-editor-cornell.tsx:187`
- `packages/client/src/__tests__/config-client.test.ts:50, 73`
- `packages/desktop/electron/main/__tests__/library-channel-envelope.test.ts:62`
- `packages/desktop/electron/main/__tests__/subagent-channel.test.ts:205`
- `packages/tools/src/course/__tests__/list-drafts.test.ts:92` (mis-targeted at proposedUnits: line; actual `as any` is at 96 with its own suppression)

**Unused variables / interfaces (biome `noUnusedVariables`):**
- `packages/core/src/__tests__/course-create-service.queries.test.ts:516` — `lessonId`
- `packages/core/src/__tests__/notes-service.test.ts:158` — `note2`
- `packages/core/src/services/__tests__/concept-map-service.test.ts:42` — `SCENE_EMPTY`
- `packages/core/src/services/__tests__/snapshot-restore.test.ts:653` — `studentId`
- `packages/ui/src/components/__tests__/chat-tab-body-scroll-restore.test.tsx:119` — `stored`
- `packages/ui/src/components/__tests__/lesson-assessment-pills.test.tsx:111` — `pills`
- `packages/ui/src/components/concept-link-overlay.tsx:57` — unused interface `ShapeBoundsScreen`

## Removal
Run `pnpm biome check --write packages/` and inspect the diff. For
suppressions that biome can't auto-remove (the misplaced ones), move the
suppression line above the actual offending statement or delete if the
rule no longer fires there.

For `library-service.ts:130/209`, verify whether the `prepare<any[], any>`
still triggers the rule; if yes, move the suppression directly above that
line. If no, drop both suppressions.

For `note-editor-cornell.tsx`, `chat-tab-body.tsx`, etc., delete the
suppression line. For the test-file `as any` mis-targeted cases, either
delete or relocate as appropriate.

Verify `pnpm typecheck && pnpm lint` clean afterwards.

## Implementation notes (2026-05-18)

### Auto-fix pass
`pnpm biome check --write --unsafe packages/` handled ~13 files automatically:
- Removed 11 unused imports across test files and production code (including `EventEmitter`, `SessionId`, `initArtifactsFtsStore` intermediate import, `brandId` in concept-maps-channel, etc.)
- Prefixed 6 unused variables with `_` in test files (`_note2`, `_SCENE_EMPTY`, `_stored`, `_pills`, `_lessonId`, etc.) — these are intentional side-effect calls or debug-reads not needed in assertions; `_` prefix is correct convention
- Reorganized import order (alphabetical) and reformatted some long lines as a side-effect

### Manual suppression fixes
Seven suppressions were mis-targeted: the `biome-ignore` comment was above an expression that starts the violating multi-line construct, but `as any` appeared several lines below. Biome suppression comments only cover the immediately following line. Each was fixed by restructuring:

- **`library-service.ts:129,208`** — suppression was above `let hits = sqlite.prepare...`; restructured to `const stmt = sqlite.prepare<any[], any>(sqlStr)` (suppression covers that line directly), then `stmt.all(...)` on the next line.
- **`config-client.test.ts:50,73`** — suppression was above `client.setEngineConfig({...` but `as any` was on the closing `} as any)`; extracted to `const malformedPayloadN = {...} as any` with suppression directly above.
- **`library-channel-envelope.test.ts:62`** — suppression was above `return {` but `as any` was at the end of a ~170-line object literal; moved suppression to directly before `} as any`.
- **`subagent-channel.test.ts:205`** — suppression above `setTimeout: vi.fn(...)` but `as any` was on the multiline close; collapsed to single expression with suppression on preceding line.
- **`list-drafts.test.ts:92`** — suppression covered `proposedUnits: Array.from(...)` but `as any` was at `})) as any` several lines down; removed misplaced comment, added new suppression inside the array callback directly before `})) as any`.
- **`chat-tab-body.tsx:223`** — `useExhaustiveDependencies` no longer fires after prior refactors; suppression deleted.
- **`note-editor-cornell.tsx:187`** — `noArrayIndexKey` fires on `key={i}` (JSX attribute), not on `<div` (opening tag); moved suppression inline as `<div // biome-ignore...` so it covers the `key={i}` attribute on the next line.

### Verification
- `pnpm biome check packages/` — zero `noUnusedImports`, `noUnusedVariables`, `suppressions/unused` findings
- `pnpm typecheck` — pre-existing `session-service.ts:42` IndexerOrchestrator mismatch in `@praxis/desktop` only (out of scope, predates this bundle)
- `pnpm test` — 4525 passed, 23 skipped (slow Pyodide tests behind `PRAXIS_RUN_SLOW_TESTS`)

### Implementation discovery
- `_stored` in `chat-tab-body-scroll-restore.test.tsx:119` — `localStorage.getItem(storedKey)` result is fetched but not asserted. The comment acknowledges the value may be null/0 and the test only checks no crash occurred. This is a known incomplete assertion; parked as a potential backlog idea (add assertion that scroll position key is written after scroll event).
- `ShapeBoundsScreen` in `concept-link-overlay.tsx` — already removed by prior wave (`gate-cruft-concept-link-overlay-legacy-markers-decision`); confirmed absent.

### Commit
`f6cfc92` — implement: gate-cruft-biome-unused-imports-and-suppressions-sweep (35 files, 88+/107-)
