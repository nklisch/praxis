---
id: idea-tutor-structured-questions-via-custom-mcp
kind: story
stage: drafting
tags: [feature, tutor-ux]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Support tutor-initiated structured questions (replacement for AskUserQuestion)

## Why

Today the tutor blanket-can't ask the student multi-choice questions. The Claude
Code built-in `AskUserQuestion` used to be visible to the model but failed
("Couldn't finish askuserquestion." interstitial) because Praxis runs the CLI
without a TTY and without `toolHandlers` — fixed by
`story-fix-block-claude-code-builtins-from-tutor`, which hides built-ins from
the model entirely (`tools: "none"`).

That fix solves the failure mode but leaves a behavior gap: the model *should*
be able to ask the student "use the canonical pack, use the textbook, or both?"
with a structured choice surface, instead of guessing with a "going with the
recommended path" text apology.

## What

Register a first-party Praxis tool — call it `ask_student_question` (working
name) — that:

1. Has the same input shape as Claude Code's built-in `AskUserQuestion` (one or
   more questions with headers, multi/single select, label+description options).
   Reference: `packages/claude-cli-sdk/src/cli/args.ts` and the upstream
   `@nklisch/claude-cli-sdk` `tools/builtin-schemas.ts` (`/home/nathan/dev/claude-cli-sdk/src/tools/builtin-schemas.ts`)
   which already encodes the canonical shape.
2. Renders in the chat as a structured quick-check surface (reuse
   `quick_check.*` tooling — these already round-trip a card UI and return the
   student's choice).
3. Returns the student's answer to the tutor as a tool result the model can
   read.

This is a feature, not a fix. Touches: a new tool in
`packages/tools/src/pedagogy/` (or `tools/dialog/`), the tool registry, mode
toolName lists where it's allowed (bootstrap, teach), a prompt fragment telling
the model "use `ask_student_question` when you need a decision from the
student", and a UI renderer that wraps the existing quick-check card pattern.

## Inspiration

The upstream `@nklisch/claude-cli-sdk` (v1.1.4+, newer internals than our
in-tree fork at `packages/claude-cli-sdk/`) introduces a `Tools.intercept(name,
handler)` builder that automatically:

- Denies the built-in name on the CLI side
- Registers an MCP replacement at `mcp__sdk__<name>` with the same schema
- Appends a system-prompt mapping `AskUserQuestion → mcp__sdk__AskUserQuestion`
  so the model finds the replacement under its familiar name

We don't need to adopt the whole upstream builder API to get this behavior — we
already have `tools.custom` (`packages/claude-cli-sdk/src/types/options.ts:106`)
that can register custom MCP tools. The pattern to mimic is:

- Define a custom tool with the AskUserQuestion schema shape
- Inject via `tools.custom` on the Claude Code engine's `createConversation`
- Add a system-prompt fragment telling the tutor to use it

## Origin

Surfaced during `story-fix-block-claude-code-builtins-from-tutor`. The fix
intentionally stops at "no broken interstitial"; this story carries the
"actually let the tutor ask" capability forward.
