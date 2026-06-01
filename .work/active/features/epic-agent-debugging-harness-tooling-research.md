---
id: epic-agent-debugging-harness-tooling-research
kind: feature
stage: drafting
tags: []
parent: epic-agent-debugging-harness
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-31
updated: 2026-05-31
---

# Tooling Research

## Brief

Select the debugging harness's evidence standard and supporting tool stack through current-source research, without locking the epic into a guessed vendor or framework. This feature should compare trace/logging, browser automation, replay, and agent-evaluation options against Praxis's local-first privacy stance, TypeScript monorepo shape, Electron deployment, and existing pino/Vitest/testing-library foundations.

The deliverable is a durable decision record inside this item and any needed `docs/research/` notes, not a production implementation. It should decide what gets built in-house, what existing dependency is enough, and where a new dependency is justified. Downstream features depend on this because they need a stable vocabulary for trace events, failure bundles, replay inputs, and simulation outcomes.

This feature does not implement the trace pipeline, replay runner, or student simulator. It only defines the criteria, researches the options, and records the chosen direction so the implementation features can stay concrete.

## Epic context

- Parent epic: `epic-agent-debugging-harness`
- Position in epic: foundation feature - every implementation feature consumes its tool and evidence decisions.

## Foundation references

- `docs/SPEC.md` - privacy stance, local-first telemetry default, testing stack, and rejected "agent framework as foundation" constraint.
- `docs/ARCHITECTURE.md` - agent harness, engine adapters, transport, and package boundaries.
- `docs/CONTRACT.md` - engine events, tool registry, sub-agent, and IPC contracts.
