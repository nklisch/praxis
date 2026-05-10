---
id: feature-phase-5-textbook-rag
kind: feature
stage: done
tags: [content]
parent: null
depends_on: [feature-phase-4-verification-tools]
release_binding: v0
gate_origin: null
created: 2026-05-09
updated: 2026-05-09
---

# Phase 5 — Document RAG (multi-format ingestion + vision)

Retro-released into v0 on 2026-05-09. Original design: `docs/designs/phase-5-textbook-rag.md`.

**Goal that shipped:** Upload any common study document — PDF, EPUB, DOCX, HTML, Markdown, plain text — ask about its contents, get cited answers. Math-heavy or scanned PDFs use the configured engine's native vision.

**Notes:** Multi-format ingestion pipeline + sqlite-vec embeddings + cited document tools (`document.outline`, `document.read_pages`, `document.list_sections`).
