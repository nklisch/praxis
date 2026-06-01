---
id: epic-agent-debugging-harness-debug-runbooks-failure-playbooks
kind: story
stage: done
tags: [docs]
parent: epic-agent-debugging-harness-debug-runbooks
depends_on: [epic-agent-debugging-harness-debug-runbooks-skill-shell]
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Failure-specific runbook references

## Scope

Add the concrete progressive-disclosure runbooks for the recurring Praxis
agent-harness failure classes. Each runbook should be operational: first
checks, evidence to gather, commands, likely owners, and next debug step.

## Files

- `.agents/skills/agent-debugging-harness/references/tool-call-leaked-into-chat.md`
- `.agents/skills/agent-debugging-harness/references/tool-dispatch-before-subagent.md`
- `.agents/skills/agent-debugging-harness/references/react-tool-result-crash.md`
- `.agents/skills/agent-debugging-harness/references/ipc-stream-died.md`
- `.agents/skills/agent-debugging-harness/references/subagent-missing-or-stalled.md`
- `.agents/skills/agent-debugging-harness/references/persistence-fk-failure.md`
- `.agents/skills/agent-debugging-harness/references/student-simulation-visual-mismatch.md`

## Acceptance Criteria

- [x] Tool-call leak runbook covers raw `<invoke>` markup and `[object Object]`
      visible chat failures.
- [x] Tool dispatch/sub-agent runbooks cover dispatch exceptions before
      sub-agent launch and missing/stalled sub-agent events.
- [x] React crash runbook covers object rendering failures in tool result
      surfaces.
- [x] IPC stream runbook covers stream start/events/cancel correlation and
      client/desktop owner routing.
- [x] Persistence runbook covers FK/document-scope-style failures and DB
      inspection commands.
- [x] Student simulation runbook covers browser trace, screenshot, DOM,
      console, and result JSON evidence.

## Implementation Notes

- Added seven failure-specific references under
  `.agents/skills/agent-debugging-harness/references/`.
- Each runbook follows the same operational shape: first checks, evidence to
  gather, commands, likely owners, and next debug step.
- Runbooks point at the local debug bundle, replay, student simulation, browser
  trace, DB inspector, and targeted Vitest commands added or standardized by
  this epic.

## Verification

- `find .agents/skills/agent-debugging-harness/references -maxdepth 1 -type f -print | sort`
- `pnpm exec biome check --no-errors-on-unmatched .agents/skills/agent-debugging-harness/references/tool-call-leaked-into-chat.md .agents/skills/agent-debugging-harness/references/tool-dispatch-before-subagent.md .agents/skills/agent-debugging-harness/references/react-tool-result-crash.md .agents/skills/agent-debugging-harness/references/ipc-stream-died.md .agents/skills/agent-debugging-harness/references/subagent-missing-or-stalled.md .agents/skills/agent-debugging-harness/references/persistence-fk-failure.md .agents/skills/agent-debugging-harness/references/student-simulation-visual-mismatch.md`
  - Biome processed 0 files because `.agents/skills` is ignored by repo config.
- `git diff --check`

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Fast-lane story review; implementation recorded file presence,
ignored-path Biome behavior, and diff checks.
