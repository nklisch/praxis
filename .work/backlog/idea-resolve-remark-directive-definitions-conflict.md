---
id: idea-resolve-remark-directive-definitions-conflict
kind: idea
stage: parked
tags: [content, rendering, markdown, design-question]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Resolve `remark-directive` vs `[[def:term]]` parsing conflict

## Brief
Surfaced during `feature-content-renderer-pipeline-step-8-pipeline-wiring` implementation (commit `fae33f8d`). `remark-directive` registers a `:term` syntax extension that parses the `:derivative` inside `[[def:derivative]]` as an inline `textDirective` node, silently eating the term content. The MDAST output becomes `[[def]]` with an empty directive child — the `[[def:term]]` pattern is effectively broken when both plugins are active.

## Current state (interim)
Step-8 excluded `remark-directive` from `REMARK_PLUGINS` to keep `[[def:term]]` working. Consequence: the `::: figure :::` container directive syntax (designed in `feature-content-renderer-pipeline` Unit 4 + the parent epic's agent contract) does NOT parse. The `<Figure>` React component is wired and works when given props directly, but the agent cannot create a figure via markdown — `::: figure {caption="..." verdict="ok"} ... :::` renders as plain text.

## Resolution options
1. **Rewrite `[[def:term]]` to use directive syntax** — `:def[term]` or `:def[term]{...attrs}`. Single parser handles both. Requires updating the agent prompt fragment, the renderer plugin, and all in-flight test fixtures.
2. **Selective directive parsing** — fork or wrap `remark-directive` to only parse `::: container :::` syntax, not `:textDirective`. Possible if the plugin exposes a config; otherwise harder.
3. **Accept the limitation** — figures via tool-call only (the `figure` tool exists in `@praxis/tools`, can emit a `<Figure>` directly without markdown parsing). Document `::: figure :::` as not supported in the agent prompt.

## Recommendation
Option 1 — rewrite to `:def[term]` syntax. Cleaner long-term; one parser handles all extensions. Requires coordinated changes:
- `remark-definitions.ts` plugin updated to match `:def[term]` instead of `[[def:term]]`
- Agent prompt fragment (`question-tool.ts`) updated to teach the new syntax
- Tests updated

## Origin
- Story: `feature-content-renderer-pipeline-step-8-pipeline-wiring` (commit `fae33f8d`)
- Surfaced by agent during integration; documented in story implementation notes.
