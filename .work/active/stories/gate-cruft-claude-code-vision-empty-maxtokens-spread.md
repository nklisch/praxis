---
id: gate-cruft-claude-code-vision-empty-maxtokens-spread
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

# Empty conditional-spread of comment-only object in `ClaudeCodeVision.describe`

## Confidence
High

## Category
dead code (over-abstraction)

## Location
`packages/engines/src/claude-code/vision.ts:51-54`

## Evidence
```typescript
...(req.maxTokens !== undefined &&
  {
    // Claude Code CLI doesn't have a direct maxTokens option, but we pass it for future compat
  }),
```

The conditional spreads an object that contains nothing but a comment —
it has no effect at runtime regardless of `req.maxTokens`. The
"future compat" is just a stub; nothing is being passed.

## Removal
Delete the entire spread (lines 51-54). If the intent is documentation,
keep a single one-line comment outside the call options object
explaining that the CLI doesn't expose `maxTokens`. No surrounding
imports affected.

## Implementation
Deleted the four-line conditional spread (lines 51-54) from the `query()` options object in `ClaudeCodeVision.describe`. The spread evaluated to `false || {}` at runtime — a no-op regardless of `req.maxTokens`. No replacement comment added; the absence of a maxTokens option in the call is self-evident.
