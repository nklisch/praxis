---
id: gate-cruft-stream-prefer-number-isfinite
kind: story
stage: drafting
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: cruft
created: 2026-05-14
updated: 2026-05-14
---

# Global `isFinite` instead of type-safe `Number.isFinite` in stream timeout check

## Confidence
Medium

## Category
biome-ignore-suppression candidate (the underlying smell can be fixed)

## Location
`packages/claude-cli-sdk/src/cli/stream.ts:43`

## Evidence
```typescript
if (timeout > 0 && isFinite(timeout)) {
  timeoutId = setTimeout(() => { ... }, timeout);
}
```

Biome flags this as `lint/suspicious/noGlobalIsFinite` — the global
form attempts a type coercion and would accept things like `"5000"`.
`timeout` is typed `number` so coercion is unreachable, but the safer
`Number.isFinite` is the project's convention and avoids the lint
warning without a suppression comment.

Introduced by `story-fix-disable-sdk-wall-clock-timeout` in this
release.

## Removal
Change `isFinite(timeout)` to `Number.isFinite(timeout)`. No other
changes.
