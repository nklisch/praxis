---
id: idea-authoring-summary-object-crash
created: 2026-05-31
tags: []
---

The authoring chat renderer assumes a settled tool output's `summary` field is a string, but `course.start_drafting` returns a structured `summary` object with keys like `draftId`, `title`, `lessonCount`, `conceptCount`, `edgeCount`, `firstLessons`, `unitCount`, and `assessmentCount`. Passing that object into `ToolCallEntry` as JSX text triggers React's "Objects are not valid as a React child" crash, so authoring tool summaries need runtime string coercion or tool-specific summarization before rendering.
