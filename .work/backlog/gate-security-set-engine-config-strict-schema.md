---
id: gate-security-set-engine-config-strict-schema
kind: story
stage: backlog
tags: [security]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: security
created: 2026-05-12
updated: 2026-05-12
---

# `setEngineConfig` IPC accepts unknown input shapes; the encrypted-blob field is in the public schema

## Severity
Low

## Domain
API Security (IPC)

## Location
`packages/desktop/electron/main/ipc-server.ts:198-202`, `packages/core/src/config/schema.ts:33`, `packages/core/src/config/engine-config.ts:140`

## Evidence
```ts
handle("praxis.config.setEngineConfig", async (_event, config: unknown) => {
  await requireUnlocked();
  // biome-ignore lint/suspicious/noExplicitAny: config shape validated inside service
  return services.config.setEngineConfig(config as any);
});
```

Validation happens inside `ConfigServiceImpl` via `EngineConfigSchema.parse`,
which is fine — but `EngineConfigSchema` declares `apiKeyEncrypted:
z.string().optional()`. A renderer-supplied ciphertext blob passes schema
validation. `writeEngineConfig` destructures it away today, so the field is
silently dropped — but this is defensive coupling between two files. If the
destructure is refactored, a renderer could inject ciphertext that decrypts
to attacker-chosen plaintext under a stolen / mis-rotated key.

## Remediation direction
Move `apiKeyEncrypted` out of the public `EngineConfigSchema` into a
storage-only sub-schema, or `.strict()` the IPC-input schema so unknown /
write-only fields are rejected at parse time. Make the "renderer never writes
the encrypted blob directly" invariant a property of the schema, not of one
downstream destructure.
