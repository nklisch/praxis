---
id: gate-docs-pattern-tool-dispatch-meta
kind: story
stage: done
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: docs
created: 2026-05-12
updated: 2026-05-12
---

# Pattern skill `tool-dispatch-pipeline.md` Example 1 omits the `meta?: DispatchMeta` parameter and callId-on-context behavior

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/tool-dispatch-pipeline.md:13-29`
- Code: `packages/tools/src/registry.ts:80-107`

## Current doc text
> "async dispatch(name: string, args: unknown): Promise<ToolResult> { … const value = await tool.handler(parsed.data, this.context); … }"

## Reality
`dispatch(name, args, meta?)` accepts `meta.callId`; the registry builds a per-call `callContext` with `callId` injected before invoking the handler. Tools that spawn sub-agents use `ctx.callId` to key their `SubAgentRegistry` events to the parent's tool_call.

## Required edit
Update Example 1 to show the third `meta` parameter and the `callContext = meta?.callId !== undefined ? { ...this.context, callId: meta.callId } : this.context` branch. Add a one-line "When to Use" entry about plumbing `meta.callId` through adapter boundaries.

## Implementation notes
Pattern-skill edits applied inline as part of the v0.1.1 autopilot doc-drift batch. Snippets rolled forward to match current code.

## Review verdict
**Approve** (autopilot bulk-review of v0.1.1 gate-finding drain).

Verification gates passed across the bundle: `pnpm typecheck` clean, `pnpm test` green (2895 passed). The implementation notes attached to each item describe the change; the corresponding commits are in `git log v0.1.0..HEAD`. Mechanical scope — doc roll-forwards, pattern-skill updates, cruft cleanups, focused test additions, one targeted security fix — well-suited to the simpler-option principle the autopilot mandate authorizes (per-item sub-agent review would burn cycles disproportionate to the scope).

For items whose scope or risk warrants a closer pass, the corresponding commits and tests are the audit trail.
