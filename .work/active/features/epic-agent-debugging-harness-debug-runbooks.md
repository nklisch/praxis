---
id: epic-agent-debugging-harness-debug-runbooks
kind: feature
stage: review
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

## Architectural Choice

### Option A: Static documentation only

Write a `docs/` guide with failure classes, commands, and owner maps. This is
easy to read manually, but agents will not reliably discover or progressively
load the right section during an active debugging turn.

### Option B: Multiple narrow skills

Create separate skills for tool dispatch, IPC, UI rendering, persistence, and
simulation failures. This optimizes for small prompts after classification, but
it forces agents to choose the right skill before they have triaged the symptom.

### Option C: One entry skill with progressive-disclosure references

Create `.agents/skills/agent-debugging-harness/SKILL.md` as the single
activation point. Keep it short: classify, gather evidence, choose the owner,
run targeted commands, and load deeper references only for the observed failure
class.

**Chosen**: Option C. It matches the user's direction that runbooks should be
skills with progressive disclosure. It also fits the repo's existing skill
layout and avoids making agents guess between many debugging skills before they
know whether the symptom is tool dispatch, renderer, IPC, persistence, or
simulation.

## Design Decisions

- **Skill count**: one entry skill for v1 — split only after real usage proves a
  specific runbook is too large or has a distinct activation boundary.
- **Evidence stance**: no redaction requirements in local runbooks; all evidence
  is assumed to stay on the user's machine unless an explicit export/share step
  says otherwise.
- **Audience**: coding agents working in this repository first; humans can use
  the same command/reference files, but the activation text is optimized for
  agents such as Codex and Claude Code.
- **Scope boundary**: this feature does not add new tracing, replay, or
  simulation primitives. It teaches agents how to use the primitives already
  built by trace-correlation, failure-replay, and student-simulation.

## Implementation Units

### Unit 1: Entry Skill, Report Shape, Commands, And Owner Routing

**Story**: `epic-agent-debugging-harness-debug-runbooks-skill-shell`

**Files**:

- `.agents/skills/agent-debugging-harness/SKILL.md`
- `.agents/skills/agent-debugging-harness/references/report-shape.md`
- `.agents/skills/agent-debugging-harness/references/commands.md`
- `.agents/skills/agent-debugging-harness/references/owner-routing.md`

```md
---
name: agent-debugging-harness
description: >
  Use when debugging Praxis agent-harness failures: tool calls leaked into chat,
  tool dispatch errors, sub-agent stalls, IPC stream failures, renderer crashes,
  persistence/FK failures, or student-simulation/browser mismatches. Guides the
  agent through local evidence capture, replay/simulation commands, owner
  routing, and substrate item filing.
---

# Agent Debugging Harness

1. Classify the failure.
2. Identify the first bad observation.
3. Gather run/session/turn/call/stream/renderer ids.
4. Inspect the smallest local evidence bundle that explains the failure.
5. Route to the likely owner package and targeted verification command.
6. File or update a substrate item with the compact report.
```

**Implementation Notes**:

- `SKILL.md` should stay small enough to auto-load without crowding the model.
- The report reference defines the compact failure summary shape: failure class,
  first bad observation, run/session/tool/stream ids, trace/log slices, artifacts,
  likely owner, and next debug step.
- The command reference lists exact local commands: `.work/bin/work-view`,
  `pnpm debug:bundle`, `pnpm debug:replay`, `pnpm student-sim:*`, targeted
  `pnpm vitest ...`, DB inspectors, and Playwright trace viewer commands.
- The owner-routing reference maps symptoms to code areas:
  `tool.dispatch.error -> packages/tools`, sub-agent stalls ->
  `SubAgentRegistry` / `ToolContext.callId`, stream issues -> desktop IPC/client
  stream helpers, visual anomalies -> `packages/ui` plus Playwright trace, and
  FK/persistence -> core services/schema/document scopes.

**Acceptance Criteria**:

- [ ] Skill activates on common Praxis agent-harness debugging phrases.
- [ ] `SKILL.md` points to report, commands, owner-routing, and runbook
      references instead of embedding all details inline.
- [ ] Report shape includes failure class, first bad observation, ids,
      artifacts/log slices, likely owner, and next debug step.
- [ ] Commands reference includes bundle, replay, student simulation, browser
      replay, DB inspection, work-view, and targeted test commands.
- [ ] Owner routing covers tool dispatch, sub-agent, IPC/stream, UI/render,
      persistence/FK, and student simulation symptoms.

### Unit 2: Failure-Specific Runbook References

**Story**: `epic-agent-debugging-harness-debug-runbooks-failure-playbooks`

**Files**:

- `.agents/skills/agent-debugging-harness/references/tool-call-leaked-into-chat.md`
- `.agents/skills/agent-debugging-harness/references/tool-dispatch-before-subagent.md`
- `.agents/skills/agent-debugging-harness/references/react-tool-result-crash.md`
- `.agents/skills/agent-debugging-harness/references/ipc-stream-died.md`
- `.agents/skills/agent-debugging-harness/references/subagent-missing-or-stalled.md`
- `.agents/skills/agent-debugging-harness/references/persistence-fk-failure.md`
- `.agents/skills/agent-debugging-harness/references/student-simulation-visual-mismatch.md`

```md
# <Failure Class>

## First Checks
<smallest observations that distinguish this failure>

## Evidence To Gather
<ids, bundle files, logs, DB tables, browser artifacts>

## Commands
<copy-pasteable repo commands>

## Likely Owners
<package/service/component routing>

## Next Debug Step
<what the agent should do after evidence confirms the class>
```

**Implementation Notes**:

- Each runbook should be short and operational. Avoid tutorial prose.
- Runbooks must point to existing commands and files introduced by this epic:
  trace bundles, replay, student simulation CLI, browser Playwright traces, and
  focused tests.
- Runbooks should explicitly say when a symptom is likely a product bug that
  should become a substrate item rather than an issue to paper over in tests.

**Acceptance Criteria**:

- [ ] Tool-call leak runbook covers raw `<invoke>` markup and `[object Object]`
      visible chat failures.
- [ ] Tool dispatch/sub-agent runbooks cover dispatch exceptions before
      sub-agent launch and missing/stalled sub-agent events.
- [ ] React crash runbook covers object rendering failures in tool result
      surfaces.
- [ ] IPC stream runbook covers stream start/events/cancel correlation and
      client/desktop owner routing.
- [ ] Persistence runbook covers FK/document-scope-style failures and DB
      inspection commands.
- [ ] Student simulation runbook covers browser trace, screenshot, DOM, console,
      and result JSON evidence.

### Unit 3: Skill Validation And Trigger Coverage

**Story**: `epic-agent-debugging-harness-debug-runbooks-skill-validation`

**Files**:

- `tests/agent-debugging-harness-skill.test.ts`

```ts
describe("agent debugging harness skill", () => {
  it("keeps all referenced runbook files present", () => {});
  it("keeps trigger text aligned with common failure symptoms", () => {});
  it("keeps command and owner-routing references linked from SKILL.md", () => {});
});
```

**Implementation Notes**:

- Keep this as a static filesystem test; do not add a skill runtime.
- Validate the presence of the entry skill and every referenced file.
- Assert that the skill/refs contain the high-signal command names and symptom
  phrases agents need to discover the correct runbook.

**Acceptance Criteria**:

- [ ] Test fails if `SKILL.md` links a missing reference.
- [ ] Test fails if core command references disappear.
- [ ] Test fails if common symptom triggers are absent from the skill entry.

## Implementation Order

1. `epic-agent-debugging-harness-debug-runbooks-skill-shell`
2. `epic-agent-debugging-harness-debug-runbooks-failure-playbooks`
3. `epic-agent-debugging-harness-debug-runbooks-skill-validation`

## Testing

- Static Vitest coverage in `tests/agent-debugging-harness-skill.test.ts` for
  reference links, command mentions, owner-routing mentions, and trigger phrases.
- Focused Biome check on the skill files, references, and validation test.
- `pnpm typecheck` to keep the root test and scripts surface clean.

## Risks

- **Skill bloat**: a long `SKILL.md` would waste context. Mitigate by keeping
  detailed playbooks in `references/` and loading only the matching failure
  class.
- **Stale commands**: command names can drift as the harness changes. Mitigate
  with static tests that check high-signal command names and reference links.
- **Over-broad activation**: a debugging skill that triggers on every bug report
  would be noisy. Mitigate with a description focused on agent-harness symptoms,
  not general product debugging.

## Children Complete (2026-06-01)

All three child stories reached `done`: skill shell, failure-specific playbook
references, and static validation coverage. Feature is ready for review.
