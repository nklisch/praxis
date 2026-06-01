---
id: epic-agent-debugging-harness-debug-runbooks-skill-validation
kind: story
stage: review
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

- [x] Test fails if `SKILL.md` links a missing reference.
- [x] Test fails if core command references disappear.
- [x] Test fails if common symptom triggers are absent from the skill entry.

## Implementation Notes

- Added `tests/agent-debugging-harness-skill.test.ts`.
- The test validates linked `references/*.md` files, common symptom trigger
  phrases, high-signal command names, and owner-routing package mentions.
- Reference matching deduplicates repeated links and normalizes whitespace so
  YAML/frontmatter wrapping does not create false failures.

## Verification

- `pnpm vitest run tests/agent-debugging-harness-skill.test.ts`
- `pnpm exec biome check tests/agent-debugging-harness-skill.test.ts`
- `pnpm typecheck`
- `git diff --check`
