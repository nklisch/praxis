---
id: epic-ui-redesign-ground-up-chat-workspace-tool-call-disclosure
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-chat-workspace
depends_on: [epic-ui-redesign-ground-up-design-system-token-swap]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Tool-call rendering — `<details>` one-line disclosure

## Scope

Convert tool-call rendering in chat messages to a `<details>` one-line
disclosure pattern: verdict glyph + tool name + result preview +
chevron. Expands to show full input/output.

(Separate from
`epic-backend-fills-for-redesign-drafter-configurator-chat-tool-call-entry`
which adds the ↶ revert affordance for authoring tools. This story
covers the generic disclosure for all tools in chat surfaces.)

## Implementation steps

1. New `packages/ui/src/components/tool-call-disclosure.{tsx,module.css}`
   wrapping the `<details>` element.
2. Edit `Message` to dispatch tool-call render to the disclosure.
3. Verdict glyph derived from tool result (✓ on ok, ⊘ on error, …
   on running).
4. Tests cover render + expand/collapse.
5. Quality checks green.

## Acceptance criteria

- [ ] Tool calls render as one-line disclosures in chat.
- [ ] Expand shows full I/O.
- [ ] Verdict glyph reflects state.
- [ ] All quality checks green.
