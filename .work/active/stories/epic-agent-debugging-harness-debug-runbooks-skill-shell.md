---
id: epic-agent-debugging-harness-debug-runbooks-skill-shell
kind: story
stage: implementing
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

- [ ] Skill activates on common Praxis agent-harness debugging phrases.
- [ ] `SKILL.md` stays concise and links report, command, owner-routing, and
      failure-runbook references.
- [ ] Report reference includes failure class, first bad observation, ids,
      artifacts/log slices, likely owner, and next debug step.
- [ ] Commands reference includes work-view, debug bundle/replay, student
      simulation, browser trace, DB inspector, and targeted test commands.
- [ ] Owner-routing reference covers tool dispatch, sub-agent, IPC/stream,
      UI/render, persistence/FK, and student-simulation symptoms.
