---
id: gate-docs-claudemd-tab-body-enumeration
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# CLAUDE.md "Per-mode tab bodies" enumeration omits `StudySkillsTabBody`

## Drift category
foundation-doc-assertion (CLAUDE.md is project conventions; the AI-agent
inventory must list the new tab body shipped in this bundle)

## Location
- Doc: `CLAUDE.md:112`
- Code: `packages/ui/src/components/study-skills-tab-body.tsx`,
  `packages/ui/src/components/chat-tab-body.tsx` (dispatch by
  `session.modeId`)

## Current doc text
> - **Per-mode tab bodies**: `QuizTabBody`, `HomeworkTabBody`,
>   `ExamTabBody`, `BootstrapTabBody` in `packages/ui/src/components/`
>   — dispatched by `session.modeId` inside the chat workspace.

## Reality
A 5th per-mode tab body, `StudySkillsTabBody`, was added by the
Phase 18 routing-integration work.

## Required edit
Append `StudySkillsTabBody` to the enumeration: `QuizTabBody`,
`HomeworkTabBody`, `ExamTabBody`, `BootstrapTabBody`,
`StudySkillsTabBody`.
