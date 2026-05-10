---
id: idea-persist-partial-courses
created: 2026-05-10
tags: []
---

Partially-built courses (mid-bootstrap drafts) live in memory only today and
are lost if the session is interrupted, the app restarts, or the explorer
agent times out. Persist them to disk during construction so a student can
resume a half-drafted course rather than re-running the exploration pass.
Likely overlaps with `feature-bootstrap-drafts-streaming`'s draft model —
extending that store from in-memory to durable would be the natural shape.
