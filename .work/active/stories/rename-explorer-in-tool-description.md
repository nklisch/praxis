---
id: rename-explorer-in-tool-description
kind: story
stage: implementing
tags: [cleanup]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Rename "bootstrap explorer" residual in `use_canonical_pack` tool description

## Brief

The 5-step Explorer → Drafter / bootstrap → course-create rename swept all
code, file names, tool names, mode ids, and foundation docs. The followup
comment sweep (`cleanup-stale-explorer-comments-sweep`, commit `3a85346`)
caught all JSDoc/comment residuals.

One **runtime string** survived both passes:

- `packages/tools/src/course/use-canonical-pack.ts:25` — `description:` string
  literal on a tool definition. Contains "running the bootstrap explorer".
  This string is sent to the LLM at runtime as the tool's description, so
  editing it is a wire-level (model-facing) change rather than a comment edit.

Because the change is model-facing, it warrants its own scoped item with a
proper review — a tool description is part of the prompt surface, and any
phrasing shift may subtly alter how the model selects/uses the tool.

## Implementation plan

1. Rewrite the description to use "drafter" / "course-create" phrasing.
2. Confirm no other tool descriptions retain stale "explorer" / "bootstrap"
   phrasing — full audit grep across `packages/tools/src/*/`.
3. Spot-check one or two drafter/configurator sessions after the rename to
   verify the tool is still selected as expected.
