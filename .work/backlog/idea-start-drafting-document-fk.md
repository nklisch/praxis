---
id: idea-start-drafting-document-fk
created: 2026-05-31
tags: []
---

`course.start_drafting` can abort before the drafter sub-agent starts when `DocumentScopesServiceImpl.attachMany` inserts session-scope rows for document IDs that are not present in `documents`, surfacing a raw `SQLITE_CONSTRAINT_FOREIGNKEY` from `document_scopes.document_id`. This matters because stale or malformed IDs from the model/tool loop should become a recoverable, student-safe validation path instead of killing course creation before any drafting progress begins.
