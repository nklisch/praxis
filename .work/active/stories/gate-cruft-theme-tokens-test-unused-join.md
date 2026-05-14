---
id: gate-cruft-theme-tokens-test-unused-join
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

# Unused `join` import in theme-tokens test

## Confidence
High

## Category
unused import (tool-detected — biome `lint/correctness/noUnusedImports`)

## Location
`packages/ui/src/__tests__/theme-tokens.test.tsx:13`

## Evidence
```typescript
import { dirname, join, resolve } from "node:path";
```

Only `dirname` (line 51) and `resolve` (line 52) are used; `join` is
never referenced.

## Removal
Change line 13 to `import { dirname, resolve } from "node:path";`.
