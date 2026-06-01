---
id: epic-agent-debugging-harness-tooling-research-evidence-standard
kind: story
stage: done
tags: [docs]
parent: epic-agent-debugging-harness-tooling-research
depends_on: [epic-agent-debugging-harness-tooling-research-current-source-survey]
release_binding: null
gate_origin: null
created: 2026-05-31
updated: 2026-05-31
---

# Evidence standard and bundle vocabulary

## Scope

Define the debugging harness evidence standard inside the feature item. This story decides the required, optional, and out-of-scope evidence categories that downstream trace-correlation, failure-replay, student-simulation, and runbook features will consume.

## Implements

Feature unit 2: evidence standard and bundle vocabulary.

## Files

- `.work/active/features/epic-agent-debugging-harness-tooling-research.md`

## Acceptance Criteria

- [x] The feature item contains a `## Evidence standard` section with required/optional/out-of-scope evidence fields.
- [x] The standard maps each evidence field to a downstream consumer and a redaction/retention policy.
- [x] The standard explicitly covers the motivating failures: raw tool-call markup in chat, `course.start_drafting` FK failure before sub-agent launch, and React crash on structured tool summary object rendering.
- [x] The standard identifies which fields are stable enough for downstream implementation and which remain research notes.
- [x] Any TypeScript sketch follows Praxis discriminator conventions: `type` for streamed events and `kind` for stored object variants.

## Notes

Align the vocabulary with `EngineEvent`, `ToolContext.callId`, `SubAgentRegistry`, pino child bindings, IPC stream IDs, and existing session IDs. Default to redaction unless the user explicitly enables prompt logging.

## Implementation notes

- Files changed: `.work/active/features/epic-agent-debugging-harness-tooling-research.md`, `.work/active/stories/epic-agent-debugging-harness-tooling-research-evidence-standard.md`.
- Tests added: none; substrate/docs-only story.
- Verification: `git diff --check`.
- Discrepancies from design: none.
- Adjacent issues parked: none.

## Review (2026-05-31)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Fast-lane substrate review. Implementation notes and completed acceptance criteria are present; the evidence standard covers required/optional/out-of-scope fields and the motivating failures.
