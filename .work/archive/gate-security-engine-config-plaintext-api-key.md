---
id: gate-security-engine-config-plaintext-api-key
kind: story
stage: backlog
tags: [security]
parent: null
depends_on: []
release_binding: null
gate_origin: security
created: 2026-05-12
updated: 2026-05-12
---

# `praxis.config.engineConfig` returns decrypted `apiKey` plaintext to the renderer

## Severity
Low

## Domain
Secrets & Configuration / Data Protection

## Location
- `packages/desktop/electron/main/ipc-server.ts:193-196`
- `packages/core/src/services/config-service.ts:49-56, 80-88`

## Evidence
```ts
// ipc-server.ts:193
handle("praxis.config.engineConfig", async () => {
  await requireUnlocked();
  return services.config.engineConfig();
});

// config-service.ts:80 toSnapshot
return {
  engineId: cfg.engineId,
  ...(cfg.apiKey !== undefined && { apiKey: cfg.apiKey }),  // plaintext
  ...
};
```

The renderer needs the value to populate the password input on the settings
tab, so this is by-design — but the surface is wider than necessary. Any
renderer code (and any future XSS via markdown / tldraw / react-flow / WebView
quirks) can read the key. The encrypt-at-rest work hardens **durable**
storage, not **in-memory** exposure.

## Remediation direction
Return `{ engineId, model, hasApiKey: boolean }` to the renderer for display.
Add a `praxis.config.engineConfig.reveal` channel that requires
`requireUnlocked` AND an explicit user gesture / confirm, and returns the
decrypted value once for editing. Narrows the XSS-blast-radius for the
highest-value secret in the app.
