---
id: idea-rename-query-textbook-to-query-documents
created: 2026-05-13
tags: []
---

Rename the `query_textbook` tool (and any associated skill/prompt/UI labels) to `query_documents`. Sources attached to a course aren't always textbooks — they can be lecture notes, papers, slide decks, syllabi, or arbitrary PDFs/PPTX/DOCX — and the current name biases the tutor (and the human reading the trace) toward textbook-shaped assumptions. A generic `query_documents` name better reflects the actual ingestion surface and removes the "is this a textbook?" framing from the model's tool selection.
