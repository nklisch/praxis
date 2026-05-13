---
id: idea-list-in-progress-drafts-tool
created: 2026-05-13
tags: []
---

The course creator (bootstrap explorer mode) has no way to enumerate in-progress course drafts — drafts are only addressable by a `draftId` returned from a prior `course.start_exploration` call. If the user starts a new conversation, the only path back to a partially-built draft is pasting the raw id, which the student doesn't have. Add a `course.list_drafts` tool (or similar) that returns active drafts with id, title/metadata, last-modified, and progress signals (unit/lesson counts), so the creator can resume by name. Probably wants a UI surface too (a "Resume draft" picker on the create-course screen), but the tool is the substrate prerequisite.
