---
id: epic-agent-debugging-harness-tooling-research-current-source-survey
kind: story
stage: implementing
tags: [docs]
parent: epic-agent-debugging-harness-tooling-research
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-31
updated: 2026-05-31
---

# Current-source tooling survey

## Scope

Research the debugging harness's candidate tooling against official sources and Praxis constraints. The output is `docs/research/agent-debugging-tooling.md`, not production code.

## Implements

Feature unit 1: current-source tooling survey.

## Files

- `docs/research/agent-debugging-tooling.md`
- `.work/active/features/epic-agent-debugging-harness-tooling-research.md` if a short status/link note is useful after the doc exists.

## Acceptance Criteria

- [ ] `docs/research/agent-debugging-tooling.md` exists with criteria, candidate matrix, and recommendation summary.
- [ ] Every external-tool row includes an official-source link and a dated/accessed note.
- [ ] The survey compares logging/tracing, browser automation, replay-oriented artifacts, and agent-evaluation/observability options.
- [ ] The survey identifies what to build in-house, what existing Praxis dependencies already cover, and where a new dependency is justified or deferred.
- [ ] The survey does not recommend any default behavior that exports prompts, screenshots, student data, or traces off-device.

## Notes

Use official docs or first-party repos for tooling claims. Start with current pino/Vitest/Praxis logger behavior from the repo, Playwright/Vitest Browser Mode docs for browser traces, OpenTelemetry JavaScript docs for trace/export vocabulary, and Phoenix/Langfuse/Braintrust docs for agent observability/eval reference points.
