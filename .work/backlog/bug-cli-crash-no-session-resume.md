---
id: bug-cli-crash-no-session-resume
created: 2026-05-13
tags: [bug]
---

When the Claude CLI subprocess crashes mid-session (observed via the per-turn timeout firing, but likely applies to any abnormal exit), starting a new conversation doesn't resume the prior engine session — it starts a fresh one with no memory of what came before. The adapter has a native-resume path (`resumeEngineSessionId` → CLI `--resume` flag) and a `priorTurns` text-splice fallback for cross-engine continuity, but neither appears to be wired in for the post-crash case. Worth tracing: does the session store retain the engine session id after a crash, does `SessionService` attempt resume on the next `open()`, and does the CLI's `--resume` actually work against a half-aborted session, or do we need to fall back to `priorTurns` reconstruction from the episodic log.
