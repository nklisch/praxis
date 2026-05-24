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

## Design decisions
*(captured 2026-05-24 via `feature-design --only-questions --all`. These lock in directional choices so the full design pass inherits them.)*

- **No UI surface**: Reports land as files only. The goal is a tighter loop of improving the harness — agents (Claude Code etc) read the report files directly between turns to triage. No DB table, no UI panel, no inline-in-chat system messages. The "dev-side review surface" question is closed: the file system *is* the review surface.
- **Output target**: `.praxis/dev-reports/<ISO-timestamp>-<slug>.md` — one markdown file per report. Filename example: `2026-05-24T14-32-19-confusing-tool-description.md`. Body is the report rendered as frontmatter + markdown sections. Easy to read with `Read`, easy to grep, easy to delete individually after acting on them. An `INDEX.md` is regenerated on each report write listing all current reports for quick scanning.
- **Tool schema (minimally structured)**: User intent: "keep it pretty minimally structured, it's just an escape hatch to allow us to have agent communication outside of the system." Required: `kind` (enum: `confusing-tool` / `contradictory-prompt` / `missing-tool` / `broken-result` / `cant-execute` / `other`) + `summary` (one-line). Optional: `severity` (`low`/`med`/`high`), `tool_ref` (tool name being criticized), `fragment_ref` (prompt-fragment id being criticized), `details` (long-form markdown). No enforcement that a `tool_ref` OR `fragment_ref` must be present — the agent decides whether it has a concrete target.
- **Production-safety gating**: Single source of truth — `process.env.PRAXIS_DEV === 'true'` checked at registry-build time. If false, neither the tool nor the dev-mode prompt fragment is constructed. Dedicated env var (not NODE_ENV) so it's intentional, not accidentally inherited from CI/staging. A test verifies that building the tool registry + composing the system prompt with `PRAXIS_DEV` unset produces zero `dev.*` tools and zero dev-mode prompt text.
- **Prompt fragment scope**: One global fragment composed into every agent's system prompt in dev mode. Tells the agent: "you're in dev; use `dev.report_issue` when something is unclear / contradictory / missing / broken — don't guess or fail silently". Uniform across all modes. One place to maintain. No per-mode tuning.
- **Tool name**: `dev.report_issue` (provisional — the `dev.*` namespace clearly signals the env-gating to anyone reading the registry).

## Mockups
No UI surface — no mocks. Documented for clarity: this feature deliberately produces no visual artifact.
