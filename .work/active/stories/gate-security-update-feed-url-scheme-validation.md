---
id: gate-security-update-feed-url-scheme-validation
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

# Update-feed `downloadUrl` accepts dangerous URL schemes

## Severity
High

## Domain
Input Validation & Injection / Cryptography (release-channel integrity)

## Location
`packages/core/src/services/update-service.ts:9` and `packages/ui/src/components/update-banner.tsx:24-29`

## Evidence

```typescript
// update-service.ts:9 — schema permits any z.url() value
downloadUrl: z.url(),
// Verified empirically with the pinned zod@4.3.6:
//   z.url().safeParse('javascript:alert(1)').success === true
//   z.url().safeParse('data:text/html,<script>alert(1)</script>').success === true
//   z.url().safeParse('file:///etc/passwd').success === true
```

```tsx
// update-banner.tsx:24-29 — feed-supplied URL goes straight into <a href>
<a className={styles.downloadLink}
   href={result.latest.downloadUrl}
   target="_blank" rel="noreferrer noopener">
```

A maintainer-controlled (or compromised) update feed can deliver `javascript:`,
`data:text/html,...`, or `file:` URLs. There is no signature, no hash, no
allowed-origin check on the feed JSON; the entire integrity story is "the
maintainer hosts a JSON file at `PRAXIS_UPDATE_FEED_URL`". Anyone who can
write that JSON (CDN compromise, S3 misconfig, DNS hijack on the feed host,
or a malicious maintainer) gets a click-targeted vector that runs in the
renderer's privileged origin (which has `window.praxis` exposing the typed
IPC surface — it can call `praxis.author.exportMemory({ targetPath: "/tmp/x" })`,
`praxis.config.engineConfig()` to exfiltrate the API key, etc.). React-markdown's
safe-by-default urlTransform does NOT apply here because the URL is not
coming through markdown.

## Remediation direction

Tighten the schema to `z.url().refine(u => /^https?:\/\//i.test(u), "must be http(s)")`
(mirror the same allowlist that `praxis.shell.openExternal` enforces in
`ipc-server.ts:1165`). Independently, harden the banner's anchor — pass the URL
through `shell.openExternal` (which already filters protocols) instead of
rendering an `<a href>`, or sanitise client-side. Longer-term the feed needs
a signature mechanism (a detached Ed25519 over the feed JSON, public key
embedded in the app) before the manual-download channel becomes a real
auto-update channel.
