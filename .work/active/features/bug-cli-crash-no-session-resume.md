---
id: bug-cli-crash-no-session-resume
kind: feature
stage: drafting
tags: [bug, engines, session]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-17
---

# Resume Claude CLI session after a mid-stream crash

## Brief

When the Claude CLI subprocess crashes mid-session (observed via the per-turn timeout firing, but likely applies to any abnormal exit), starting a new conversation doesn't resume the prior engine session — it starts a fresh one with no memory of what came before. The adapter has a native-resume path (`resumeEngineSessionId` → CLI `--resume` flag) and a `priorTurns` text-splice fallback for cross-engine continuity, but neither appears to be wired in for the post-crash case.

Worth tracing: does the session store retain the engine session id after a crash, does `SessionService` attempt resume on the next `open()`, and does the CLI's `--resume` actually work against a half-aborted session, or do we need to fall back to `priorTurns` reconstruction from the episodic log.

## Why this is a feature (not a story)

The fix likely spans:

- `packages/core/src/services/session-service.ts` — `open()` resume policy
- `packages/engines/src/claude-code/adapter.ts` — native `--resume` behavior under abnormal CLI exit
- `packages/claude-cli-sdk/src/` — whether `resumeEngineSessionId` survives subprocess crash
- `packages/memory/` — episodic-log → `priorTurns` reconstruction as fallback

Multi-file, multi-package coordination + needs a design pass to pick between native-resume vs. `priorTurns` fallback (or a two-tier strategy). Belongs at `stage: drafting` for design.

## Acceptance criteria

- A simulated CLI crash mid-turn followed by a new `open()` resumes the prior conversation (the model sees prior turns).
- Resume strategy is documented: native `--resume` first, `priorTurns` fallback when native fails.
- A regression test simulates the crash and asserts the resumed session has the prior turn count.

## Anchors

- Adapter native-resume — `packages/engines/src/claude-code/adapter.ts` (search `resumeEngineSessionId`)
- Prior-turns fallback — `packages/engines/src/claude-code/adapter.ts` (search `priorTurns`)
- Session lifecycle — `packages/core/src/services/session-service.ts:125-250`
- SDK `--resume` arg handling — `packages/claude-cli-sdk/src/cli/args.ts`
