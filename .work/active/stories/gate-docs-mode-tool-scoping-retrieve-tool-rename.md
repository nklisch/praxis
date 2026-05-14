---
id: gate-docs-mode-tool-scoping-retrieve-tool-rename
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: docs
created: 2026-05-14
updated: 2026-05-14
---

# `mode-tool-scoping` pattern still uses the old `retrieve_from_textbook` tool name in three places

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/mode-tool-scoping.md:17,42,57,63`
- Code: `packages/tools/src/retrieval/retrieve-from-documents.ts:65`, `packages/curriculum/src/modes/teach.ts:37`, `packages/curriculum/src/modes/exam.ts:42`

## Current doc text
- Line 17: `"grade_math", "code_sandbox", "retrieve_from_textbook",`
- Line 42: `const toolDefinitions = [gradeMathTool, codeSandboxTool, retrieveFromTextbookTool, ...]`
- Line 57: `// No retrieve_from_textbook, no mastery / misconception tools, no graders`
- Line 63: `Even if the agent's prompt were compromised, retrieve_from_textbook and mastery tools simply aren't in the registry`

## Reality
The retrieval tool is named `retrieve_from_documents`
(`packages/tools/src/retrieval/retrieve-from-documents.ts:65`), its
export is `retrieveFromDocumentsTool`, and that's the name listed in
every mode's `toolNames` and the exam-mode comment.

## Required edit
Replace `retrieve_from_textbook` → `retrieve_from_documents` and
`retrieveFromTextbookTool` → `retrieveFromDocumentsTool` in all four
positions.
