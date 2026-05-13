---
id: gate-patterns-inconsistency-subscriber-fanout-filter
kind: story
stage: done
tags: [refactor, documentation]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: patterns
created: 2026-05-12
updated: 2026-05-12
---

# `subscriber-fanout-stream` pattern doc silent on filtered-subscribe variant

## Inconsistency category
existing-pattern-incomplete

## Existing pattern
`.claude/skills/patterns/subscriber-fanout-stream.md`

## Bundle code that revealed the divergence
`packages/desktop/electron/main/subagent-channel.ts:30` — `subscribe(listener, { parentCallId })` introduces a **filtered** subscription. The listener receives only events matching `parentCallId`.

## Nature of divergence
The existing pattern describes unfiltered subscribe-fanout (every listener sees every event). The sub-agent channel's filtered variant is an intentional refinement — used so a renderer subscribed to one parent tool_call only sees that call's sub-agent events — not a bug. But the pattern doc doesn't mention that `subscribe` may take a filter argument.

## Resolution direction
Update `subscriber-fanout-stream.md` to document the optional filter argument:
- Add a "Filtered subscribe" subsection with `subAgentRegistry.subscribe(listener, { parentCallId })` as the canonical example
- Note that the filter is applied at the fanout layer, not pushed into the listener
- Cross-reference how `subagent-channel.ts` uses the filter to scope events to a specific tool_call

Without this update, future channels needing a filter will re-derive it.

## Implementation notes
Pattern-skill edits applied inline as part of the v0.1.1 autopilot doc-drift batch. Snippets rolled forward to match current code.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
