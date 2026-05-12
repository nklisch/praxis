---
id: story-fix-block-claude-code-builtins-from-tutor
kind: story
stage: done
tags: [bug]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Block Claude Code built-in tools from the tutor — fix "Couldn't finish askuserquestion" interstitial

## Symptom

User ran a bootstrap session and asked the tutor to "create an Algebra 1 course
using 8th grade Algebra 1 book as content and the package guidance."

In two places, the chat rendered an errored interstitial:

> Couldn't finish askuserquestion.

…followed by the tutor improvising a text response that explained what it
*would* have asked. The model also tried to call `course.attach_document` from a
no-course bootstrap session — that's a separate root cause (see parked idea
below) and is not addressed by this fix.

The user wrote, verbatim:

> it failed to use ask user question somehow, we should support some form of
> this if we don't and if we do we have an error, and it didn't really do what
> it should have

## Root cause

`packages/engines/src/claude-code/adapter.ts` calls
`createConversation(...)` without passing `tools`. Per the in-tree
`@praxis/claude-cli-sdk` contract (`packages/claude-cli-sdk/src/types/options.ts:117`,
`ToolControl = "all" | "none" | ToolFilter`), omitting `tools` defaults to
`"all"` — meaning every Claude Code CLI built-in is visible to the tutor model:
`AskUserQuestion`, `Bash`, `Read`, `Edit`, `Write`, `Glob`, `Grep`, `WebFetch`,
`WebSearch`, `Task`, `TodoWrite`, `NotebookEdit`, …

The model reached for `AskUserQuestion` (the right primitive for "Before I
create it, a couple of quick decisions:" prompts). But Praxis drives the CLI
non-interactively — there's no TTY and no `toolHandlers` registered — so the
CLI's own built-in handler can't fulfill the call. The tool returns an error
result, the UI maps it to the "Couldn't finish askuserquestion." interstitial
(`packages/ui/src/components/tool-interstitial.tsx:32`), and the tutor falls
back to an "I'll proceed with the recommended approach" text apology. The
student never gets to make the choice the tutor wanted to surface.

The stale comment in `packages/claude-cli-sdk/src/cli/args.ts:104`
("Praxis ... does not expose built-in CLI tools (Bash, Read, Edit) to the model")
asserts the desired state, but no caller actually enforces it. Praxis was
relying on the model not noticing the built-ins existed.

## Fix approach

Add `tools: "none"` to the `createConversation(...)` options in
`packages/engines/src/claude-code/adapter.ts`. The SDK translates this to
`--tools ""` (`packages/claude-cli-sdk/src/cli/args.ts:85-87`), which hides all
built-ins from the model. MCP-registered Praxis tools come in through
`mcpServers` (the bridge) and remain available — those are the only tools the
tutor needs.

This is the minimal change that fixes the symptom (no AskUserQuestion call ⇒ no
"Couldn't finish askuserquestion." interstitial) and also tightens the contract
the stale comment already documents. Real support for tutor-initiated
structured questions (custom MCP tool routed to the chat UI, inspired by the
upstream SDK's `Tools.intercept('AskUserQuestion', handler)` pattern) is parked
as a separate feature.

## Regression test

`packages/engines/src/__tests__/claude-code.test.ts` — new test:

> open() passes tools: 'none' to createConversation so built-ins
> (AskUserQuestion, Bash, …) stay hidden from the model

Mocks `createConversation`, drives `ClaudeCodeEngine.open(...)`, asserts the
SDK options passed in include `tools: "none"`. Locks the contract: if anyone
ever drops the option, the test fails.

## Implementation notes

**Files changed**:
- `packages/engines/src/claude-code/adapter.ts` — added `tools: "none"` and a
  comment explaining why (with the "Couldn't finish askuserquestion." breadcrumb
  for future grep).
- `packages/engines/src/__tests__/claude-code.test.ts` — new regression test
  named after the symptom.

**Verification**:
- `pnpm vitest run packages/engines/src/__tests__/claude-code.test.ts` — 15/15 pass
- `pnpm --filter @praxis/engines test` — 94/94 pass (whole engines package)
- `pnpm --filter @praxis/engines exec tsc -b` — clean
- `pnpm biome check packages/engines/src/claude-code/adapter.ts packages/engines/src/__tests__/claude-code.test.ts` — clean

**Out of scope (parked as separate substrate items)**:
- `idea-tutor-structured-questions-via-custom-mcp` — feature: bring back
  structured Q&A by registering a Praxis-side custom MCP tool that routes to
  the chat UI's quick-check surface. The upstream `@nklisch/claude-cli-sdk`
  (newer than the in-tree fork) has a `Tools.intercept('AskUserQuestion', …)`
  builder that does exactly this; we could mirror the pattern with the in-tree
  `tools.custom` shape we already have, plus a system-prompt fragment telling
  the tutor "use `ask_student_question` instead of AskUserQuestion."
- `idea-bootstrap-attach-document-throws-without-course` — bug:
  `course.attach_document` is in `bootstrapMode.toolNames`
  (`packages/curriculum/src/modes/bootstrap.ts:39`), but the tool throws
  `"course.attach_document requires a course-scoped session"` whenever
  `ctx.courseId === undefined` (`packages/tools/src/course/attach-document.ts:23-25`).
  In bootstrap mode there's no course yet, so the model is invited to call a
  tool that always fails. Either drop it from `bootstrapMode.toolNames` or
  teach the tool to defer-attach via the draft.

## Review (2026-05-10)

**Verdict**: Approve with comments

**Blockers**: none
**Important**: `idea-engine-cli-integration-smoke-test` — the regression test
locks the SDK call shape (`tools: "none"`) but never exercises the real
`claude` CLI. The fix relies on `--tools ""` and `--mcp-config` being
independent flags. They clearly are at the SDK layer
(`packages/claude-cli-sdk/src/cli/args.ts:87` vs `:196`), but a CLI-side
interpretation change that strips MCP tools alongside built-ins would silently
zero out the entire tutor toolset. A slow-test-gated integration smoke is the
right level for catching that.
**Nits**:
- The new comment block in `packages/engines/src/claude-code/adapter.ts` is 8
  lines — a little long. Kept as-is because it documents a real footgun and a
  future reader stumbling on `tools: "none"` will need the breadcrumb back to
  the "Couldn't finish askuserquestion." symptom.

**Notes**:
- Fix is minimal and surgical (one option added).
- Brings code into compliance with the foundation assertion at
  `docs/designs/claude-cli-sdk-refactor.md:167-171` ("Praxis doesn't and
  shouldn't" expose CLI built-ins to the model) — that doc claimed the
  invariant held; this fix actually establishes it.
- No foundation-doc drift introduced.
- 94/94 engines tests pass; typecheck clean; biome clean on changed files.
- Security: net tightening — built-ins were nominally reachable under
  `bypassPermissions`; now they're invisible to the model. No new surface.
