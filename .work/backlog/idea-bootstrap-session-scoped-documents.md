---
id: idea-bootstrap-session-scoped-documents
created: 2026-05-13
tags: []
---

Scope the documents attached during course bootstrap to that specific bootstrap session rather than to the course (or globally). Today the bootstrap explorer reads from `course_documents` which links docs to a course; if a user starts a bootstrap, attaches docs, then later re-bootstraps or runs a different bootstrap session, the doc set leaks across sessions. A bootstrap-session-scoped attachment would let each exploration run own its own document set cleanly — useful for "try this textbook vs. that textbook" comparisons and for keeping ingestion side-effects scoped to the session that produced them.
