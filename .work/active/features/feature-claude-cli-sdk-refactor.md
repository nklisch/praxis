---
id: feature-claude-cli-sdk-refactor
kind: feature
stage: review
tags: [refactor]
parent: null
depends_on: []
release_binding: null
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

## Outstanding work

The repo's working tree at substrate-bootstrap time has uncommitted changes related to
the parser/conversation/resume tests that complete this design's "What ships" list:

- `packages/claude-cli-sdk/src/__tests__/conversation-resume.test.ts` (new)
- `packages/claude-cli-sdk/src/__tests__/conversation.test.ts` (new)
- `packages/claude-cli-sdk/src/__tests__/parser.test.ts` (new)
- `packages/engines/src/__tests__/claude-code-adapter-resume.test.ts` (new)
- Modifications to `packages/claude-cli-sdk/src/cli/parser.ts`,
  `cli/schemas.ts`, `types/events.ts` and engine session-state tests

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

Land the pending test files + parser/schema/events modifications as the closing commits,
then `/agile-workflow:review` to advance to `done`. On the next release (v0.2.0 or v1.0),
this feature gets bound and bundled.
