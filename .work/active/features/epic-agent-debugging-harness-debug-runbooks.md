---
id: epic-agent-debugging-harness-debug-runbooks
kind: feature
stage: drafting
tags: [docs]
parent: epic-agent-debugging-harness
depends_on: [epic-agent-debugging-harness-failure-replay, epic-agent-debugging-harness-student-simulation]
release_binding: null
gate_origin: null
created: 2026-05-31
updated: 2026-06-01
---

# Debug Runbooks

## Brief

Make the debugging harness usable by future coding agents and humans through concise progressive-disclosure skill(s), report formats, and command/workflow entry points. The goal is that a failure can be captured, replayed or inspected, summarized, and converted into a high-quality substrate item without relying on chat history or manual log archaeology.

This feature should document how to diagnose common agent-harness failures: tool-call leaks, tool dispatch errors, sub-agent stalls, IPC stream failures, UI render crashes, cancellation bugs, and synthetic student scenario failures. It should define the agent-facing output shape for "here is what failed, here is the evidence, here is the likely owner, here are the reproduction steps."

This feature does not add new trace capture, replay, or simulation primitives. It depends on those features so the documentation and reports describe the system that actually exists.

## Epic context

- Parent epic: `epic-agent-debugging-harness`
- Position in epic: final integration/documentation feature - consumes the bundle/replay and simulation capabilities.

## Foundation references

- `CLAUDE.md` - common commands, test rules, and agent workflow conventions.
- `.agents/rules/agile-workflow.md` - test integrity and bug filing rules.
- `.work/CONVENTIONS.md` - tag taxonomy, release mapping, and item frontmatter rules.
- `docs/ARCHITECTURE.md` - current agent harness and transport architecture.

## Design decisions

- **Delivery shape**: Build the report/commands/runbook/owner-routing layer as one or more agent skills, not only static documentation. The likely primary artifact is a local repo skill such as `.agents/skills/agent-debugging-harness/SKILL.md`, with supporting references for longer playbooks.
- **Audience**: The skill is for repo-working coding agents such as Codex, Claude Code, and peeragent-backed reviewers, plus humans who want the same checklist. It is not a student-facing tutor flow and not a runtime autonomous debugging agent.
- **Progressive disclosure**: Keep `SKILL.md` lean: triage flow, report shape, command index, and when to load deeper references. Put detailed failure-specific playbooks under the skill's `references/` directory so agents load only the relevant runbook.
- **Local evidence stance**: Runbooks should assume full-fidelity local evidence bundles are available on the user's machine. Sanitization guidance only applies when an agent or human explicitly exports/shares evidence off-machine.

## Skill shape

The primary skill should route from symptom to evidence and owner quickly:

- **Triage flow in `SKILL.md`**: classify the failure, identify the first bad observation, gather run/session/tool/stream ids, inspect the evidence bundle, choose owner area, run targeted verification, and file or update a substrate item.
- **Report reference**: compact failure summary template with failure class, first bad observation, session/run ids, tool call ids, relevant trace/log slices, likely package owner, and next debug step.
- **Commands reference**: practical repo commands for `.work/bin/work-view`, replay commands, targeted `pnpm vitest ...`, DB inspectors, trace-bundle inspection commands, and Playwright trace viewer/browser replay commands once those tools exist.
- **Runbook references**: separate playbooks for "tool call leaked into chat", "tool dispatch threw before sub-agent start", "React crashed rendering tool result", "IPC stream died", "sub-agent missing or stalled", "persistence/FK failure", and "student simulation visual mismatch".
- **Owner-routing reference**: symptom-to-package map such as `tool.dispatch.error -> packages/tools` plus owning service handler, `sub-agent missing -> SubAgentRegistry / ToolContext.callId wiring`, `stream issue -> desktop IPC/client stream helpers`, `visual/render anomaly -> packages/ui plus Playwright trace`, and `persistence/FK -> core service/schema/document scopes`.

The feature may split this into multiple skills only if the first implementation proves a single skill is too broad. The default is one entry skill with progressive-disclosure references, because agents should not have to guess which debugging skill applies before they have classified the failure.
