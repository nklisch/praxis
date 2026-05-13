---
id: bug-chat-documents-sidebar-flicker
created: 2026-05-13
tags: [bug]
---

In the chat window, the documents sidebar flashes between the library view and a loading state. The flicker suggests the sidebar is re-mounting or refetching on each render cycle (or a `loading` boolean flips back to true mid-stream) instead of holding a stable view once the library has loaded. Worth investigating the document list data source for the chat-scoped sidebar and confirming the loading state is only true on initial fetch — not on every dependency change.
