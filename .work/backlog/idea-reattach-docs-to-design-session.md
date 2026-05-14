---
id: idea-reattach-docs-to-design-session
created: 2026-05-14
tags: [bootstrap, ux]
---

Once a course-design (bootstrap explorer) session is in flight, there appears to be no way to attach additional already-ingested documents to it — the document set is fixed at session start. If the user remembers a relevant document mid-design, or ingests a new one while the explorer is running, they have no path to bring it into the active session's scope. The natural shape is a "+ add documents" affordance on the bootstrap surface that opens the same document picker used at session start, scoped to docs already in the library, and re-runs the explorer's document grounding against the expanded set on the next turn (or surfaces it as additional context immediately). Worth confirming the gap is real (the design session's `course_documents` join is presumably write-once today) and scoping a fix that handles both the data-side reattach and the UX entry point.
