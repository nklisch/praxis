---
id: epic-agent-debugging-harness-debug-runbooks-skill-validation
kind: story
stage: implementing
tags: [docs]
parent: epic-agent-debugging-harness-debug-runbooks
depends_on: [epic-agent-debugging-harness-debug-runbooks-failure-playbooks]
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
---

# Agent debugging skill validation

## Scope

Add a static validation test that keeps the agent-debugging-harness skill
discoverable and internally linked as future runbooks evolve.

## Files

- `tests/agent-debugging-harness-skill.test.ts`

## Acceptance Criteria

- [ ] Test fails if `SKILL.md` links a missing reference.
- [ ] Test fails if core command references disappear.
- [ ] Test fails if common symptom triggers are absent from the skill entry.
