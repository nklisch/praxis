---
id: feature-powerpoint-ingestion
kind: feature
stage: drafting
tags: [ingestion]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
---

# PowerPoint ingestion support

## Brief

Add PowerPoint (`.pptx`, and possibly `.ppt`) to the document ingestion pipeline alongside the existing PDF / DOCX / EPUB / HTML / Markdown / plain-text ingestors. The pipeline is registry-dispatched (`packages/tools/src/runtime/ingestion/registry.ts`) on MIME type / extension, so the shape of the work is a new `pptx-ingestor.ts` registered in that registry, plus whatever upstream MIME/extension acceptance lists need to learn the new types.

Slides are typically image-heavy — diagrams, figures, equation screenshots, hand-drawn artifacts — so a text-only parse would drop most of the pedagogical signal that students and the textbook RAG pipeline care about. The feature should extract both slide text and embedded images so visual content survives ingestion. Two design paths are worth weighing in the drafting pass: (a) a dedicated `.pptx` parser (e.g. `officeparser`, `node-pptx-parser`, or direct OOXML unzip + XML walk) that yields text plus referenced media blobs; vs. (b) rendering slides to images and routing through the existing `VisionPdfIngestor`-style vision pipeline. (a) is cheaper and offline; (b) reuses an existing path and handles arbitrary slide layouts uniformly. A hybrid is plausible: text via parser, images via embedded-media extraction, with vision as a fallback for slides where parsed text density is suspiciously low.

`.ppt` (legacy binary format) is a separate question — most modern decks are `.pptx`, and parsing the binary format requires different tooling (e.g. LibreOffice headless conversion). The design pass should decide whether to scope `.ppt` in or defer it.

<!-- Design and Implementation Notes accumulate here as work progresses. -->
