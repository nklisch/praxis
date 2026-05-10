---
id: gate-security-update-feed-integrity-signature
kind: story
stage: done
tags: [security]
parent: feature-release-v0.1.0-security-findings
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

## Implementation notes

Chose the **doc-only path** for v0.1.0. The full Ed25519-signed-feed
implementation is a meaningful engineering effort involving keypair
management, a signed-release CI pipeline step, installer hash fields in the
feed schema, backward-compatibility concerns for pre-signing app versions, and
a key-rotation story. Rushing that work into a v0.1.0 release patch risks
introducing its own bugs or misconfigurations.

The concrete v0.1.0 deliverable is a "Trust model" section added to
`docs/UPDATE-CHANNEL.md` that:
- States plainly that the feed is trusted unconditionally and that there is no
  signature or hash verification.
- Instructs users to verify the installer signature manually before running it.
- Notes that macOS Gatekeeper handles this automatically for signed builds;
  Windows and Linux installers are currently unsigned (per `docs/CODE-SIGNING.md`).
- Marks the full Ed25519 implementation as mandatory before moving to
  electron-updater or any automatic update mechanism.

The full implementation is parked in
`.work/backlog/idea-update-feed-ed25519-signature.md` with the complete
remediation direction from the security story preserved verbatim.

## Review (2026-05-10)

**Verdict: Approve**

Correctness: The "Trust model" section in `UPDATE-CHANNEL.md` accurately describes the current state — no signature, no hash, unconditional trust in the feed host. The manual verification guidance is platform-appropriate: Gatekeeper is correctly identified as the macOS backstop for signed builds; Windows and Linux are correctly flagged as unsigned with no automated verification. The Ed25519 gate is correctly marked as mandatory before auto-update, not advisory.

Foundation-doc alignment: The section is written in current-tense declarative style with no legacy framing. "Future (mandatory before moving to actual auto-update)" is forward-looking guidance, not historical notation — appropriate for a foundation doc. The section integrates cleanly into UPDATE-CHANNEL.md's existing flow.

Security: The doc-only path is the right call for v0.1.0 — the Ed25519 implementation involves keypair management, CI pipeline changes, backward-compatibility for pre-signing clients, and a failure UX; rushing it introduces its own risks. The backlog item preserves the full remediation direction verbatim, including the installer hash field and key-rotation story, so nothing is lost when the follow-up is scoped.
