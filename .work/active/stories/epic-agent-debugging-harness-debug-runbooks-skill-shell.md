---
id: epic-agent-debugging-harness-debug-runbooks-skill-shell
kind: story
stage: done
tags: [docs]
parent: epic-agent-debugging-harness-debug-runbooks
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Agent debugging skill shell

## Scope

Create the entry skill and core progressive-disclosure references for the
agent debugging harness. This story owns the triage flow, compact report shape,
command index, and symptom-to-owner routing map.

## Files

- `.agents/skills/agent-debugging-harness/SKILL.md`
- `.agents/skills/agent-debugging-harness/references/report-shape.md`
- `.agents/skills/agent-debugging-harness/references/commands.md`
- `.agents/skills/agent-debugging-harness/references/owner-routing.md`

## Acceptance Criteria

- [x] Skill activates on common Praxis agent-harness debugging phrases.
- [x] `SKILL.md` stays concise and links report, command, owner-routing, and
      failure-runbook references.
- [x] Report reference includes failure class, first bad observation, ids,
      artifacts/log slices, likely owner, and next debug step.
- [x] Commands reference includes work-view, debug bundle/replay, student
      simulation, browser trace, DB inspector, and targeted test commands.
- [x] Owner-routing reference covers tool dispatch, sub-agent, IPC/stream,
      UI/render, persistence/FK, and student-simulation symptoms.

## Implementation Notes

- Added `.agents/skills/agent-debugging-harness/SKILL.md` with activation
  phrases for tool-call leaks, tool dispatch errors, sub-agent stalls, IPC
  failures, UI crashes, persistence/FK failures, course-create drafting
  failures, and student-simulation/browser mismatches.
- Added progressive-disclosure references for compact report shape, practical
  commands, and owner routing.
- `SKILL.md` links the failure-specific runbook references that the next story
  will fill in.

## Verification

- `find .agents/skills/agent-debugging-harness -maxdepth 2 -type f -print | sort`
- `pnpm exec biome check --no-errors-on-unmatched .agents/skills/agent-debugging-harness/SKILL.md .agents/skills/agent-debugging-harness/references/report-shape.md .agents/skills/agent-debugging-harness/references/commands.md .agents/skills/agent-debugging-harness/references/owner-routing.md`
  - Biome processed 0 files because `.agents/skills` is ignored by repo config.
- `git diff --check`

## Review (2026-06-01)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Fast-lane story review; implementation recorded file presence,
ignored-path Biome behavior, and diff checks.
