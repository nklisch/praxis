---
id: gate-docs-pattern-ipc-channel-convention-session-active
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: docs
created: 2026-05-23
updated: 2026-05-23
---

# Pattern skill `ipc-channel-convention` shows stale `wrapEnvelope` shape for `praxis.session.active`

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/ipc-channel-convention.md:23-26`
- Code: `packages/desktop/electron/main/session-channel.ts:46-58`

## Current doc text
> `handle("praxis.session.active", wrapEnvelope("praxis.session.active", log, async () => services.session.active()),);`

## Reality
`praxis.session.active` now uses `handleEnvelope` with
`sessionActiveSchema = z.object({ modeId: z.string().optional() }).optional()`
and forwards `opts` to `services.session.active(opts)`.

## Required edit
Update the example to:
```typescript
const sessionActiveSchema = z.object({ modeId: z.string().optional() }).optional();
handle(
  "praxis.session.active",
  handleEnvelope("praxis.session.active", log, sessionActiveSchema, async (opts) =>
    services.session.active(opts),
  ),
);
```
