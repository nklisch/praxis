---
id: gate-cruft-skipped-claude-code-conformance-test
kind: story
stage: implementing
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: cruft
created: 2026-05-12
updated: 2026-05-12
---

# Skipped Claude Code adapter test in cross-engine conformance suite duplicates passing coverage elsewhere

## Confidence
High

## Category
dead function

## Location
`tests/engine-conformance.test.ts:169-236`

## Evidence
```ts
// SKIP: vitest's mock factory at the root tests/ project level doesn't
// intercept `@praxis/claude-cli-sdk` imports made by `@praxis/engines`'s
// compiled dist code — the real `authStatus` runs and either hangs in a
// sandbox or leaks the developer's actual auth state. The same coverage
// (Claude Code adapter open + send + map events) lives in
// `packages/engines/src/__tests__/claude-code.test.ts`, which uses the
// `importOriginal` mock pattern at the engines-project level and passes.
it.skip("Claude Code adapter produces normalized turn", async () => {
  // ... ~65 lines of dead test body ...
});
```

## Removal
Delete the entire `it.skip(...)` block (lines 169-236). The comment confirms equivalent coverage is in `packages/engines/src/__tests__/claude-code.test.ts`. Leaving an `it.skip` with a full body is exactly the AI-accumulated dead code this gate looks for.
