---
id: epic-v1-security-hardening-sign-update-feed
kind: feature
stage: drafting
tags: [security]
parent: epic-v1-security-hardening
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-12
updated: 2026-05-12
---

# Sign the update feed with Ed25519 and verify before offering updates

## Brief

`UpdateServiceImpl` at `packages/core/src/services/update-service.ts` fetches a
JSON feed from `PRAXIS_UPDATE_FEED_URL` and uses it to drive the update banner.
The feed has no signature; the linked installer URL has no hash. Anyone who can
MITM the fetch (or compromise the host serving the feed) can convince the app
to surface a malicious installer URL. The finding from
`gate-security-update-feed-integrity-signature` was deferred for v0.1.0 by
documenting the trust model in `docs/UPDATE-CHANNEL.md`; this feature delivers
the actual signature verification.

The change spans the read side (verify in `update-service.ts` before trusting
any feed field) and the release side (sign the feed during release CI, bundle
the public key as a hardcoded constant in app source). The Web Crypto API
provides `crypto.subtle.verify("Ed25519", publicKey, sig, feedBytes)` — no new
runtime dependency required.

The feature does NOT cover: encrypting the API key (sibling feature),
automatic-update execution (this only verifies; the user still clicks to
download), online key revocation, or feed-hosting infrastructure changes
beyond the new `signature` field.

## Epic context

- Parent epic: `epic-v1-security-hardening`
- Position in epic: **independent capability — no shared types or files with the encrypt-api-key sibling**

## Foundation references

- `docs/UPDATE-CHANNEL.md` — current trust model documents the gap and gives
  the deferral rationale. The design pass must roll this doc forward to
  describe the new signed-feed contract and the release-signing step.
- `docs/ARCHITECTURE.md` — the update-service lives in `@praxis/core/services`
  and is consumed by `@praxis/ui` via the client. No new package boundary.
- `docs/SPEC.md` — verify any update-channel commitments
- Origin idea: `.work/backlog/idea-update-feed-ed25519-signature.md` (if
  still present)

## Design considerations to address in the design pass

These are flagged by the epic body and should each be resolved with a
concrete decision during `/agile-workflow:feature-design`:

1. **Keypair generation + storage**: maintainer Ed25519 private key lives in
   a secrets manager (1Password / vault / GitHub Encrypted Secrets); public
   key is bundled as a hardcoded `UPDATE_FEED_PUBLIC_KEY` constant in app
   source. Document the generation procedure (one-liner with `openssl
   genpkey`) and the manual rotation policy.
2. **Signature shape**: `signature` field on the feed JSON containing a
   detached Base64 Ed25519 signature over the canonical-JSON-encoded feed
   bytes WITHOUT the signature field. Pick a canonical encoder (e.g.,
   `json-canonicalize` or RFC 8785 JSON Canonicalization Scheme) and lock
   the wire shape.
3. **Installer hash**: add a `sha256` field to the feed entry; the UI
   verifies the hash after download AND before surfacing the "ready to run"
   confirmation. Decide whether the hash check is done in the renderer
   (after download via the Web API) or in the main process (Node `crypto`).
4. **Release-pipeline integration**: signing runs in release CI, not
   locally. Feed publish is gated on successful signature. Out-of-scope for
   v1 is auto-publishing; the maintainer manually places the signed feed
   on the host.
5. **Backward compatibility**: old clients see an unknown `signature` field
   and silently skip verification (Zod ignores unknown fields). Document
   this transition window in `docs/UPDATE-CHANNEL.md`. Decide when to
   sunset the unsigned-tolerance branch.
6. **Verification-failure UX**: hide the banner on signature failure; log
   the specific failure mode to the main-process log with enough detail to
   distinguish "feed hasn't been signed yet by the maintainer" from "key
   rotation needed" from "active attack". No user-facing error popup —
   silent fall-back to no update available.
7. **Testing**: unit tests against `crypto.subtle.verify` with golden
   feed/signature pairs (one valid, one tampered, one with stale key);
   integration test against a local fixture server.

<!-- Feature-design pass fills in interfaces, signatures, implementation units, and child stories. -->
