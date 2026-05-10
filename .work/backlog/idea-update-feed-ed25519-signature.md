---
kind: feature
tags: [security]
created: 2026-05-10
---

# Sign the update feed with Ed25519 and verify before offering updates

## Summary

The update-service fetches a JSON feed from `PRAXIS_UPDATE_FEED_URL` and uses
it to offer a download link. There is no signature on the feed and no hash on
the linked installer — the finding from `gate-security-update-feed-integrity-signature`
(v0.1.0 security gate). For v0.1.0 the risk is documented in
`docs/UPDATE-CHANNEL.md` under "Trust model". Full signature verification is
deferred to a follow-up feature and becomes mandatory before the project moves
to actual auto-update.

## Evidence (from security review)

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
The `docs/UPDATE-CHANNEL.md` notes "switching to electron-updater later is
purely additive" — but electron-updater enforces signature checks on the
downloaded installer. The current manual-download flow does not verify the
downloaded installer at all.

## Remediation direction (full implementation)

1. **Generate a maintainer Ed25519 keypair.** Keep the private key in a
   secrets manager; bundle the public key as a hardcoded constant in the app
   source (e.g., `packages/core/src/services/update-service.ts`).

2. **Sign the feed JSON.** When cutting a release, sign the canonical feed
   JSON body with the private key and include the detached Base64 signature
   as a `signature` field (or a companion `.sig` file at a well-known URL).

3. **Verify in update-service.** Before trusting any field in the parsed feed,
   verify the signature against the bundled public key using the Web Crypto API
   (`crypto.subtle.verify("Ed25519", publicKey, sig, feedBytes)`). Reject the
   feed and log an error if verification fails; do not show an update banner.

4. **Add an installer hash field to the feed.** Include a `sha256` field for
   the linked installer. After the user downloads it (or as a pre-download
   check if streaming), verify the hash matches before surfacing the "ready to
   run" confirmation.

5. **Update the release runbook** in `docs/UPDATE-CHANNEL.md` to include the
   signing step.

## Design considerations before implementing

- **Key rotation**: document how to rotate the public key (ship a new app
  version with the new key). There is no online key revocation in this model.
- **Build pipeline integration**: the signing step must run in the release CI
  pipeline, not locally. Gate the feed publish on a successful signature.
- **Backward compatibility**: existing app versions (pre-signing) will see a
  feed with a `signature` field they don't understand; since unknown fields
  are ignored by Zod validation, old clients will silently skip verification.
  This is acceptable during the transition window, but document it.
- **Failure UX**: if signature verification fails, the banner must stay hidden
  and the main-process log must record the failure with enough detail for a
  maintainer to diagnose a misconfiguration vs an actual attack.
