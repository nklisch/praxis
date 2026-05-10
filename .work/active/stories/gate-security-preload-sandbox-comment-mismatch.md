---
id: gate-security-preload-sandbox-comment-mismatch
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

# Preload comment claims `sandbox: true`; window is created with `sandbox: false`

## Severity
Low

## Domain
API Security / Documentation drift

## Location
`packages/desktop/electron/preload/index.ts:9` vs
`packages/desktop/electron/main/window.ts:19`

## Evidence

```typescript
// preload/index.ts:9 — comment claims sandbox: true
/** Security: contextIsolation: true, sandbox: true.
 *  Only specific channels are exposed — no raw ipcRenderer. */
```

```typescript
// window.ts:17-19 — window is actually created with sandbox: false
// sandbox: false because electron-vite emits ESM (.mjs) preload, and
// Electron requires CJS preloads when sandbox is true.
sandbox: false,
```

The discrepancy will make the next reviewer think the renderer is sandboxed
when it isn't. `sandbox: false` plus `nodeIntegration: false` plus
`contextIsolation: true` is still safe (the bridge surface is the only
escape), but a future change that, say, lifts `contextIsolation` would be
much more dangerous in an unsandboxed renderer than in a sandboxed one.

## Remediation direction

Either:

(a) Fix the preload comment to match reality (`sandbox: false`, with a
sentence explaining why — ESM preload constraint).

(b) Convert the preload to CJS so `sandbox: true` becomes available and
turn it on.
