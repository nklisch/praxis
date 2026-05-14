---
id: gate-cruft-theme-tokens-test-unused-join
kind: story
stage: review
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

## Implementation

Confirmed `join` appeared only in the import statement at line 13 and was not referenced anywhere else in the file. Removed `join` from the import. All 7 tests in the file pass. Biome no longer flags the file.
