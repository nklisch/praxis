---
id: gate-cruft-query-unused-cleanupfn
kind: story
stage: implementing
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: cruft
created: 2026-05-14
updated: 2026-05-14
---

# Unused local variable `cleanupFn` in claude-cli-sdk `query()`

## Confidence
High

## Category
unused variable (tool-detected — biome `lint/correctness/noUnusedVariables`)

## Location
`packages/claude-cli-sdk/src/query.ts:63`

## Evidence
```typescript
let cleanupFn: (() => Promise<void>) | undefined;

async function* generate(): AsyncGenerator<StreamEvent, ResultEvent, unknown> {
  const { args, tempFiles } = await buildCliArgs(prompt, options);
  ...
  const { proc, cleanup } = spawnCli(...);
  cleanupFn = cleanup;
  ...
  try { ... } finally {
    ...
    await cleanup();   // uses the locally-captured `cleanup`, never `cleanupFn`
  }
}
```

## Removal
Delete the `let cleanupFn: ... | undefined;` declaration on line 63 and
the `cleanupFn = cleanup;` assignment on line 75. The `finally` block
already calls `cleanup()` from the inner scope. No other changes needed.
