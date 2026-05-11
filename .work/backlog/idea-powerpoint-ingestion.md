---
id: idea-powerpoint-ingestion
created: 2026-05-11
tags: []
---

Add PowerPoint (.pptx / .ppt) support to the document ingestion pipeline alongside the existing PDF / DOCX / EPUB / HTML / Markdown / plain-text ingestors. Ideally extract both slide text and embedded images so visual content (diagrams, figures, equation screenshots) survives into the textbook RAG pipeline rather than being dropped — slides are commonly image-heavy, so a text-only parse would lose most of the pedagogical signal. Worth evaluating whether a dedicated pptx parser plus image extraction is cheaper than rendering slides to images and routing through the existing vision pipeline.
