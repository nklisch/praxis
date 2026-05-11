---
id: idea-docx-ingestor-cleanup-and-images
created: 2026-05-11
tags: [ingestion]
---

Clean up `DocxIngestor` (`packages/tools/src/runtime/ingestion/docx-ingestor.ts`) and add image extraction. The current implementation calls `mammoth.convertToHtml()` and then strips the HTML back down to markdown via a chain of regex `.replace()` calls (`docx-ingestor.ts:53-91`) — clunky and brittle for any HTML mammoth produces that isn't h1-h6 / p / li / br. Two paths worth weighing: (a) switch to `mammoth.convertToMarkdown()` (mammoth has one) and drop the html-to-markdown regex pipeline; (b) keep mammoth but use its `convertImage` option to extract embedded images into the page-image store the same way the PPTX path will (officeparser-based). Both improve the same ingestor — likely do them together. A broader consolidation question lives downstream: once we have PPTX on officeparser, evaluate whether mammoth → officeparser for DOCX is worth it (free image extraction, single library across office formats, unlocks `.rtf` / `.odt` / `.odp`) vs the regression risk on already-ingested DOCX content. That evaluation needs a side-by-side fixture-comparison harness before any swap.
