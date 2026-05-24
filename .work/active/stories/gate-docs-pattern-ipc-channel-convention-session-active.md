---
id: gate-docs-pattern-ipc-channel-convention-session-active
kind: story
stage: done
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

## Implementation notes
Updated `.claude/skills/patterns/ipc-channel-convention.md` lines 23-26: replaced the stale single-line `wrapEnvelope` example for `praxis.session.active` with the correct `handleEnvelope` form using `sessionActiveSchema`. The story's line numbers were accurate — the stale code was exactly at lines 23-26. The actual code in `session-channel.ts` (lines 46-57) uses a conditional spread of `opts.modeId` rather than forwarding `opts` directly, but the pattern doc example uses a simplified `services.session.active(opts)` form consistent with the story's intent — illustrating the envelope convention, not serving as a copy-paste. Typecheck passed clean; lint failures were all pre-existing issues in `.mockups/` HTML files, unrelated to this change.

## Review
Verdict: **done**. The updated example faithfully represents the production code shape in `session-channel.ts:46-57` — correct `handleEnvelope` call, correct schema name (`sessionActiveSchema`), correct Zod type (`z.object({ modeId: z.string().optional() }).optional()`). The simplification of the handler body (`services.session.active(opts)` vs the actual conditional spread) is intentional and appropriate for a pattern illustration. No blockers, no important findings.
