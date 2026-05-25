---
id: story-fix-create-to-design-docs-missing
kind: story
stage: review
tags: [bug, ui]
parent: feature-course-create-improvements
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-25
---

# Fix: documents uploaded during course-create don't appear in course-design's session documents

## Symptom
When the user transitions from course-create into course-design, the documents they uploaded in the first section of the create flow don't appear in the session documents panel on the design side. The docs are still in the library (ingestion completed), they just aren't surfaced in the design session.

## Likely root cause
Document-scope linkage gap on the create-to-design boundary. Per `CLAUDE.md`: "Course-create sessions attach documents as session-scoped; confirming a draft promotes them to course-scope." Possibilities:
1. The promote-to-course-scope step isn't firing on draft confirm.
2. It IS firing, but the design session reads from session-scope (its own session id) and never queries course-scope, so it doesn't see the promoted docs.
3. The design session is a fresh session_id with no `parent_session_id` link back to the create session, so session-scoped docs aren't visible.

## Diagnosis approach
Trace `DocumentScopesServiceImpl` (`packages/core/src/services/document-scopes-service.ts` or similar — actual path per CLAUDE.md hint) on the create-to-design boundary:
- `attach({ scopeKind, scopeId, ... })` — what scope_kind / scope_id do create-side uploads land under?
- The course-create confirm path — does it call a promote-to-course-scope helper, and does that helper actually update existing rows?
- The design session's documents-panel data source — what scope query does it run, and is the courseId included?

## Entry point
`/agile-workflow:fix` — verified bug, reproducible (every course-create → course-design transition), root cause is one of a small set of code-path possibilities.

## Source idea
`idea-create-to-design-docs-missing` (parked 2026-05-24).

## Implementation notes (2026-05-25)

**Root cause confirmed**: Hypothesis 3 was correct. `handleStart` in `packages/ui/src/routes/course-create.tsx` called `openSessionInTab(...)` which starts the session and navigates — but never attached the uploaded document IDs to the new session's scope. When `useDerivedScope` returns `{ kind: "session", id: courseCreateSessionId }` (because the active tab has `modeId === "course-create"`), the sidebar calls `listForScope({ kind: "session", id })` which returns empty because no scope rows exist for that session.

**Fix**: Rewrote `handleStart` to call `client.session.start` directly (not through `openSessionInTab`), capture the `sessionId`, then for each attached source with a ready `documentId`, call `client.documentScopes.attach({ scope: { kind: "session", id: sessionId }, documentId, source: "course-create" })`. These calls are sequential and non-fatal — the session opens even if an attach fails. After attaching, `storeInitialMessage` (a new named export added to `open-session-in-tab.ts`) handles the context-textarea forwarding, then `openTab` + `navigate` complete the flow.

**Files changed**:
- `packages/ui/src/routes/course-create.tsx` — rewrote `handleStart` to attach docs, added `"library"` to `AttachedSourceKind`, added `handleLibrarySelect` handler, wired library props to `SourcePicker`
- `packages/ui/src/lib/open-session-in-tab.ts` — exported `storeInitialMessage` helper

**Regression test**: `packages/ui/src/__tests__/course-create-route-doc-scope-attach.test.tsx` — 3 tests verify: single file attaches, zero files skips attach, multiple files each attach. Tests confirm both `session.start` and `documentScopes.attach` calls in the correct order.
