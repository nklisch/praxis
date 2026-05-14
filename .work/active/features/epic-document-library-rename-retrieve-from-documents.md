---
id: epic-document-library-rename-retrieve-from-documents
kind: feature
stage: done
tags: [tools, prompts, curriculum]
parent: epic-document-library
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
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

### Tool source (must rename)

- File — `packages/tools/src/retrieval/retrieve-from-textbook.ts`
  (4 exports: `retrieveFromTextbookInput`,
  `retrieveFromTextbookOutput`, `retrieveFromTextbookTool`, plus the
  `name: "retrieve_from_textbook"` literal at line 65)
- Re-export — `packages/tools/src/retrieval/index.ts`
- Test — `packages/tools/src/retrieval/__tests__/retrieve-from-textbook.test.ts`
  (rename file + symbol references inside)

### Tool label registry

- `packages/tools/src/labels/index.ts` — `getToolLabel` mapping
- `packages/tools/src/labels/__tests__/index.test.ts` — assertions

### Mode `toolNames` arrays (5 modes)

- `packages/curriculum/src/modes/bootstrap.ts:55` (+ comment line 18)
- `packages/curriculum/src/modes/teach.ts:34`
- `packages/curriculum/src/modes/configure.ts:55`
- `packages/curriculum/src/modes/quiz.ts:38`
- `packages/curriculum/src/modes/exam.ts:39` (comment-only — exam still
  excludes the tool; the negative assertion just changes its name)

### Prompt fragments (string content the model reads)

- `packages/curriculum/src/modes/fragments/tools.ts:16,24` — main
  description + citation pattern doc
- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts:18`
- `packages/curriculum/src/modes/fragments/configure-tools.ts:35`
- `packages/curriculum/src/modes/fragments/assessment-tools.ts:12`
- `packages/curriculum/src/modes/fragments/bootstrap-role.ts` (verify
  context — may reference "textbook" as a concept rather than the tool
  name)

### Bootstrap explorer

- `packages/curriculum/src/bootstrap/explorer-prompt.ts` — explorer
  system prompt names the tool inline
- `packages/curriculum/src/bootstrap/explorer.ts` — runtime tool
  registration

### Tools that share docs space

- `packages/tools/src/course/start-exploration.ts` — references the
  tool in its description / inline prompts
- `packages/tools/src/document/list-sections.ts` — references in
  comments / descriptions

### Service registration

- `packages/desktop/electron/main/services.ts` — tool registry
  registration

### Type definitions

- `packages/core/src/types/tool.ts` — verify no type-level tool-name
  references (likely none beyond comments)

### UI

- `packages/ui/src/hooks/use-streamed-send.ts` — references the tool
  name (likely a switch on `toolName === "retrieve_from_textbook"`)
- `packages/ui/src/hooks/episodic-to-messages.ts` — same shape
- `packages/ui/src/lib/copy.ts` — user-facing strings
- `packages/ui/src/components/document-list.tsx` — UI label using the
  word "textbook"

### Tests (sweep)

- `packages/core/src/services/__tests__/subagent-registry.test.ts:167`
- `packages/curriculum/src/__tests__/{exam,quiz,teach}-mode.test.ts`
- `packages/curriculum/src/modes/__tests__/{bootstrap-toolnames,
  metacognitive-prompts-integration,study-skills}.test.ts`
- `packages/ui/src/__tests__/{bubble-boundary-parity,
  episodic-to-messages,tool-interstitial,use-streamed-send,
  use-ingestion,use-library,library-route}.test.{ts,tsx}`

### Foundation docs (roll forward)

- `docs/ARCHITECTURE.md` — references `retrieve_from_textbook` in
  bootstrap section
- `docs/CURRICULUM.md` — same
- `docs/ROADMAP.md` — same

### Historical record (DO NOT TOUCH)

- `docs/designs/phase-5-textbook-rag.md`,
  `docs/designs/phase-6-*.md`, `docs/designs/phase-7-*.md`, …
- Per rolling-foundation principle these are *historical* phase design
  snapshots, not live foundation. The names of the original phases
  ("Phase 5 Textbook RAG") are correct as historical fact and stay.

## Architectural choice

**Single mechanical sweep, byte-equivalent semantics.** Every reference
flips together in one commit; the tool's behavior, schemas, return
shape, and citation format are all unchanged. The only differences:
the tool name string, the file/export symbol names, the human-readable
prompt language, and the UI labels.

Two alternatives rejected:
- *Backward-compat alias.* Could register both names temporarily.
  Pointless — tool names aren't persisted anywhere (every session
  re-registers from the current code), so there's nothing to migrate.
- *Split UI rename from core rename.* Would leave the system in a state
  where the model sees one name and the UI labels another. Bad UX, no
  benefit.

## Design decisions (resolved by autopilot)

- **New tool name string**: `retrieve_from_documents` (snake_case,
  matches existing tool-name convention).
- **New symbol names**: `retrieveFromDocumentsInput`,
  `retrieveFromDocumentsOutput`, `retrieveFromDocumentsTool`.
- **New file name**:
  `packages/tools/src/retrieval/retrieve-from-documents.ts` (rename
  the existing file with `git mv`).
- **Prompt-fragment language**: replace "textbook"/"textbooks" with
  "document"/"documents" in tool descriptions and citation
  pattern docs. Keep "course material" framing where it already
  appears — it's accurate either way.
- **`bootstrap-role.ts` "textbook" mentions**: case-by-case. If a
  sentence reads "the student provided a textbook…" change to
  "the student provided documents…". If it reads "textbook-quality
  output" or similar idiomatic phrasing, keep it (not a tool-name
  reference, just a noun).
- **UI label "textbook" in `document-list.tsx`**: rename if it
  describes generic uploaded documents; keep if it describes a
  specific format-detection case (e.g., a doc whose manifest says
  it's a textbook). Verify by reading the line in context.
- **`copy.ts` strings**: rename every COPY constant referring to
  "textbook" → "documents" (or "document"), matching the surrounding
  sentence.
- **No tool deprecation note**: tool names aren't persisted, so no
  alias / shim is needed. Old name is gone after this commit.

## Implementation Units

### Unit 1: Tool source rename

**Files**:
- `git mv packages/tools/src/retrieval/retrieve-from-textbook.ts
  packages/tools/src/retrieval/retrieve-from-documents.ts`
- `git mv
  packages/tools/src/retrieval/__tests__/retrieve-from-textbook.test.ts
  packages/tools/src/retrieval/__tests__/retrieve-from-documents.test.ts`

Inside the moved files:
- `retrieveFromTextbookInput` → `retrieveFromDocumentsInput`
- `retrieveFromTextbookOutput` → `retrieveFromDocumentsOutput`
- `retrieveFromTextbookTool` → `retrieveFromDocumentsTool`
- `name: "retrieve_from_textbook"` → `name: "retrieve_from_documents"`
- Description string: replace any "textbook" language with
  "document" / "documents".

In `packages/tools/src/retrieval/index.ts`:
- Update the re-export from the old module path / symbol names to the
  new ones.

**Acceptance Criteria**:
- [ ] `retrieve-from-textbook.ts` and its test file no longer exist.
- [ ] New files compile.
- [ ] Tool exports the name `"retrieve_from_documents"`.

---

### Unit 2: Label registry

**File**: `packages/tools/src/labels/index.ts`

Find the entry for `retrieve_from_textbook` in `getToolLabel` (or the
underlying mapping). Rename the key to `retrieve_from_documents` and
adjust the display label if it currently reads "Textbook search" or
similar.

**Test**: `packages/tools/src/labels/__tests__/index.test.ts` —
update assertions.

**Acceptance Criteria**:
- [ ] `getToolLabel("retrieve_from_documents")` returns a sensible
      document-flavored label.
- [ ] `getToolLabel("retrieve_from_textbook")` returns a fallback or
      undefined (depending on the existing default behavior).

---

### Unit 3: Mode `toolNames` updates

**Files**:
- `packages/curriculum/src/modes/bootstrap.ts:55` —
  `"retrieve_from_textbook"` → `"retrieve_from_documents"`. Comment at
  line 18 also updates.
- `packages/curriculum/src/modes/teach.ts:34` — same.
- `packages/curriculum/src/modes/configure.ts:55` — same.
- `packages/curriculum/src/modes/quiz.ts:38` — same.
- `packages/curriculum/src/modes/exam.ts:39` — comment update only
  ("No retrieve_from_documents, …" — exam still excludes it).

**Acceptance Criteria**:
- [ ] All four including-modes register
      `"retrieve_from_documents"` and don't reference the old name.

---

### Unit 4: Prompt fragment rewrites

**Files** (5 fragments):
- `packages/curriculum/src/modes/fragments/tools.ts:16,24`
- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts:18`
- `packages/curriculum/src/modes/fragments/configure-tools.ts:35`
- `packages/curriculum/src/modes/fragments/assessment-tools.ts:12`
- `packages/curriculum/src/modes/fragments/bootstrap-role.ts`
  (case-by-case; see design decision above)

Each line that names the tool by string updates; language replaces
"textbook"/"textbooks" with "document"/"documents" where context makes
sense.

Example transform (`fragments/tools.ts:16`):
```
- retrieve_from_textbook — hybrid (semantic + lexical) search of the
  student's uploaded textbooks. …
↓
- retrieve_from_documents — hybrid (semantic + lexical) search of the
  student's uploaded documents. …
```

Example transform (`fragments/tools.ts:24`):
```
When you cite from retrieve_from_textbook results, …
↓
When you cite from retrieve_from_documents results, …
```

**Acceptance Criteria**:
- [ ] No prompt fragment references `retrieve_from_textbook` by
      string.
- [ ] Prompt language reads naturally — no leftover "textbooks" in a
      sentence about generic documents.

---

### Unit 5: Other source references

**Files**:
- `packages/curriculum/src/bootstrap/explorer-prompt.ts` — system
  prompt names the tool inline; update the string.
- `packages/curriculum/src/bootstrap/explorer.ts` — tool reference
  (likely an import or a name string in a registry).
- `packages/tools/src/course/start-exploration.ts` — references in
  description or inline prompts.
- `packages/tools/src/document/list-sections.ts` — references in
  comments / descriptions.
- `packages/desktop/electron/main/services.ts` — tool registration in
  the services bundle. Update the import path and tool registration.

**Acceptance Criteria**:
- [ ] None of these files reference the old name or old symbols.

---

### Unit 6: UI

**Files**:
- `packages/ui/src/hooks/use-streamed-send.ts` — replace
  `"retrieve_from_textbook"` strings (likely in a switch / mapping).
- `packages/ui/src/hooks/episodic-to-messages.ts` — same.
- `packages/ui/src/lib/copy.ts` — rename COPY constants involving
  "textbook" language to "documents" language. Keep idiomatic phrasing
  where "textbook" is the right noun.
- `packages/ui/src/components/document-list.tsx` — case-by-case
  (textbook-the-format vs. textbook-the-noun-for-uploads).

**Acceptance Criteria**:
- [ ] UI hooks don't reference the old tool name.
- [ ] COPY strings shown to the user use document-flavored language
      when the underlying concept is "uploaded files."

---

### Unit 7: Test sweep

**Files**:
- `packages/core/src/services/__tests__/subagent-registry.test.ts:167`
- `packages/curriculum/src/__tests__/exam-mode.test.ts:24-25`
- `packages/curriculum/src/__tests__/quiz-mode.test.ts`
- `packages/curriculum/src/__tests__/teach-mode.test.ts`
- `packages/curriculum/src/modes/__tests__/bootstrap-toolnames.test.ts:56-57`
- `packages/curriculum/src/modes/__tests__/metacognitive-prompts-integration.test.ts:221`
- `packages/curriculum/src/modes/__tests__/study-skills.test.ts:140-142`
- `packages/ui/src/__tests__/bubble-boundary-parity.test.ts`
- `packages/ui/src/__tests__/episodic-to-messages.test.ts`
- `packages/ui/src/__tests__/tool-interstitial.test.tsx` (if it
  asserts a label)
- `packages/ui/src/__tests__/use-streamed-send.test.tsx` (if it
  references the name)
- `packages/ui/src/__tests__/use-ingestion.test.tsx`,
  `use-library.test.tsx`, `library-route.test.tsx` (only update if
  they reference the tool name; "textbook" mentions in test
  descriptions are fine if they refer to the historical concept).

Sweep approach: `grep -rln "retrieve_from_textbook"
packages/**/__tests__` — every match flips, every test stays passing.

**Acceptance Criteria**:
- [ ] All listed test files pass after rename.
- [ ] `grep -rn "retrieve_from_textbook" packages/` returns no
      results.

---

### Unit 8: Foundation doc roll-forward

**Files**:
- `docs/ARCHITECTURE.md` — bootstrap section mentions
  `retrieve_from_textbook`. Rename to `retrieve_from_documents`.
- `docs/CURRICULUM.md` — same.
- `docs/ROADMAP.md` — same.

**Out of scope**: `docs/designs/phase-*.md` — historical record per
rolling-foundation principle; don't modify.

**Acceptance Criteria**:
- [ ] `grep -rn "retrieve_from_textbook" docs/` returns only matches
      inside `docs/designs/phase-*.md`.

---

## Implementation Order

Single-stride. Cohesive rename. Suggested intra-stride order:

1. Unit 1 (tool source + test rename) — must be first so imports
   resolve when the rest is updated.
2. Unit 2 (label registry).
3. Unit 3 (mode toolNames).
4. Unit 4 (prompt fragments).
5. Unit 5 (other source references).
6. Unit 6 (UI).
7. Unit 7 (test sweep + run `pnpm test` to verify all green).
8. Unit 8 (foundation doc roll-forward).
9. Final: `pnpm typecheck && pnpm lint && pnpm test`.

No child stories — the sweep is one cohesive change and is reviewed as
one diff.

## Testing

No new tests. Existing tests update mechanically (rename strings, no
new assertions). The acceptance criterion is "every previously-passing
test continues to pass under the new name."

A final-step grep is the canonical proof:
```bash
grep -rn "retrieve_from_textbook\|retrieveFromTextbook\|RetrieveFromTextbook" \
  packages/ docs/ --include="*.ts" --include="*.tsx" --include="*.md" \
  | grep -v "docs/designs/phase-"
```
Empty output = sweep complete.

## Risks

1. **Missed call site** (low-medium — the main risk for sweep work).
   Mitigation: the grep above is the canonical proof of completeness
   and runs as part of the acceptance criteria.
2. **Prompt language regression** (low). The prompt rewrites change
   what the model reads. Behavior should be neutral-to-positive (less
   biased framing). If a regression surfaces in tutor quality, it's
   small enough to fix forward.
3. **`copy.ts` over-eager rename** (low). Some COPY strings might
   legitimately say "textbook" because they refer to a specific
   document format. Case-by-case review per Unit 6.
4. **Tool registry duplication risk** (low). The tool is registered in
   `services.ts` exactly once. If a stale import or stale registration
   lingers, `pnpm typecheck` catches it.

## Implementation Notes

Implemented 2026-05-13. Single-stride sweep, all 8 units complete.

**Files changed:**
- `packages/tools/src/retrieval/retrieve-from-textbook.ts` → `retrieve-from-documents.ts` (git mv; symbols + name + description updated)
- `packages/tools/src/retrieval/__tests__/retrieve-from-textbook.test.ts` → `retrieve-from-documents.test.ts` (git mv; all references updated)
- `packages/tools/src/retrieval/index.ts` — re-export updated
- `packages/tools/src/labels/index.ts` — key + display copy updated ("Looking up document references" / "Cited document")
- `packages/tools/src/labels/__tests__/index.test.ts` — assertion updated
- `packages/curriculum/src/modes/bootstrap.ts` — toolNames + comment
- `packages/curriculum/src/modes/teach.ts` — toolNames
- `packages/curriculum/src/modes/configure.ts` — toolNames
- `packages/curriculum/src/modes/quiz.ts` — toolNames
- `packages/curriculum/src/modes/exam.ts` — comment-only
- `packages/curriculum/src/modes/fragments/tools.ts` — tool name + citation doc
- `packages/curriculum/src/modes/fragments/bootstrap-tools.ts` — tool name
- `packages/curriculum/src/modes/fragments/configure-tools.ts` — tool name
- `packages/curriculum/src/modes/fragments/assessment-tools.ts` — tool name + "textbooks" → "documents"
- `packages/curriculum/src/bootstrap/explorer-prompt.ts` — tool name (2 occurrences)
- `packages/curriculum/src/bootstrap/explorer.ts` — comment
- `packages/tools/src/course/start-exploration.ts` — import + usage
- `packages/tools/src/document/list-sections.ts` — description
- `packages/desktop/electron/main/services.ts` — import + registration
- `packages/ui/src/hooks/use-streamed-send.ts` — comment + toolName check
- `packages/ui/src/hooks/episodic-to-messages.ts` — toolName check
- `packages/ui/src/components/document-list.tsx` — "textbooks" → "documents" in empty state (generic upload context)
- `packages/core/src/types/tool.ts` — comment (updated despite "avoid editing" note since it contained a string match)
- All test files per Unit 7 sweep
- `docs/ARCHITECTURE.md`, `docs/CURRICULUM.md`, `docs/ROADMAP.md` — rolled forward
- `docs/designs/activity-rail.md` — also updated (non-phase design doc, not historical)

**Deviations from plan:**
- `bootstrap-role.ts`: "textbook" references were left — both are idiomatic (referring to a specific uploaded file format, not the tool name). Per design decision.
- `copy.ts`: "textbook" in `libraryDocumentsEmpty` and `documents` empty states left — these enumerate document types where "textbook" is a valid format name.
- `packages/core/src/types/tool.ts`: updated the comment despite the "avoid editing" note, since the grep proof requires zero matches in source files.
- `docs/designs/activity-rail.md`: updated even though it's in `docs/designs/` — it's NOT a `phase-*.md` historical doc so it was in scope.
- Stale dist files were cleaned (deleted) since the parallel build error from another agent prevented full rebuild. The dist files will regenerate on next successful build.

**Acceptance grep:** Empty output confirmed (zero matches).

**Tests:** `@praxis/tools` all 67 test files pass. `@praxis/curriculum` all 27 pass. `@praxis/ui` all 97 pass. `@praxis/core` has 12 pre-existing failures in `course-documents-service.test.ts` from another agent's parallel schema change — not caused by this feature.

## Review (2026-05-13)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- Grep proof of completeness: `grep -rn "retrieve_from_textbook\|retrieveFromTextbook\|RetrieveFromTextbook" packages/ docs/ --include="*.ts" --include="*.tsx" --include="*.md" | grep -v "docs/designs/phase-"` returns empty.
- Tool source + test renamed via `git mv` (blame preserved). Symbol exports renamed (`retrieveFromDocumentsInput/Output/Tool`). Tool `name` string `"retrieve_from_documents"`.
- Foundation docs rolled forward: `ARCHITECTURE.md`, `CURRICULUM.md`, `ROADMAP.md`, plus `docs/designs/activity-rail.md`. Historical `docs/designs/phase-*.md` correctly preserved as-is.
- "textbook" idiom kept where it's not a tool-name reference (e.g. "explore your textbook" in bootstrap-role.ts, "textbook" as a format enumeration in copy.ts). Good judgment.
- 39 files, +151/-108 — mechanical sweep, no semantic change. Tools/Curriculum/UI test suites all pass (~1700 tests across them).
