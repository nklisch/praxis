---
id: epic-agent-debugging-harness-failure-replay-bundle-types
kind: story
stage: done
tags: []
parent: epic-agent-debugging-harness-failure-replay
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Bundle model and writer

## Scope

Promote the local debug bundle vocabulary into production shared types and add a
filesystem writer for local bundle directories.

## Files

- `packages/core/src/types/debug-bundle.ts`
- `packages/core/src/types/index.ts`
- `packages/core/src/services/debug/debug-bundle-writer.ts`
- `packages/core/src/services/debug/index.ts`
- `packages/core/src/services/debug/__tests__/debug-bundle-writer.test.ts`

## Acceptance criteria

- [x] Bundle manifest and artifact types compile from `@praxis/core/types`.
- [x] Writer rejects absolute artifact paths and `..` traversal.
- [x] Writer writes artifacts first and `manifest.json` last.
- [x] Browser trace, screenshot, and DOM excerpt artifact kinds exist without
      adding Playwright.
- [x] Tests cover minimal manifest round-trip and invalid path rejection.

## Implementation Notes

- Added shared debug bundle manifest, artifact, capture event, artifact content,
  and writer types exported through `@praxis/core/types`.
- Added `FsDebugBundleWriter`, which writes bundle artifacts under a local output
  directory and writes `manifest.json` last.
- Bundle-relative paths are normalized to `/`, reject empty paths, absolute POSIX
  paths, Windows drive paths, `.` segments, `..` traversal, duplicate artifact
  destinations, and the reserved root `manifest.json` path.
- Manifest paths are validated before artifacts are written, preventing partial
  bundles when a manifest references an unsafe artifact path.
- Browser trace, screenshot, and DOM excerpt artifact kinds are represented as
  bundle metadata only; no Playwright dependency was added in this story.

## Verification

- `pnpm vitest run packages/core/src/services/debug/__tests__/debug-bundle-writer.test.ts packages/core/src/services/debug/__tests__/debug-trace-registry.test.ts`
- `pnpm --filter @praxis/core typecheck`
- `pnpm exec biome check packages/core/src/types/debug-bundle.ts packages/core/src/types/index.ts packages/core/src/services/debug/debug-bundle-writer.ts packages/core/src/services/debug/index.ts packages/core/src/services/debug/__tests__/debug-bundle-writer.test.ts`
- `git diff --check`

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Fast-lane story review. Implementation notes include green focused
tests, core typecheck, focused Biome, and whitespace checks; item advanced to
`stage: done`.
