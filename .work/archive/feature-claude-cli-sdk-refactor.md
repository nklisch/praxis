---
id: feature-claude-cli-sdk-refactor
kind: feature
stage: done
tags: [refactor]
parent: null
depends_on: []
release_binding: v0.1.0
gate_origin: null
created: 2026-05-09
updated: 2026-05-10
---

# `@praxis/claude-cli-sdk` surface refactor

Original design: `docs/designs/claude-cli-sdk-refactor.md`.

Eight-unit refactor that tightens the SDK's surface against how Praxis actually consumes
it. Praxis is the only consumer, so the SDK can be modified freely; this design moves
the SDK from "faithful CLI wrapper" toward "API shaped for our adapter."

## Status at bootstrap

All 8 implementation units have landed as commits:

| Unit | Description | Commit |
|---|---|---|
| 1 | Tighten `mapClaudeCodeEvent` signature to typed `StreamEvent` | `ed76a2e` |
| 2 | Drop adapter's dead `result.resultEvent` defensive check | `5aed910` |
| 3 | Delete unused SDK exports (with one type-only carve-out for hook types) | `8299c67` |
| 4 | `onSessionReady` callback for eager session id | `9ec6df8` |
| 5a | `engine_session_state_json` column on sessions table | `655dbdd` |
| 5b/5c | `EngineOpenOptions` resume fields + adapter wiring | `9ec6df8` |
| 5d/5e | Native engine session resume in `SessionService` | `b6cb987` |
| 6 | Optional `outputSchema` on `tool()` for handler-result validation | `58dafc0` |
| 7 | Default `permissionMode: bypassPermissions` when `mcpServers` is set | `108d146` |
| 8 | Make `ResultEvent.subtype` non-nullable + tighten parser | `ed76a2e` |

## Implementation closing (landed in this stride)

All pending tests + parser/schema/events tightening landed in the closing commit
right after this item was scoped. SDK targeted suite: 41/41 green;
engines targeted suite: 93/93 green; full repo `pnpm test`: 2000/2000 green
(15 skipped).

- `packages/claude-cli-sdk/src/__tests__/conversation-resume.test.ts` (new) — Unit 5 args pass-through
- `packages/claude-cli-sdk/src/__tests__/conversation.test.ts` (new) — Unit 7 permissionMode resolution
- `packages/claude-cli-sdk/src/__tests__/parser.test.ts` (new) — MCP tool_result content extraction + JSON parse
- `packages/engines/src/__tests__/claude-code-adapter-resume.test.ts` (new) — Unit 5c adapter passthrough
- `packages/claude-cli-sdk/src/cli/parser.ts` — `hasStringSubtype` guard, dropped `as` cast on subtype
- `packages/claude-cli-sdk/src/cli/schemas.ts` — tightened result schema
- `packages/claude-cli-sdk/src/types/events.ts` — non-nullable `ResultEvent.subtype` cleanup
- `packages/core/src/services/__tests__/session-service.engine-session-state.test.ts` — resume coverage touch-ups

## Acceptance criteria

- All 8 units land in commits with passing typecheck/lint/test (done).
- The new test suites for conversation, parser, and resume committed and green.
- `events.ts` has zero `as` casts on SDK-provided fields.
- `adapter.ts` has zero workaround comments.
- The SDK's `index.ts` exports only what Praxis uses (with rationale comments where
  type-only exports remain).
- Reopening a Praxis session resumes the underlying CLI session natively rather than
  replaying a transcript preface.

## Next step

Run `/agile-workflow:review feature-claude-cli-sdk-refactor` to evaluate. On the
next release (v0.2.0 or v1.0),
this feature gets bound and bundled.

## Review (2026-05-10)

**Verdict**: Approve with comments

**Blockers**: foundation-doc drift in `CLAUDE.md` (fixed inline as part of
the review commit). The "Claude Code permission mode (load-bearing)" entry
asserted the adapter MUST set `permissionMode: "bypassPermissions"`
explicitly, but Unit 7 moved that default into
`packages/claude-cli-sdk/src/cli/args.ts` (`resolvePermissionMode`). The
adapter now omits the explicit setting and relies on the SDK default. Doc
updated to describe the new contract: SDK defaults to bypass when
`mcpServers` is set, which is every Praxis session. Implementation behaviour
is unchanged — the regression scenarios in the original doc still hold;
only the source of the default moved.

**Important**: none.

**Nits** (in conversation only):
- `events.ts` zero `as` casts on SDK-provided fields ✅
- `adapter.ts` zero workaround comments ✅ (the only remaining comment about
  permissionMode is now an explanatory note, not a workaround)
- Unit 7 SDK default returns `undefined` when `mcpServers === {}` (empty
  record), which would put the CLI in `default` mode if Praxis ever opened
  a session with no tools registered. Currently every Praxis session
  registers tools, so the path is unreachable, but worth noting if a
  toolless session ever appears.

**Notes**:
- All 8 units landed across the listed commits; closing commit `3a20fe9`
  added the test surface that pins the new contracts (resume args, permission
  resolution, parser content extraction, adapter resume/onSessionReady,
  session-service resume coverage).
- Targeted suites green at the closing commit (41/41 SDK, 93/93 engines);
  full repo `pnpm test` 2000 passed / 15 skipped at HEAD; `pnpm typecheck`
  green; lint flat at 13 errors (down from 51 baseline).
- `events.ts` is now a tight discriminated-switch with the `mapResultSubtype`
  exhaustive `never` catch — future SDK subtypes will fail the compile.
- Parser tightening is solid: `safeParse` + structural type guards
  (`hasType`, `hasStringSubtype`) replace the old `as` cast on
  `result.subtype`. Unknown system subtypes are dropped via debug log
  rather than warn — correct, since the CLI emits a lot of internal
  bookkeeping subtypes that aren't part of our public surface.
- Native session resumption is well-isolated: `resumeEngineSessionId` flows
  to SDK `resume`, transcript-preface is suppressed when resume is set, and
  the warn-on-conflict log makes a misuse loud rather than silent.
- Capability check: the four design promises hold — zero `as` casts in
  events, zero workaround comments in adapter, SDK exports trimmed
  (`index.ts` carries only the surface Praxis uses, with type-only carve-out
  for hook types documented), and native resume is wired end-to-end.
