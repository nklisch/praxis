---
id: gate-cruft-docx-ingestor-prior-pipeline-comment
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

# Stale "prior `convertToHtml` + regex-stripping pipeline" reference in DOCX ingestor doc

## Confidence
Medium

## Category
stale comment

## Location
`packages/tools/src/runtime/ingestion/docx-ingestor.ts:18-26`

## Evidence
```ts
/**
 * DocxIngestor — handles `.docx` files via `mammoth`.
 *
 * Uses `mammoth.convertToMarkdown()` directly, replacing the prior
 * `convertToHtml` + regex-stripping pipeline. When `opts.embeddedImageStore`
 * is provided, embedded images are extracted via mammoth's `convertImage`
 * option and saved to the store under a synthetic documentId, mirroring the
 * `PptxIngestor` embedded-image contract.
 */
```
`feature-docx-ingestor-cleanup` was the cleanup feature in this release. After cleanup, describing what the code "used to" do is residue.

## Removal
Rewrite to describe the current pipeline only: "Uses `mammoth.convertToMarkdown()` to produce markdown chunks. When `opts.embeddedImageStore` is provided, embedded images are extracted via mammoth's `convertImage` option and saved to the store, mirroring the `PptxIngestor` embedded-image contract."
