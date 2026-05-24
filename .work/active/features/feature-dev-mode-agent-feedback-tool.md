---
id: feature-dev-mode-agent-feedback-tool
kind: feature
stage: drafting
tags: [dev, observability, dx]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Dev-mode agent feedback tool: the agent reports tool/prompt issues back to us

## Brief
Net-new dev-only capability: a `dev.report_issue` (or similar) tool registered with every Praxis agent when the desktop runs in dev mode, paired with a dev-mode prompt-fragment injection that instructs the agent to proactively use the tool to surface confusing affordances. Captured reports land in a dev-side review surface so the developer can act on them between turns. Strips out in production builds.

The model knows what bad tool ergonomics feel like better than we do — confusing tool descriptions, contradictory system-prompt fragments, missing tools it expected, broken results, ambiguous instructions, dead-end task framings — and right now there's no channel for it to tell us. This feature is that channel.

## Three pieces (feature-design will likely decompose into 3 child stories)
1. **The `dev.report_issue` tool** — registered in the tool registry only when running in dev mode. Schema accepts: issue kind (confusing-tool / contradictory-prompt / missing-tool / broken-result / can't-execute / other), free-form description, optional reference to a specific tool name or prompt-fragment id, optional severity. Handler persists to whatever review surface piece (3) chooses.
2. **Dev-mode prompt fragment** — env-gated prompt fragment composed into every agent's system prompt during dev runs only. Tells the agent: "you are running in a development environment", lists the `dev.report_issue` tool with usage guidance, instructs the agent to use it proactively when something is unclear rather than guessing or failing silently.
3. **Dev-side review surface** — where reports land. Three plausible shapes that feature-design needs to decide between: (a) a new DB table + a UI panel in the configure surface; (b) a structured log appended to a `dev-reports.jsonl` file; (c) reports surfaced inline in the chat tab as system messages tagged "dev". Each has different review ergonomics; the choice is a feature-design call.

## Production-safety contract
The tool registration and the prompt fragment are both env-gated (`process.env.NODE_ENV === "development"` or equivalent — `import.meta.env.DEV` for Vite-bundled surfaces, gated at registry-build time for engine adapters). Production builds must show no trace of either — no tool exposed to user-facing agents, no dev-mode framing in their prompt. Feature-design should specify the gating discipline and a test that verifies the production registry/prompt are unchanged when the gate is off.

## Source idea
`idea-dev-mode-agent-feedback-tool` (parked 2026-05-24).

## Strategic decisions
None pre-locked — feature-design handles them all. Pre-decomposition is the only thing pinned (3 pieces above).
