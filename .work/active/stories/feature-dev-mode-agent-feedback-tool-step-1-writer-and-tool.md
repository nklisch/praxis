---
id: feature-dev-mode-agent-feedback-tool-step-1-writer-and-tool
kind: story
stage: implementing
tags: [dev, observability, dx]
parent: feature-dev-mode-agent-feedback-tool
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 1: Dev-reports writer + `dev.report_issue` tool

## Scope
Create `packages/tools/src/dev/` with the writer (filesystem output to `.praxis/dev-reports/`, INDEX.md regen) and the tool definition (Zod schema + handler that delegates to the writer). No gating yet — that lives in step-2.

## Implementation
- Create `packages/tools/src/dev/dev-reports-writer.ts`:
  - Export `DevReport` interface (kind, summary, severity?, toolRef?, fragmentRef?, details?, sessionId, modeId, timestamp)
  - Export `DevReportsWriter` interface with `writeReport(report): Promise<{ filePath }>`
  - Export `createDevReportsWriter(opts?: { rootDir?: string }): DevReportsWriter`
  - Filename: `${ISO-no-colons}-${slug}.md` (slug = first 5 words of summary, lowercase, kebab-case)
  - File body: frontmatter (kind, summary, severity, tool_ref, fragment_ref, session_id, mode_id, timestamp) + `## Details` markdown body
  - INDEX.md: regenerate on every write, reverse-chronological, link + summary line; truncate to 100 entries with overflow to INDEX.archive.md
  - Use `node:fs/promises`; `mkdir({ recursive: true })`
  - Serialize INDEX writes via an in-memory mutex/promise-chain to handle concurrent reports
- Create `packages/tools/src/dev/report-issue.ts`:
  - Zod input schema per feature design (kind enum, summary 1-200, optional severity/tool_ref/fragment_ref/details)
  - Zod output schema `{ ok: literal(true), file: string }`
  - `reportIssueTool: ToolDefinition` named `dev.report_issue`, `tier: "deterministic"`, `effects: ["filesystem"]`
  - Handler: read `ctx.services.devReportsWriter`; if missing, return `DEV_REPORTS_UNAVAILABLE` error; else call writer + return success
- Create `packages/tools/src/dev/index.ts`:
  - `export const DEV_TOOLS = [reportIssueTool] as const`
  - Re-export `createDevReportsWriter`, `DevReportsWriter`, `DevReport` types
- Extend `ToolServices` type (`packages/core/src/types/tool.ts`):
  - Add `devReportsWriter?: DevReportsWriter`
- Add tests:
  - `packages/tools/src/dev/__tests__/dev-reports-writer.test.ts`: temp-dir writer; creates dir, writes file, regenerates INDEX, handles concurrent writes correctly, truncates INDEX at 100
  - `packages/tools/src/dev/__tests__/report-issue.test.ts`: Zod input validation (happy + invalid); handler happy path; handler returns `DEV_REPORTS_UNAVAILABLE` when writer missing
- Use temp dir via `fs.mkdtemp(os.tmpdir() + '/praxis-dev-')` for writer tests.

## Acceptance Criteria
- [ ] `DevReport`, `DevReportsWriter`, `createDevReportsWriter` exported from `packages/tools/src/dev/`
- [ ] Writer creates dir, writes markdown files with frontmatter + body
- [ ] Filename format matches `<ISO-no-colons>-<slug>.md`
- [ ] INDEX.md regenerates correctly; truncates at 100 entries with archive overflow
- [ ] Concurrent writes serialized; no INDEX corruption
- [ ] `dev.report_issue` tool with full Zod schema and `effects: ["filesystem"]`
- [ ] Handler returns `{ok: true, file}` on success, `DEV_REPORTS_UNAVAILABLE` when writer missing
- [ ] `ToolServices.devReportsWriter?: DevReportsWriter` added
- [ ] All tests pass; no production-side regressions

## References
- Parent feature: `.work/active/features/feature-dev-mode-agent-feedback-tool.md` § Unit 1
- Reference tool: `packages/tools/src/dialog/ask-student-question.ts`
- Reference writer pattern: `packages/core/src/db/paths.ts` for `.praxis/` path resolution
