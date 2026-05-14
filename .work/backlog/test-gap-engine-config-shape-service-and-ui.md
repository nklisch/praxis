---
id: test-gap-engine-config-shape-service-and-ui
created: 2026-05-14
tags: [tests, security]
---

The `engine-config-shape` story (under
`epic-security-hardening-round-2-ipc-boundary`) declared a new test file
`packages/core/src/services/__tests__/config-service.engine-shape.test.ts`
in its acceptance criteria, but the implementation extended
`packages/core/src/__tests__/engine-config.test.ts` instead. The schema
side of the story (strict rejection of `apiKeyEncrypted`, stored-schema
acceptance) is covered there, but the service-layer behavior is not:

- `ConfigServiceImpl.engineConfig()` returning `hasApiKey: true` iff a
  non-empty key resolves (stored or env-override).
- `ConfigServiceImpl.engineConfig()` response object not having an
  `apiKey` property (Object-key absence assertion).
- `ConfigServiceImpl.revealApiKey()` returning the decrypted key when
  present, `null` when none stored.
- `ConfigServiceImpl.setEngineConfig()` preserve-on-undefined,
  clear-on-empty-string, replace-on-non-empty merge semantics.

UI-side, `packages/ui/src/__tests__/settings-route.test.tsx` has no
test for the new "Add" vs "Edit" affordance, the `revealApiKey()`
call on Edit click, or the form's behavior when `hasApiKey` flips.

Add a focused `config-service.engine-shape.test.ts` covering the four
service bullets, plus a settings-route assertion that clicking "Edit"
calls `revealApiKey()`.

Nit while in the file: `defaultConfig: EngineConfigSnapshot = { engineId }`
in `settings-route.test.tsx` is missing the now-required `hasApiKey`
field — tests pass only because the package tsconfig excludes test files
from typecheck.
