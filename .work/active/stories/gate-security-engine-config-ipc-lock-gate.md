---
id: gate-security-engine-config-ipc-lock-gate
kind: story
stage: implementing
tags: [security]
parent: feature-release-v0.1.0-security-findings
depends_on: []
release_binding: v0.1.0
gate_origin: security
created: 2026-05-10
updated: 2026-05-10
---

# Engine config (incl. API key) is readable/writable over IPC with no lock guard

## Severity
Medium

## Domain
API Security / Authorization

## Location
`packages/desktop/electron/main/ipc-server.ts:192-199`

## Evidence

```typescript
handle("praxis.config.engineConfig", async () => {
  return services.config.engineConfig();   // returns { apiKey, engineId, ... } plaintext
});
handle("praxis.config.setEngineConfig", async (_event, config: unknown) => {
  return services.config.setEngineConfig(config as any);
});
```

Compare `praxis.author.*` handlers above (lines 528-770) which all gate on
`await requireUnlocked()`. The engine config has no such gate. The lock
surface promises to lock the configure surface; the API key is part of that
surface. `ConfigServiceImpl.toSnapshot` (`packages/core/src/services/config-service.ts:80-88`)
explicitly includes `apiKey` in the returned snapshot. Any IPC consumer that
reaches the renderer (today: only the bundled UI; tomorrow: any future
surface) can read or replace the key without the lock standing in the way.

## Remediation direction

Wrap `praxis.config.engineConfig` and `praxis.config.setEngineConfig` in
`requireUnlocked()` (consistent with the `praxis.author.*` pattern).

Alternatively, return a redacted snapshot from `engineConfig()`
(`apiKey: undefined` when set) and add a separate
`praxis.config.engineConfig.withSecret` channel that requires unlock. This
is the same pattern most desktop apps use: read of secret-bearing config
requires re-auth.
