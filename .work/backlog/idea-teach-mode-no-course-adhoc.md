---
id: idea-teach-mode-no-course-adhoc
created: 2026-05-24
tags: [bug]
---

Opening a teach-mode session without a course attached throws an internal error instead of starting. Ad-hoc learning — a student wanting to ask the tutor about something on the fly with no enrolled course context — is a first-class use case and should work without requiring a course first. Trace where the session-open path assumes a non-null courseId, make courseId optional through the teach session lifecycle (mode resolution, system prompt composition, memory scoping, tool filtering), and surface a sensible "no course" state in the workspace UI.
