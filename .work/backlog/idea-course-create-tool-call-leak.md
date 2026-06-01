---
id: idea-course-create-tool-call-leak
created: 2026-05-31
tags: []
---

Course-create chat is exposing raw tool-call text and invocation markup to the student, including model narration like "Calling the tool now" plus `<invoke ...>` blocks and returned tool output. This should be captured for later because course creation needs to keep tool execution behind the agent/tool boundary and present only student-appropriate progress, questions, and draft summaries.
