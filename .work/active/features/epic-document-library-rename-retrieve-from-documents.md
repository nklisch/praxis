---
id: epic-document-library-rename-retrieve-from-documents
kind: feature
stage: drafting
tags: [tools, prompts, curriculum]
parent: epic-document-library
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Rename `retrieve_from_textbook` → `retrieve_from_documents`

## Brief

The retrieval tool is named `retrieve_from_textbook`
(`packages/tools/src/retrieval/retrieve-from-textbook.ts`), but most
ingested materials aren't textbooks — they're lecture notes, slide decks,
papers, syllabi, arbitrary PDFs. The current name biases the model
(and the human reading the trace) toward textbook-shaped assumptions in
tool selection and citation patterns, and it leaks the same bias into
prompt fragments and UI copy.

This feature renames the tool to `retrieve_from_documents` everywhere it
appears: the tool file/symbol, the Zod schema name, every mode's
`toolNames` array that registers it, every prompt fragment that names it
by string, every test, every COPY reference. Citation/results behavior is
unchanged — only the surface name.

This feature is **independent** of the scoping primitive and the picker
work — it can land first in wave 1 without blocking or being blocked.

## Epic context

- Parent epic: `epic-document-library`
- Position in epic: independent rename; wave 1 alongside
  `document-scopes-primitive` and `multi-file-folder-picker`.

## Foundation references

- `docs/ARCHITECTURE.md` (rolled-forward "Document scoping" section
  references `retrieve_from_documents` as the new tool name — this feature
  makes that assertion true)

## Anchors

- Tool source — `packages/tools/src/retrieval/retrieve-from-textbook.ts`
  (rename file + symbol + Zod schema)
- Mode registrations (toolNames arrays):
  - `packages/curriculum/src/modes/bootstrap.ts:55`
  - `packages/curriculum/src/modes/teach.ts:34`
  - `packages/curriculum/src/modes/configure.ts:55`
  - `packages/curriculum/src/modes/quiz.ts:38`
- Mode exclusions (verify still in sync after rename):
  - `packages/curriculum/src/modes/exam.ts:39`
  - `packages/curriculum/src/modes/__tests__/study-skills.test.ts:140-142`
- Prompt fragments naming the tool:
  - `packages/curriculum/src/modes/fragments/bootstrap-tools.ts:18`
  - `packages/curriculum/src/modes/fragments/assessment-tools.ts:12`
  - `packages/curriculum/src/modes/fragments/tools.ts:16,24`
- Tests using the tool name — sweep `packages/**/__tests__/`

## Design notes for feature-design

- Tool name is part of the engine adapter's MCP tool registration — no
  backward-compat needed since model-side tool names aren't persisted.
- Update tool docs/descriptions to use "documents" language consistently
  (drop "textbook" framing in the description string too).
- Consider whether the citation pattern documentation (e.g., `tools.ts:24`
  citation reference) needs language updates.
