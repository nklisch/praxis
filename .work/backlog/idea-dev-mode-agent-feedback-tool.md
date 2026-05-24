---
id: idea-dev-mode-agent-feedback-tool
created: 2026-05-24
tags: [dev, observability, dx]
---

Add a dev-environment-only `dev.report_issue` (or similar) tool that every Praxis agent is given when running in dev mode — usable to report runtime issues, give feedback on tool ergonomics, call out confusing prompts, flag missing or broken affordances, or note inability to execute a task. Paired with a dynamic prompt-fragment injection (also dev-only) telling the agent it's running in a dev environment, instructing it to proactively surface anything that's confusing or under-specified via the report tool — confusing tool descriptions, contradictory system-prompt fragments, missing tools it expected, broken results, etc. Captured reports land in a dev-side queue (DB table + UI panel, or just append to a structured log) so the developer can review them between turns. The whole thing strips out in production builds (env-gated tool registration + env-gated fragment) so there's no risk of leaking the channel into user-facing agents. Together this turns the agent into a continuous-feedback peer during development — the model knows what bad tool ergonomics feel like better than we do, and right now there's no channel for it to tell us.
