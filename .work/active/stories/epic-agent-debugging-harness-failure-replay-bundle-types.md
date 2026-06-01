---
id: epic-agent-debugging-harness-failure-replay-bundle-types
kind: story
stage: implementing
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

- [ ] Bundle manifest and artifact types compile from `@praxis/core/types`.
- [ ] Writer rejects absolute artifact paths and `..` traversal.
- [ ] Writer writes artifacts first and `manifest.json` last.
- [ ] Browser trace, screenshot, and DOM excerpt artifact kinds exist without
      adding Playwright.
- [ ] Tests cover minimal manifest round-trip and invalid path rejection.
