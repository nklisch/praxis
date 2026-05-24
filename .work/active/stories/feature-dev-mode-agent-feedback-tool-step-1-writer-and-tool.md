---
id: feature-dev-mode-agent-feedback-tool-step-1-writer-and-tool
kind: story
stage: review
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
- [x] `DevReport`, `DevReportsWriter`, `createDevReportsWriter` exported from `packages/tools/src/dev/`
- [x] Writer creates dir, writes markdown files with frontmatter + body
- [x] Filename format matches `<ISO-no-colons>-<slug>.md`
- [x] INDEX.md regenerates correctly; truncates at 100 entries with archive overflow
- [x] Concurrent writes serialized; no INDEX corruption
- [x] `dev.report_issue` tool with full Zod schema and `effects: ["filesystem"]`
- [x] Handler returns `{ok: true, file}` on success, `DEV_REPORTS_UNAVAILABLE` when writer missing
- [x] `ToolServices.devReportsWriter?: DevReportsWriter` added
- [x] All tests pass; no production-side regressions

## References
- Parent feature: `.work/active/features/feature-dev-mode-agent-feedback-tool.md` § Unit 1
- Reference tool: `packages/tools/src/dialog/ask-student-question.ts`
- Reference writer pattern: `packages/core/src/db/paths.ts` for `.praxis/` path resolution

## Implementation notes (2026-05-24)

### Files touched
- `packages/tools/src/dev/dev-reports-writer.ts` (NEW) — writer factory + helpers
- `packages/tools/src/dev/report-issue.ts` (NEW) — `reportIssueTool` ToolDefinition
- `packages/tools/src/dev/index.ts` (NEW) — `DEV_TOOLS` export + re-exports
- `packages/tools/src/dev/__tests__/dev-reports-writer.test.ts` (NEW) — 21 tests
- `packages/tools/src/dev/__tests__/report-issue.test.ts` (NEW) — 22 tests
- `packages/tools/package.json` — added `./dev` subpath export
- `packages/core/src/types/tool.ts` — added `DevReport` + `DevReportsWriter` interfaces, `"filesystem"` to `EffectKind`, `modeId?: string` to `ToolContext`, `devReportsWriter?: DevReportsWriter` to `ToolServices`
- `tests/helpers/tool-context.ts` — added `modeId?` to `MakeToolContextOptions` and propagation

### Deviations from spec
- **`DevReport` and `DevReportsWriter` declared in `@praxis/core/types/tool.ts`** (not in `@praxis/tools/dev`) per the spec's recommended approach to avoid cyclic deps. `@praxis/tools/dev` re-exports both types for callers that want a single import point.
- **`modeId?: string` added to `ToolContext`** in this step (spec said step-2) — needed for the handler to embed it in reports. Handler falls back to `"unknown"` when absent.
- **`"filesystem"` added to `EffectKind`** — required for `effects: ["filesystem"]` on the tool. No spec deviation; just required from `@praxis/core/types`.
- **Biome formatting**: the `useTemplate` suggestion for the body-string construction was applied (nested template literal) to satisfy Biome's lint rule.

### Test results
- 43 new tests: 43 passed, 0 failed
- `pnpm typecheck`: all green
- `pnpm biome check packages/tools/src/dev/ tests/helpers/tool-context.ts packages/core/src/types/tool.ts`: clean
- Pre-existing failures in `tests/` (root integration tests) and `src/runtime/__tests__/sqlite-stores.test.ts` are unrelated Electron ABI rebuild issues (better-sqlite3 won't load in Node ABI without `pnpm rebuild better-sqlite3`).
