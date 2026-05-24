---
id: gate-docs-pattern-session-tab-open-flow-library-handleopenintab
kind: story
stage: drafting
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: docs
created: 2026-05-23
updated: 2026-05-23
---

# Pattern skill `session-tab-open-flow` cites stale `library.tsx:48-55` / `:67-74` for `handleOpenInTab`

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/session-tab-open-flow.md:62-76`
- Code: `packages/ui/src/routes/library.tsx:121-141`

## Current doc text
> **File**: `packages/ui/src/routes/library.tsx:48-55` (second call site at `:67-74`)
> ```tsx
> const handleOpenInTab = async (c: CourseSummary) => {
>   await openSessionInTab({ client, navigate, startOpts: { modeId: "teach", courseId: c.courseId as CourseId }, courseTitle: c.title, openTab });
> };
> ```

## Reality
`library.tsx` no longer defines `handleOpenInTab`. The Workbench
rebuild routes session opens through `handleRecAction`
(`library.tsx:89`) which uses `openTab({ sessionId })` directly for
`resume_session` and `openSessionInTab` for `resume_draft`/`quick_check`
(`library.tsx:121-141`).

## Required edit
Replace the `library.tsx` example with the current call shape — either
the `resume_draft` case at `library.tsx:123-128`
(`openSessionInTab({ client, navigate, openTab, startOpts: { modeId: "course-create" } })`)
or pick a different consumer that still matches the canonical
"click → start → openTab → navigate" chain.
