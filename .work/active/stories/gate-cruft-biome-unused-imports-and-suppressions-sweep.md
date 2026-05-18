---
id: gate-cruft-biome-unused-imports-and-suppressions-sweep
kind: story
stage: implementing
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
