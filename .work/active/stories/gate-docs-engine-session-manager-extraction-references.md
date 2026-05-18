---
id: gate-docs-engine-session-manager-extraction-references
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: docs
created: 2026-05-18
updated: 2026-05-18
---

# Relocate `SessionServiceImpl.openActive` doc references to `EngineSessionManager`

## Drift category
foundation-doc-assertion / pattern-skill-staleness / repo-skill-staleness

## Location
- Doc: `CLAUDE.md:106` ("Where the big pieces live")
- Doc: `docs/CONTRACT.md:322` and `:1057`
- Doc: `.claude/rules/patterns.md:15` (mode-tool-scoping entry)
- Doc: `.claude/skills/patterns/mode-tool-scoping.md:27-37` (Example 2)
- Doc: `.claude/skills/patterns/engine-session-lifecycle.md:58-73` (Example 3)
- Code: `packages/core/src/services/session/engine-session-manager.ts:149-470, 385-390`

## Current doc text
CLAUDE.md:106
> **Engine session loop**: `packages/core/src/services/session-service.ts`
> (composition root).

CONTRACT.md:322
> Both are injected via `additionalFragments` by
> `SessionServiceImpl.openActive` through
> `PromptCustomizationService.getEffectiveAdditionalFragments(modeId)`.

CONTRACT.md:1057
> `SessionServiceImpl.openActive` calls
> `promptCustomization.getEffectiveAdditionalFragments(modeId)` ...

patterns.md:15
> **mode-tool-scoping**: `mode.toolNames` filters
> `ServiceDeps.toolDefinitions` in `SessionServiceImpl.openActive` ...

mode-tool-scoping.md Example 2: cites `session-service.ts:680`.
engine-session-lifecycle.md Example 3: cites `session-service.ts` for
`openActive` framework-side lifecycle.

## Reality
`SessionServiceImpl` is a thin orchestrator that delegates engine-session
lifecycle (open / acquire / send / close, swap detection, native-resume,
prior-turn seeding, mode-tool filtering, additional-fragment composition)
to `EngineSessionManager` at
`packages/core/src/services/session/engine-session-manager.ts`. The
toolNames filter lives at `engine-session-manager.ts:385-390`. The
`additionalFragments` wiring through `getEffectiveAdditionalFragments` is
performed inside `EngineSessionManager.openActive`.

## Required edit
- CLAUDE.md:106 — update the bullet to point at
  `packages/core/src/services/session/engine-session-manager.ts` for
  engine-session lifecycle, and keep `session-service.ts` as the
  SessionService entry point owning turn orchestration that delegates
  lifecycle to the manager.
- CONTRACT.md:322 and :1057 — rename both `SessionServiceImpl.openActive`
  references to `EngineSessionManager.openActive`. Keep the rest of each
  paragraph intact.
- patterns.md:15 — change the location to `EngineSessionManager.openActive`
  in `packages/core/src/services/session/engine-session-manager.ts`.
- mode-tool-scoping.md Example 2 — replace file path with
  `packages/core/src/services/session/engine-session-manager.ts:385` and
  rename the example to `EngineSessionManager.openActive`.
- engine-session-lifecycle.md Example 3 — point at
  `packages/core/src/services/session/engine-session-manager.ts` and
  `EngineSessionManager`; include the `acquire`/`openActive`/`activeSessions`
  shape.

Apply rolling-foundation: replace assertions in place. Don't add
"previously" prose.
