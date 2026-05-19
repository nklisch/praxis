---
id: gate-patterns-inconsistency-ipc-envelope-handler-add-handleenvelope
kind: story
stage: review
tags: [refactor, documentation]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: patterns
created: 2026-05-18
updated: 2026-05-18
---

# Add `handleEnvelope` to the `ipc-envelope-handler` pattern skill

## Existing pattern
`.claude/skills/patterns/ipc-envelope-handler.md`

## Drift
The bundle introduces a `handleEnvelope(channel, log, schema, fn)` helper
at `packages/desktop/electron/main/ipc-helpers.ts:54` that composes
`wrapEnvelope + withSchema` and strips the Electron event arg. It is used
in 121 call sites across 19 channel files — now the dominant form for
schema-validated invoke channels.

`wrapEnvelope` remains correct for no-input or no-schema cases (e.g.
simple list endpoints, `services.subAgent.list()`).

## Required edit
- Add a "Preferred form: `handleEnvelope`" subsection to the skill,
  showing the canonical call:
  ```ts
  handleEnvelope("praxis.config.setSelectedEngine", log, SetSelectedEngineSchema,
    async ({ engineId }) => services.config.setSelectedEngine(engineId));
  ```
- Note when to use raw `wrapEnvelope` vs `handleEnvelope` (raw is for
  no-schema endpoints; `handleEnvelope` is the default).
- Update Examples 1 and 2 to the current `config-channel.ts` location and
  to show `handleEnvelope` rather than the manual `wrapEnvelope +
  withSchema` composition.

Note: there is a related gate-docs item
(`gate-docs-ipc-server-extraction-pattern-skill-references`) that fixes the
file-path drift in the same skill; this item is specifically about
introducing `handleEnvelope` as the documented preferred form.

## Implementation notes (2026-05-18)

Read `ipc-helpers.ts:54` to confirm `handleEnvelope`'s exact signature: `handleEnvelope<TIn, TOut>(channel, log, schema: z.ZodType<TIn>, fn: (input: TIn) => Promise<TOut> | TOut)`. Read `config-channel.ts` to identify canonical examples at lines 59–64 (`setSelectedEngine` with `handleEnvelope`) and 66–72 (`engineConfig` with raw `wrapEnvelope`).

Changes made to `.claude/skills/patterns/ipc-envelope-handler.md`:
- Added "Preferred form: `handleEnvelope`" subsection after Rationale, citing `ipc-helpers.ts:54`, showing the canonical call shape, and explaining when to use `handleEnvelope` vs raw `wrapEnvelope`
- Rewrote Example 1 title to "Schema-validated invoke channel (preferred form)" and updated file path from `ipc-server.ts` to `config-channel.ts:59`
- Rewrote Example 2 title to "No-input channel (raw `wrapEnvelope`)" and updated file path from `ipc-server.ts:209` to `config-channel.ts:66`
- Updated Example 4 to show both `handleEnvelope` (from `ipc-helpers.ts:54`) and `wrapEnvelope` signatures side by side with usage guidance
- The Rationale, When to Use, When NOT to Use, and Common Violations sections are unchanged and remain accurate
