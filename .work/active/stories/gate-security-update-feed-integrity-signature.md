---
id: gate-security-update-feed-integrity-signature
kind: story
stage: drafting
tags: [security]
parent: null
depends_on: []
release_binding: v0.1.0
gate_origin: security
created: 2026-05-10
updated: 2026-05-10
---

# Update feed has no integrity/authenticity verification

## Severity
Medium

## Domain
Cryptography / Supply chain

## Location
`packages/core/src/services/update-service.ts:36-69`,
`docs/UPDATE-CHANNEL.md:38-72`

## Evidence

```typescript
// update-service.ts:42-48 — fetch then JSON-validate; no signature, no pinning, no hash
const res = await fetch(url, { headers: { "User-Agent": "Praxis-update-check" } });
if (!res.ok) return { status: "error", message: `HTTP ${res.status}` };
raw = await res.json();
```

The user is steered to a downloaded installer based purely on whatever JSON
shows up at `PRAXIS_UPDATE_FEED_URL`. Even with TLS, a maintainer mistake,
S3 bucket misconfig, or a future move to a CDN with mutable origin gives an
attacker a path to redirect every Praxis install to a malicious installer.

The docs (`UPDATE-CHANNEL.md`) say "switching to electron-updater later is
purely additive" — but electron-updater enforces signature checks on the
downloaded installer. The current manual-download flow does not verify the
downloaded installer at all (the user is just sent to a URL).

## Remediation direction

At minimum, document that the manual flow trusts the feed publisher
unconditionally and tell the user to verify the installer signature
(macOS: Gatekeeper handles it for signed builds; Windows/Linux ship
unsigned per `docs/CODE-SIGNING.md`).

For real defense, ship a maintainer Ed25519 public key bundled in the app
and require the feed JSON to be signed; reject feeds whose signature does
not verify. This becomes mandatory before the project moves to actual
auto-update.
