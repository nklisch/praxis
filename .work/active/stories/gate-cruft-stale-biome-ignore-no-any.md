---
id: gate-cruft-stale-biome-ignore-no-any
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

# `biome-ignore noExplicitAny` suppressions where no `any` is used (cast goes through `unknown`)

## Confidence
High

## Category
stale comment

## Location
- `packages/tools/src/registry.ts:76`
- `packages/tools/src/runtime/ingestion/docx-ingestor.ts:45`

## Evidence
```ts
// tools/src/registry.ts:76-77
// biome-ignore lint/suspicious/noExplicitAny: deliberate post-construction context mutation; typed via generic
(this.context as unknown as Record<string, unknown>)[key as string] = value as unknown;
// No `any` on line 77 — the cast goes through `unknown`.

// tools/src/runtime/ingestion/docx-ingestor.ts:45-46
// biome-ignore lint/suspicious/noExplicitAny: mammoth@1.12.0 .d.ts lacks convertToMarkdown; cast through unknown to extend
const mammoth = (await import("mammoth")) as unknown as MammothWithMarkdown;
// No `any` — cast goes through `unknown`.
```

## Removal
Delete both stale `biome-ignore` lines. The casts already use `unknown` (which Biome accepts) so no suppression is needed.
