---
id: feature-dev-mode-agent-feedback-tool
kind: feature
stage: done
tags: [dev, observability, dx]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Dev-mode agent feedback tool: the agent reports tool/prompt issues back to us

## Brief
Net-new dev-only capability: a `dev.report_issue` (or similar) tool registered with every Praxis agent when the desktop runs in dev mode, paired with a dev-mode prompt-fragment injection that instructs the agent to proactively use the tool to surface confusing affordances. Captured reports land in a dev-side review surface so the developer can act on them between turns. Strips out in production builds.

The model knows what bad tool ergonomics feel like better than we do — confusing tool descriptions, contradictory system-prompt fragments, missing tools it expected, broken results, ambiguous instructions, dead-end task framings — and right now there's no channel for it to tell us. This feature is that channel.

## Three pieces (feature-design will likely decompose into 3 child stories)
1. **The `dev.report_issue` tool** — registered in the tool registry only when running in dev mode. Schema accepts: issue kind (confusing-tool / contradictory-prompt / missing-tool / broken-result / can't-execute / other), free-form description, optional reference to a specific tool name or prompt-fragment id, optional severity. Handler persists to whatever review surface piece (3) chooses.
2. **Dev-mode prompt fragment** — env-gated prompt fragment composed into every agent's system prompt during dev runs only. Tells the agent: "you are running in a development environment", lists the `dev.report_issue` tool with usage guidance, instructs the agent to use it proactively when something is unclear rather than guessing or failing silently.
3. **Dev-side review surface** — where reports land. Three plausible shapes that feature-design needs to decide between: (a) a new DB table + a UI panel in the configure surface; (b) a structured log appended to a `dev-reports.jsonl` file; (c) reports surfaced inline in the chat tab as system messages tagged "dev". Each has different review ergonomics; the choice is a feature-design call.

## Production-safety contract
The tool registration and the prompt fragment are both env-gated (`process.env.NODE_ENV === "development"` or equivalent — `import.meta.env.DEV` for Vite-bundled surfaces, gated at registry-build time for engine adapters). Production builds must show no trace of either — no tool exposed to user-facing agents, no dev-mode framing in their prompt. Feature-design should specify the gating discipline and a test that verifies the production registry/prompt are unchanged when the gate is off.

## Source idea
`idea-dev-mode-agent-feedback-tool` (parked 2026-05-24).

## Strategic decisions
None pre-locked — feature-design handles them all. Pre-decomposition is the only thing pinned (3 pieces above).

## Design decisions
*(captured 2026-05-24 via `feature-design --only-questions --all`. These lock in directional choices so the full design pass inherits them.)*

- **No UI surface**: Reports land as files only. The goal is a tighter loop of improving the harness — agents (Claude Code etc) read the report files directly between turns to triage. No DB table, no UI panel, no inline-in-chat system messages. The "dev-side review surface" question is closed: the file system *is* the review surface.
- **Output target**: `.praxis/dev-reports/<ISO-timestamp>-<slug>.md` — one markdown file per report. Filename example: `2026-05-24T14-32-19-confusing-tool-description.md`. Body is the report rendered as frontmatter + markdown sections. Easy to read with `Read`, easy to grep, easy to delete individually after acting on them. An `INDEX.md` is regenerated on each report write listing all current reports for quick scanning.
- **Tool schema (minimally structured)**: User intent: "keep it pretty minimally structured, it's just an escape hatch to allow us to have agent communication outside of the system." Required: `kind` (enum: `confusing-tool` / `contradictory-prompt` / `missing-tool` / `broken-result` / `cant-execute` / `other`) + `summary` (one-line). Optional: `severity` (`low`/`med`/`high`), `tool_ref` (tool name being criticized), `fragment_ref` (prompt-fragment id being criticized), `details` (long-form markdown). No enforcement that a `tool_ref` OR `fragment_ref` must be present — the agent decides whether it has a concrete target.
- **Production-safety gating**: Single source of truth — `process.env.PRAXIS_DEV === 'true'` checked at registry-build time. If false, neither the tool nor the dev-mode prompt fragment is constructed. Dedicated env var (not NODE_ENV) so it's intentional, not accidentally inherited from CI/staging. A test verifies that building the tool registry + composing the system prompt with `PRAXIS_DEV` unset produces zero `dev.*` tools and zero dev-mode prompt text.
- **Prompt fragment scope**: One global fragment composed into every agent's system prompt in dev mode. Tells the agent: "you're in dev; use `dev.report_issue` when something is unclear / contradictory / missing / broken — don't guess or fail silently". Uniform across all modes. One place to maintain. No per-mode tuning.
- **Tool name**: `dev.report_issue` (provisional — the `dev.*` namespace clearly signals the env-gating to anyone reading the registry).

## Mockups
No UI surface — no mocks. Documented for clarity: this feature deliberately produces no visual artifact.

## Architectural choice

Three independently small pieces wired by env gates: (1) a self-contained `packages/tools/src/dev/` directory with the writer + tool, (2) env-gated tool registration in the desktop services bootstrap, (3) a dev-mode `PromptFragment` injected via the existing `additionalFragments` channel in `EngineSessionManager.openActive`. Production safety = a single env var (`PRAXIS_DEV === 'true'`) checked at exactly two construction sites; verified by a single test that asserts zero `dev.*` tools and zero dev-mode text when the gate is off.

Rejected alternatives:
- **Add the dev fragment to every mode's `promptFragments` array gated by env** — modifies 7+ mode files just to ship one global piece of guidance. The `additionalFragments` injection path already exists for cross-mode fragments (course-context, lock-indicator, etc.); reuse it.
- **DB-backed dev-reports table + UI panel** — explicitly rejected by the design decisions. Files are the review surface; agents read them directly.
- **Inline-in-chat dev system messages** — would pollute the student-facing chat history with developer telemetry. Files keep it out of band.

## Implementation Units

### Unit 1: Dev-reports writer + `dev.report_issue` tool
**Files**:
- `packages/tools/src/dev/dev-reports-writer.ts` (NEW)
- `packages/tools/src/dev/report-issue.ts` (NEW)
- `packages/tools/src/dev/index.ts` (NEW)

**Story**: `feature-dev-mode-agent-feedback-tool-step-1-writer-and-tool`

```typescript
// dev-reports-writer.ts
export interface DevReport {
  kind: "confusing-tool" | "contradictory-prompt" | "missing-tool" | "broken-result" | "cant-execute" | "other";
  summary: string;
  severity?: "low" | "med" | "high";
  toolRef?: string;
  fragmentRef?: string;
  details?: string;
  // metadata added by writer:
  sessionId: string;
  modeId: string;
  timestamp: string;  // ISO
}

export interface DevReportsWriter {
  writeReport(report: DevReport): Promise<{ filePath: string }>;
}

export function createDevReportsWriter(opts?: { rootDir?: string }): DevReportsWriter;

// report-issue.ts
import { z } from "zod";
const ReportIssueInput = z.object({
  kind: z.enum(["confusing-tool", "contradictory-prompt", "missing-tool", "broken-result", "cant-execute", "other"]),
  summary: z.string().min(1).max(200),
  severity: z.enum(["low", "med", "high"]).optional(),
  tool_ref: z.string().optional(),
  fragment_ref: z.string().optional(),
  details: z.string().optional(),
});

const ReportIssueOutput = z.object({
  ok: z.literal(true),
  file: z.string(),
});

export const reportIssueTool: ToolDefinition<typeof ReportIssueInput, typeof ReportIssueOutput> = {
  name: "dev.report_issue",
  description: "Dev-only: report a confusing tool description, contradictory prompt, missing tool, broken result, or unexecutable instruction back to the developer. Files land in .praxis/dev-reports/.",
  tier: "deterministic",
  effects: ["filesystem"],
  input: ReportIssueInput,
  output: ReportIssueOutput,
  handler: async (args, ctx) => {
    const writer = ctx.services.devReportsWriter; // injected via ServiceDeps
    if (!writer) {
      return { ok: false, error: { code: "DEV_REPORTS_UNAVAILABLE", message: "Dev-reports writer not configured", recoverable: false } };
    }
    const { filePath } = await writer.writeReport({
      kind: args.kind,
      summary: args.summary,
      severity: args.severity,
      toolRef: args.tool_ref,
      fragmentRef: args.fragment_ref,
      details: args.details,
      sessionId: ctx.sessionId,
      modeId: /* resolve from session — likely available via ctx */,
      timestamp: new Date().toISOString(),
    });
    return { ok: true, value: { ok: true, file: filePath }, tier: "deterministic" };
  },
};

// index.ts
export const DEV_TOOLS = [reportIssueTool] as const;
```

**Implementation notes**:
- Writer path: `process.cwd() + '/.praxis/dev-reports/'`. Allow override via `rootDir` opt for tests.
- Filename: `${ISO-timestamp-no-colons}-${slug-of-summary}.md` (replace `:` with `-`; slug = lowercase summary's first 5 words, kebab-case). Example: `2026-05-24T14-32-19-confusing-ask-student-question-description.md`
- File body format:
  ```markdown
  ---
  kind: confusing-tool
  summary: Confusing ask_student_question description
  severity: med
  tool_ref: ask_student_question
  session_id: <uuid>
  mode_id: teach
  timestamp: 2026-05-24T14:32:19Z
  ---

  # Confusing ask_student_question description

  ## Details
  <details body markdown>
  ```
- `INDEX.md` regenerated on every write: lists all reports in reverse-chronological with file links + summary line. Truncate after 100 entries (oldest moved to `INDEX.archive.md`).
- Use `node:fs/promises` for file I/O; `mkdir` with `recursive: true`. Synchronous error on permission denial (rare in dev).
- Tests in `packages/tools/src/dev/__tests__/dev-reports-writer.test.ts` and `report-issue.test.ts`:
  - Writer creates dir if missing
  - Multiple reports produce unique filenames
  - INDEX.md regenerates correctly
  - Tool validates input (Zod tests)
  - Tool handler writes file and returns `{ok: true, file: <path>}`
  - Handler returns `DEV_REPORTS_UNAVAILABLE` when writer is missing from ctx.services

**Acceptance criteria**:
- [ ] `DevReport` interface exported with documented fields
- [ ] `createDevReportsWriter` writes markdown files with frontmatter + body
- [ ] Filename format `<ISO-no-colons>-<slug>.md`
- [ ] `INDEX.md` regenerated on each write, sorted reverse-chronological
- [ ] `dev.report_issue` tool with full Zod schema
- [ ] Handler calls writer, returns `{ok: true, file}` on success
- [ ] Handler returns `DEV_REPORTS_UNAVAILABLE` when writer is missing
- [ ] Unit tests cover writer (temp dir), tool schema, handler happy path + missing-writer path

---

### Unit 2: Env-gated tool registration
**File**: `packages/desktop/electron/main/services.ts` (modify around line 232-260) + `packages/core/src/services/build-tool-services.ts` (or equivalent — wire `devReportsWriter`)
**Story**: `feature-dev-mode-agent-feedback-tool-step-2-tool-registration-gating`

**Implementation notes**:
- In `services.ts`, after the existing `toolDefinitions` array assembly:
  ```typescript
  if (process.env.PRAXIS_DEV === "true") {
    toolDefinitions.push(...DEV_TOOLS);
  }
  ```
- Wire `devReportsWriter` into `ToolServices` (the `ctx.services` proxy). Only construct when `PRAXIS_DEV === 'true'`; otherwise leave undefined so handler returns the unavailable error (defensive).
- The `ToolServices` type extension: add `devReportsWriter?: DevReportsWriter`.
- One single read of `process.env.PRAXIS_DEV` at services-build time; cache the result; pass to both registrations.
- No new file needed for the gate — it's a one-line guard.

**Acceptance criteria**:
- [ ] `services.ts` conditionally appends `DEV_TOOLS` when `PRAXIS_DEV === 'true'`
- [ ] `devReportsWriter` wired into `ToolServices` only when gate is on
- [ ] When gate is off: registry has zero tools matching `dev.*` (assert via list count)
- [ ] When gate is on: `dev.report_issue` is dispatchable
- [ ] No regression on production-mode tool registration count

---

### Unit 3: Dev-mode prompt fragment + injection
**File**: `packages/curriculum/src/modes/fragments/dev-mode.ts` (NEW) + `packages/core/src/services/session/engine-session-manager.ts` (modify additionalFragments assembly around line 284-312)
**Story**: `feature-dev-mode-agent-feedback-tool-step-3-prompt-fragment-injection`

```typescript
// packages/curriculum/src/modes/fragments/dev-mode.ts
import type { PromptFragment } from "@praxis/core/types";

export const devModeFragment: PromptFragment = {
  id: "dev.agent-feedback",
  position: "postamble",
  customizable: false,
  template: `## Dev mode

You are running Praxis in a development environment. The \`dev.report_issue\` tool is available for you to surface confusing or broken affordances back to the developer — use it proactively rather than guessing or failing silently.

Use it when:
- A tool description is unclear or contradicts what you can actually do
- Two prompt fragments give contradictory instructions
- A tool you expected is missing
- A tool result is malformed or empty when it shouldn't be
- You can't execute a clearly-asked-for task because of a harness gap

Schema (minimal — escape hatch, not a structured form):
- \`kind\`: one of confusing-tool / contradictory-prompt / missing-tool / broken-result / cant-execute / other
- \`summary\`: one-line description
- optional: \`severity\` (low/med/high), \`tool_ref\` (tool name), \`fragment_ref\` (fragment id), \`details\` (long markdown)

Reports land in \`.praxis/dev-reports/\` as markdown files for the developer to triage between turns.`,
};
```

**Implementation notes**:
- In `engine-session-manager.ts`, after the existing `additionalFragments` array is built (around line 306), add:
  ```typescript
  if (process.env.PRAXIS_DEV === "true") {
    additionalFragments.push(devModeFragment);
  }
  ```
- Position `postamble` puts it at the very end of the system prompt — the agent reads it after all standard guidance, primed to recognize dev-mode behavior in subsequent turns.
- `customizable: false` — users can't override (this is framework guidance, not personalizable).
- Tests in `packages/core/src/services/session/__tests__/dev-mode-injection.test.ts`:
  - With `PRAXIS_DEV='true'`: composed system prompt contains "Dev mode" header
  - With `PRAXIS_DEV` unset: composed system prompt does NOT contain "Dev mode" header

**Acceptance criteria**:
- [ ] `devModeFragment` exported with id `dev.agent-feedback`, position `postamble`, customizable false
- [ ] `EngineSessionManager` injects it via `additionalFragments` only when `PRAXIS_DEV === 'true'`
- [ ] Tests cover both gate states
- [ ] Composed system prompt for any mode includes the dev guidance when gate is on
- [ ] No regression on existing prompt-composition tests

---

### Unit 4: Production-safety test
**File**: `packages/desktop/electron/main/__tests__/dev-mode-production-safety.test.ts` (NEW)
**Story**: `feature-dev-mode-agent-feedback-tool-step-4-production-safety-test`

**Implementation notes**:
- Two test cases:
  - `it("registers zero dev.* tools when PRAXIS_DEV is unset")` — `delete process.env.PRAXIS_DEV`, build the registry, assert `registry.list().filter(t => t.name.startsWith("dev.")).length === 0`
  - `it("composes zero dev-mode text into any mode's system prompt when PRAXIS_DEV is unset")` — `delete process.env.PRAXIS_DEV`, compose system prompt for each mode (teach, quiz, etc.), assert `!prompt.includes("Dev mode")` AND `!prompt.includes("dev.report_issue")`
- `beforeEach` saves the existing `PRAXIS_DEV` value; `afterEach` restores it.
- Single test file serves as the "double-gate" verification — if either insertion point ever leaks, this test catches it.

**Acceptance criteria**:
- [ ] Test passes with `PRAXIS_DEV` unset
- [ ] Both assertions execute: zero dev tools + zero dev prompt text
- [ ] Test file covers every mode (parametrized)
- [ ] `beforeEach`/`afterEach` correctly save/restore env var
- [ ] Test runs in CI without depending on local environment

---

## Implementation Order

1. **step-1-writer-and-tool** (deps: `[]`) — writer + tool definition
2. **step-2-tool-registration-gating** (deps: `[step-1]`) — env-gated registration in services.ts
3. **step-3-prompt-fragment-injection** (deps: `[]`) — fragment + session injection
4. **step-4-production-safety-test** (deps: `[step-2, step-3]`) — verification

Parallel-friendly: steps 1 and 3 ship without waiting; 2 follows 1; 4 is the verification merge.

## Testing

### Unit tests
- `packages/tools/src/dev/__tests__/dev-reports-writer.test.ts` — writer happy/edge paths using temp dir
- `packages/tools/src/dev/__tests__/report-issue.test.ts` — tool schema + handler
- `packages/core/src/services/session/__tests__/dev-mode-injection.test.ts` — fragment-injection gate
- `packages/desktop/electron/main/__tests__/dev-mode-production-safety.test.ts` — production-safety verification

### Integration / smoke
- Open a session with `PRAXIS_DEV='true'`, dispatch `dev.report_issue`, verify file appears in `.praxis/dev-reports/`, verify INDEX.md updated

### Test helpers
- `makeToolContext` extended with optional `devReportsWriter` field in services overrides
- Temp dir helper for writer tests (Node's `fs.mkdtemp(os.tmpdir() + '/praxis-dev-')`)

## Risks

- **Filesystem race**: two simultaneous `dev.report_issue` calls could race on INDEX.md regen. **Mitigation**: serialize INDEX writes via an in-memory mutex in the writer (`async` queue). Tests cover concurrent writes.

- **`process.cwd()` differs in dev vs packaged**: when Electron is packaged, `process.cwd()` may not be the repo root. But this feature only ever runs in dev — the gate prevents production execution. **Mitigation**: trust the gate; no path-resolution heuristics needed. Add a comment in the writer noting the assumption.

- **`mode_id` resolution from ToolContext**: the report frontmatter wants `mode_id`, but ToolContext doesn't currently expose it cleanly. **Mitigation**: piggyback on the `feature-mode-aware-question-constraints` work which also wants mode access from ToolContext — add `modeId?: string` to ToolContext as part of step-2 of THIS feature (or coordinate with that feature's step-2 which adds `questionConstraints`).

- **`INDEX.md` grows unbounded**: 100-entry truncation moves overflow to `INDEX.archive.md`, which grows unbounded. In a dev session that runs for weeks, this could get large. **Mitigation**: dev-only feature; agents/devs can `rm .praxis/dev-reports/INDEX.archive.md` periodically. Document.

- **CI environment**: if `PRAXIS_DEV` happens to be set in some CI shell unintentionally, tests for production-mode behavior would silently fail. **Mitigation**: every test that asserts "gate-off" behavior explicitly `delete process.env.PRAXIS_DEV` in `beforeEach`. The production-safety test is the canary.

## Implementation summary (2026-05-24)

All 4 child stories landed under autopilot/implement-orchestrator:

- `step-1-writer-and-tool` (commit `1fa837b`) — `DevReportsWriter` + `dev.report_issue` tool. Two deviations from spec, both improvements: `DevReport`/`DevReportsWriter` declared in `@praxis/core/types/tool.ts` (avoids `@praxis/tools` ↔ `@praxis/core` cycle); `modeId?: string` forward-staged into `ToolContext` (handler needed it immediately).
- `step-2-tool-registration-gating` (commit `ed1d1c6`) — `IS_DEV` gate in `services.ts` for both `DEV_TOOLS` push and `devReportsWriter` construction. Used spread `...(IS_DEV && { devReportsWriter: ... })` due to `exactOptionalPropertyTypes: true`.
- `step-3-prompt-fragment-injection` (commit `f59a279`) — `devModeFragment` at `position: "postamble"` injected into `EngineSessionManager.openActive` when gate is on. 11 tests covering fragment shape, compose integration, and gate behavior.
- `step-4-production-safety-test` (commit `379fd88`) — dedicated double-gate canary: parameterized over all 7 modes asserting zero dev content when gate is off; plus gate-on sanity asserting the canary would catch regressions (no vacuous pass). Used `.prompt` (not `.systemPrompt` — fixed spec typo on the way).

Verification at advance time: full workspace typecheck green; all changed files pass biome check.

What's now possible: the agent has a structured channel to surface confusing tool descriptions, contradictory prompts, missing tools, broken results, and unexecutable instructions back to the developer via the `dev.report_issue` tool, gated behind `PRAXIS_DEV=true`. Reports land as markdown files in `.praxis/dev-reports/` with an auto-regenerated INDEX.md. Production builds carry zero trace of dev tooling — verified by the step-4 canary.

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: All 4 child stories individually reviewed + approved. Feature-level umbrella check: end-to-end capability delivered — `dev.report_issue` tool invocable, writer persists to `.praxis/dev-reports/<file>.md` with regenerated INDEX, dev-mode prompt fragment teaches the agent to use it proactively. Production-safety canary (step-4) covers both gate-off cleanliness AND gate-on sanity to prevent vacuous-pass regression. Cross-cutting concern (env-gating consistency at both insertion sites — `services.ts` for tools, `engine-session-manager.ts` for fragment) explicitly tested in the canary. No foundation-doc drift, no breaking changes (additive optional fields on `ToolContext`/`ToolServices` + new `EffectKind` value). Archiving on advance — no release binding.

What's now possible: agents (when running with PRAXIS_DEV=true) have a structured channel to flag confusing tool descriptions, contradictory prompts, missing tools, broken results, and unexecutable instructions back to the developer. Files in `.praxis/dev-reports/` are scannable via INDEX.md for triage between turns.
