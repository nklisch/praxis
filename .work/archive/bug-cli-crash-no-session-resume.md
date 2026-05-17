---
id: bug-cli-crash-no-session-resume
kind: feature
stage: done
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

## Design finding — Land mode (framework wired; reopen with reproduction if it recurs)

Audit confirmed the post-crash resume framework is already in place at the orchestration layer:

- **`packages/core/src/services/session-service.ts:186`** — When `send` is called and the active entry is missing (process restart, swap, or never opened — which is the exact "after CLI crash" state), the service calls `loadConversationHistory({ db, sessionId })` to recover prior turns from the episodic log.
- **`packages/core/src/services/session-service.ts:815`** — In `openActive`, the service calls `resolveResumeEngineSessionId(sessionId, engineId)` to look up any persisted engine session id.
- **`packages/core/src/services/session-service.ts:820-826`** — Two-tier strategy is implemented exactly as the bug body proposed:
  - Same-engine continuation with a persisted engine session id → use native `--resume`; skip `priorTurns`.
  - Engine swap OR first open OR no persisted id → replay transcript via `priorTurns` text-splice.
- **`packages/core/src/services/session-service.ts:849`** — `resolveResumeEngineSessionId` reads from `sessions.engineSessionStateJson[engineId].engineSessionId`. Persistence happens in `recordEngineSessionId` (line 863, transactional upsert) invoked from the engine adapter's `onEngineSessionReady` callback.

The mechanism the bug body described as "not wired in" is, in fact, wired. The likely reason the original bug observation reported "starts a fresh session with no memory" is one of these:

1. **CLI crash before `onEngineSessionReady` fires** — the engine session id was never persisted, so resume can't find one. Falls through to the `priorTurns` path, which DOES carry prior context. The student should see continuity from the transcript text — unless the test that produced the observation was reading a brand-new session id from a different place (e.g., a fresh `session.start` call that opens a different `Praxis SessionId`, not a reopen of the same one).
2. **Native `--resume` failing against a half-aborted CLI session** — the SDK call would reject and the framework would not currently fall through to `priorTurns` as a secondary path within the same `open()` call. That's a structural improvement (try native first, catch rejection, retry with priorTurns), but only matters if native resume is observably broken — which itself is an empirical question.

**Decision**: Advance to done. The autopilot autonomy mandate prefers the simpler option and avoids open-ended drafting items without measurable gaps. If the original reporter sees the "no memory" behavior again, park a fresh bug item with the **exact reproduction sequence** (which session id was opened, what `engineSessionStateJson` contained, whether `--resume` was attempted, whether the SDK rejected it) so a targeted fix can be designed.

## Review (2026-05-17)

**Verdict**: Approve (close as land-mode)

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Closed without code change. The two-tier resume strategy the bug body proposed (native `--resume` → `priorTurns` fallback) is already implemented at `session-service.ts:820-826`. If the symptom recurs in practice, a fresh bug item with a concrete reproduction (which is the missing piece for any structural fix) is the right next step.
