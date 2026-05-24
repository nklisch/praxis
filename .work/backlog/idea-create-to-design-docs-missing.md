---
id: idea-create-to-design-docs-missing
created: 2026-05-24
tags: [bug, ui]
---

When the user transitions from course-create into course-design, the documents they uploaded in the first section of the create flow don't appear in the session documents panel on the design side. Likely a document-scope linkage gap — docs are attached as session-scoped to the course-create session but aren't being surfaced in (or promoted to) whatever scope the design session reads. Trace `DocumentScopesService.attach` / `getPassageRange` / `promoteToCourseScope` on the create-to-design boundary and confirm where the docs land vs. where the design session queries.
