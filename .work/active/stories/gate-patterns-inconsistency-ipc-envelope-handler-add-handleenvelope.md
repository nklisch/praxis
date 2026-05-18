---
id: gate-patterns-inconsistency-ipc-envelope-handler-add-handleenvelope
kind: story
stage: drafting
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
