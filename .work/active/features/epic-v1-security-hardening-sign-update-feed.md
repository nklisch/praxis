---
id: epic-v1-security-hardening-sign-update-feed
kind: feature
stage: done
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

## Design decisions

Ambiguities resolved during this design pass (autopilot delegation, judgment-based):

- **Signature placement: detached sig file**. Maintainer publishes both
  `feed.json` AND `feed.json.sig` (raw 64-byte Ed25519 signature, base64-encoded).
  The app fetches both, verifies signature over the raw feed bytes, then
  JSON-parses. Rejected: in-feed signature with canonical-JSON, which would
  require both signing and verifying paths to share a canonical encoder
  implementation; detached-sig is simpler and works with any static-file host.
- **Public key bundling format**: hardcoded `UPDATE_FEED_PUBLIC_KEY_BASE64`
  constant in source — base64 of the raw 32-byte Ed25519 public key. Web
  Crypto's `subtle.importKey("raw", ...)` takes raw bytes; base64 is the
  cleanest constant for inline source. Initial value: empty string (placeholder)
  — the maintainer generates the keypair and replaces the constant before
  shipping v0.2.x.
- **Empty/placeholder key behavior**: when the public-key constant is empty,
  `checkLatest` returns `{ status: "disabled" }` with a debug log. This lets
  the feature ship in code form before the maintainer generates the keypair;
  no broken update flow during the transition.
- **Signature requirement**: strict from day 1 *once a public key is
  configured*. There is no "lenient mode" or `--allow-unsigned` flag.
  Rationale: a lenient mode would let an attacker bypass the protection by
  simply not signing the feed they serve, defeating the purpose. The
  empty-key escape hatch covers the legitimate "feature shipped, key not
  yet generated" transition window; once the maintainer fills in the key,
  every feed must be signed.
- **Hash field is user-facing only**: `installerSha256` is added to the feed
  schema and surfaced in the banner for *manual* verification by the user.
  Praxis doesn't auto-download installers in v1 — the user clicks the
  banner, the browser opens, the user downloads. The hash is for them to
  compare against the installer's `shasum -a 256` output. When auto-update
  lands later, the app-side hash check is straightforward to add on top.
- **Verification location**: in `update-service.ts` (main process via
  `@praxis/core`). Web Crypto is available in Node 18+ via `crypto.subtle`;
  verified by reading `package.json` engine constraint (`Node ≥ 24`) which
  is well past the threshold. No additional runtime dependency.
- **Verification-failure UX**: silent fall-back to no update available
  (status: "error", "signature verification failed"). Banner hides. Log a
  warn with the specific failure mode (sig fetch HTTP error vs. crypto
  verify reject vs. malformed sig). No user-facing popup — matches
  the design body's choice.
- **Sig URL derivation**: appended `.sig` to the feed URL. Convention, not
  configurable. If `PRAXIS_UPDATE_FEED_URL=https://example.com/feed.json`,
  the sig URL is `https://example.com/feed.json.sig`. Maintainer hosts
  both files at the same path.
- **Key rotation policy**: ship new app version with new public key constant.
  Old installs continue trusting the OLD key until they upgrade. No online
  revocation (would require trusting a revocation list, which has its own
  trust-anchor problem). Documented as the explicit policy in
  UPDATE-CHANNEL.md.

## Architectural choice

**Detached Ed25519 signature file + bundled public key + Web Crypto verification.**

Rationale over rejected alternatives:

- **Detached sig file (chosen)**: signing pipeline is `openssl pkeyutl -sign`
  on raw feed bytes, output piped through `base64` — a 5-line shell
  invocation. Verification on the app side is `crypto.subtle.verify` on the
  bytes-as-received. No canonical JSON, no in-line signature stripping, no
  edge cases around whitespace. The maintainer's release script can be a
  tiny shell wrapper; the app code is a single fetch + verify.
- **In-feed signature with canonical JSON**: rejected. Requires both signer
  and verifier to agree on a canonical encoding (RFC 8785 or json-canonicalize).
  Two implementations, two opportunities to diverge. Whitespace and key-order
  bugs would surface as silent verification failures.
- **HTTP-header signature**: rejected. Requires custom server configuration
  (static-file CDNs don't generally let you set arbitrary response headers
  on JSON files), which constrains hosting options.

## Implementation Units

Tight cohesion: verification path, key constant, schema field, banner UX,
docs, and release-signing script all land in one stride. **No child stories
spawned** — the implement-orchestrator runs it as a one-agent wave.

### Unit 1: Public key constant + import helper

**File**: `packages/core/src/services/update-feed-public-key.ts` (new)

```typescript
/**
 * Maintainer's Ed25519 public key for verifying update-feed signatures.
 *
 * Generated by the maintainer; private key lives in a secrets manager
 * (1Password / GitHub Encrypted Secrets / vault). Replace this empty
 * placeholder with the real base64-encoded raw 32-byte public key BEFORE
 * shipping the first release with this feature enabled.
 *
 * Key rotation policy: ship a new app version with a new constant. Old
 * installs continue trusting the previous key until they upgrade. There
 * is no online revocation list.
 *
 * Generation procedure:
 *   openssl genpkey -algorithm Ed25519 -out update-feed-private.pem
 *   openssl pkey -in update-feed-private.pem -pubout -outform DER \
 *     | tail -c 32 | base64
 *
 * The tail -c 32 strips the DER SubjectPublicKeyInfo prefix, leaving
 * just the raw 32-byte Ed25519 public key suitable for Web Crypto's
 * `subtle.importKey("raw", ...)`.
 */
export const UPDATE_FEED_PUBLIC_KEY_BASE64 = "";

/**
 * Returns true when a public key constant has been configured.
 * Empty / whitespace-only is treated as "not configured" and the
 * update-check returns "disabled" rather than trying to verify.
 */
export function isPublicKeyConfigured(): boolean {
  return UPDATE_FEED_PUBLIC_KEY_BASE64.trim().length > 0;
}

/**
 * Import the bundled public key as a CryptoKey for `subtle.verify`.
 * Throws when the constant is empty or malformed — callers should
 * gate on `isPublicKeyConfigured()` first.
 */
export async function importUpdateFeedPublicKey(): Promise<CryptoKey> {
  const b64 = UPDATE_FEED_PUBLIC_KEY_BASE64.trim();
  if (b64.length === 0) {
    throw new Error("UPDATE_FEED_PUBLIC_KEY_BASE64 is not configured");
  }
  const rawKey = Buffer.from(b64, "base64");
  if (rawKey.length !== 32) {
    throw new Error(
      `UPDATE_FEED_PUBLIC_KEY_BASE64 must decode to 32 bytes (got ${rawKey.length})`,
    );
  }
  return crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "Ed25519" },
    false, // not extractable
    ["verify"],
  );
}
```

**Acceptance Criteria**:
- [ ] Exported constant + helper functions in a dedicated file.
- [ ] JSDoc spells out the generation procedure and rotation policy.
- [ ] `isPublicKeyConfigured()` returns false for empty/whitespace.
- [ ] `importUpdateFeedPublicKey()` throws cleanly when not configured.
- [ ] `importUpdateFeedPublicKey()` rejects malformed base64 / wrong length.

---

### Unit 2 (trickiest): Signature verification in `checkLatest`

**File**: `packages/core/src/services/update-service.ts`

```typescript
import {
  importUpdateFeedPublicKey,
  isPublicKeyConfigured,
} from "./update-feed-public-key.js";

export class UpdateServiceImpl implements UpdateService {
  constructor(private readonly _deps: ServiceDeps) {}

  async checkLatest(currentVersion: string): Promise<UpdateCheckResult> {
    const url = process.env[FEED_URL_ENV];
    if (!url) return { status: "disabled" };

    // No public key bundled yet → disabled. Lets the feature ship in code
    // form before the maintainer generates the keypair.
    if (!isPublicKeyConfigured()) {
      this._deps.log.debug("update-service.disabled.no_public_key");
      return { status: "disabled" };
    }

    // Fetch feed bytes (NOT JSON yet — we need the bytes for verification).
    let feedBytes: ArrayBuffer;
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Praxis-update-check" },
      });
      if (!res.ok) return { status: "error", message: `HTTP ${res.status}` };
      feedBytes = await res.arrayBuffer();
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }

    // Fetch detached signature (sibling URL with .sig appended).
    const sigUrl = `${url}.sig`;
    let sigBase64: string;
    try {
      const res = await fetch(sigUrl, {
        headers: { "User-Agent": "Praxis-update-check" },
      });
      if (!res.ok) {
        this._deps.log.warn("update-service.sig_fetch_failed", {
          status: res.status,
          sigUrl,
        });
        return { status: "error", message: `signature fetch failed: HTTP ${res.status}` };
      }
      sigBase64 = (await res.text()).trim();
    } catch (err) {
      this._deps.log.warn("update-service.sig_fetch_threw", {
        detail: err instanceof Error ? err.message : String(err),
      });
      return { status: "error", message: "signature fetch failed" };
    }

    // Verify signature over the raw feed bytes.
    let verifyOk = false;
    try {
      const sigBytes = Buffer.from(sigBase64, "base64");
      if (sigBytes.length !== 64) {
        this._deps.log.warn("update-service.sig_malformed", {
          expected: 64,
          got: sigBytes.length,
        });
        return { status: "error", message: "signature malformed" };
      }
      const key = await importUpdateFeedPublicKey();
      verifyOk = await crypto.subtle.verify("Ed25519", key, sigBytes, feedBytes);
    } catch (err) {
      this._deps.log.warn("update-service.verify_threw", {
        detail: err instanceof Error ? err.message : String(err),
      });
      return { status: "error", message: "signature verification error" };
    }
    if (!verifyOk) {
      this._deps.log.warn("update-service.sig_invalid", {
        feedUrl: url,
        detail: "signature does not match the bundled public key — feed may be tampered or the maintainer rotated keys",
      });
      return { status: "error", message: "signature verification failed" };
    }

    // Signature verified — now JSON-parse and schema-validate.
    let raw: unknown;
    try {
      raw = JSON.parse(new TextDecoder().decode(feedBytes));
    } catch (err) {
      return { status: "error", message: err instanceof Error ? err.message : String(err) };
    }

    const parsed = UpdateFeedSchema.safeParse(raw);
    if (!parsed.success) {
      return { status: "error", message: "feed JSON failed validation" };
    }

    if (compareVersions(parsed.data.version, currentVersion) > 0) {
      return { status: "available", current: currentVersion, latest: parsed.data };
    }
    return { status: "up-to-date", current: currentVersion };
  }
}
```

**Implementation Notes**:
- The order matters: **fetch bytes → fetch sig → verify → parse**. Verifying
  before parsing means we don't trust the schema until the signature is
  proven valid. This is what protects against a malicious schema-valid feed.
- `feedBytes` is `ArrayBuffer`, not `string` — `crypto.subtle.verify`
  expects `BufferSource`. The TextDecoder pass-through after verification
  decodes the same bytes for JSON.parse.
- `ServiceDeps.log` is already on the impl (just unused) — use it for the
  warn messages. Remove the `biome-ignore` for `_deps` since it's now used.
- Ed25519 in Node's Web Crypto: available since Node 18.x; project requires
  Node ≥ 24 (per CLAUDE.md), so it's a safe assumption.

**Acceptance Criteria**:
- [ ] `checkLatest` fetches the feed bytes, fetches the `.sig` file, verifies,
      and only parses/returns "available" when the signature is valid.
- [ ] Empty public key constant → `status: "disabled"` (no fetch attempted).
- [ ] Sig HTTP error → `status: "error", message: "signature fetch failed: HTTP NNN"`.
- [ ] Malformed signature (wrong length) → `status: "error", message: "signature malformed"`.
- [ ] Verify returns false → `status: "error", message: "signature verification failed"`,
      warn logged with feedUrl + reason.
- [ ] Verify throws (key import error, etc.) → `status: "error", message: "signature verification error"`,
      warn logged.
- [ ] Feed JSON schema-invalid AFTER successful signature → existing "feed JSON failed validation" path.

---

### Unit 3: Schema field `installerSha256`

**File**: `packages/core/src/services/update-service.ts` (the schema)

```typescript
export const UpdateFeedSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, "version must be semver"),
  releaseDate: z.string().datetime().optional(),
  downloadUrl: z.url().refine(/* existing http(s) refinement */),
  releaseNotesUrl: z.url().refine(/* existing */).optional(),
  /**
   * SHA-256 of the installer file at `downloadUrl`, in lowercase hex (64 chars).
   * Surfaced in the banner for users to manually verify their download via
   * `shasum -a 256` / `sha256sum` / certutil. Optional during the transition
   * window where the maintainer hasn't started publishing it yet.
   */
  installerSha256: z
    .string()
    .regex(/^[0-9a-f]{64}$/, "installerSha256 must be 64-char lowercase hex")
    .optional(),
});
```

**Acceptance Criteria**:
- [ ] Schema accepts feeds with or without `installerSha256`.
- [ ] Schema rejects uppercase or non-hex sha256 values.
- [ ] Existing tests still pass (no required field added).

---

### Unit 4: Banner UX — display the hash for manual verification

**File**: `packages/ui/src/components/update-banner.tsx`

```tsx
// In the banner body, when `latest.installerSha256` is set:
{latest.installerSha256 && (
  <details className={styles.hashDetails}>
    <summary>Verify download · SHA-256</summary>
    <code className={styles.hashValue}>{latest.installerSha256}</code>
    <p className={styles.hashHint}>
      After downloading, run <code>shasum -a 256 &lt;file&gt;</code> (macOS / Linux)
      or <code>certutil -hashfile &lt;file&gt; SHA256</code> (Windows) and confirm
      the output matches.
    </p>
  </details>
)}
```

**Implementation Notes**:
- Use `<details>` so it's collapsed by default — keeps the banner compact.
- Monospace for the hash; selectable text. Don't truncate or ellipsize —
  users need the full value.
- Editorial-CSS composes for the prose; hash value gets its own monospace
  class.

**Acceptance Criteria**:
- [ ] Banner shows the hash details block when `installerSha256` is set.
- [ ] Block is collapsed by default.
- [ ] Hash value is fully visible when expanded (no truncation).
- [ ] When `installerSha256` is absent, the block doesn't render.
- [ ] Existing banner tests still pass; one new test asserts the hash
      display.

---

### Unit 5: Maintainer release-signing script

**File**: `scripts/sign-update-feed.ts` (new)

```typescript
#!/usr/bin/env tsx
/**
 * Sign an update-feed JSON file with the maintainer's Ed25519 private key.
 * Outputs the detached signature as base64 to a `.sig` file alongside.
 *
 * Usage:
 *   PRAXIS_UPDATE_FEED_PRIVATE_KEY_FILE=/secrets/update-feed-private.pem \
 *     pnpm tsx scripts/sign-update-feed.ts path/to/feed.json
 *
 * Produces `path/to/feed.json.sig`. Both files must be published together.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createPrivateKey, sign } from "node:crypto";

async function main(): Promise<void> {
  const feedPath = process.argv[2];
  if (!feedPath) {
    console.error("Usage: sign-update-feed.ts <feed.json>");
    process.exit(1);
  }

  const keyPath = process.env.PRAXIS_UPDATE_FEED_PRIVATE_KEY_FILE;
  if (!keyPath) {
    console.error(
      "Set PRAXIS_UPDATE_FEED_PRIVATE_KEY_FILE to the path of the Ed25519 PEM-encoded private key.",
    );
    process.exit(1);
  }

  const feedBytes = await readFile(feedPath);
  const keyPem = await readFile(keyPath, "utf8");
  const privateKey = createPrivateKey({ key: keyPem, format: "pem" });

  // Ed25519 sign produces a 64-byte detached signature.
  const sigBytes = sign(null, feedBytes, privateKey);
  if (sigBytes.length !== 64) {
    throw new Error(`unexpected signature length: ${sigBytes.length}`);
  }

  const sigPath = `${feedPath}.sig`;
  await writeFile(sigPath, sigBytes.toString("base64"));
  console.log(`wrote ${sigPath} (${sigBytes.length} bytes signature)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Also add to `package.json` scripts:
```json
"script:sign-update-feed": "tsx scripts/sign-update-feed.ts"
```

**Implementation Notes**:
- Node's built-in `sign(null, data, key)` is the Ed25519 signature path —
  the algorithm is implicit from the key type. No `openssl` shell-out
  required.
- The script reads the PEM-encoded private key from a path; the path
  itself comes from an env var so the private key never appears in the
  command-line args (visible via `ps`) or shell history.

**Acceptance Criteria**:
- [ ] `pnpm tsx scripts/sign-update-feed.ts <feed.json>` produces
      `<feed.json>.sig` with a 64-byte base64-encoded signature.
- [ ] Refusal-on-missing-args produces a clear error and exit code 1.
- [ ] `package.json` exposes `script:sign-update-feed`.
- [ ] Round-trip test: signing with a known private key + verifying with
      the corresponding public key passes (verified in Unit 6 tests).

---

### Unit 6: Tests + documentation roll-forward

**Files**:
- `packages/core/src/services/__tests__/update-service.test.ts` (extend)
- `packages/core/src/services/__tests__/update-feed-public-key.test.ts` (new)
- `docs/UPDATE-CHANNEL.md` — replace the "Future" trust-model section
  with the signed-feed contract.

**Test scenarios** (`update-service.test.ts`):

The tests need a **golden signed-feed pair** — a known private key, the
matching public key, a fixture feed JSON, and the signature produced by
signing that JSON with that private key. Generate these once at test
setup and reuse via fixtures.

Approach: generate an Ed25519 keypair in a `beforeAll` block via
`crypto.generateKeyPairSync("ed25519")`. Use Node's `sign(null, feedBytes, privateKey)`
to produce the test signature. Stub the module's `UPDATE_FEED_PUBLIC_KEY_BASE64`
constant to the freshly generated public key (raw 32 bytes, base64) via
`vi.mock`. Mock `fetch` to return the feed bytes + sig pair.

- **Empty public key**: replace constant with `""` → `status: "disabled"`,
  no fetch attempted. Assert `fetchMock.calls.length === 0`.
- **Valid signature**: keypair + signed feed → `status: "available"` (or
  `"up-to-date"` if version matches). Banner-quality path.
- **Tampered feed**: same signature but feed bytes mutated → verify
  returns false → `status: "error", message: "signature verification failed"`.
- **Wrong signature length**: 60-byte signature → `status: "error", message: "signature malformed"`.
- **Wrong key**: signature made with key A; bundled key is key B → verify
  returns false.
- **Sig fetch 404**: feed fetch succeeds, sig fetch returns 404 →
  `status: "error", message: "signature fetch failed: HTTP 404"`.

**Test scenarios** (`update-feed-public-key.test.ts`):
- `isPublicKeyConfigured()` empty → false.
- `isPublicKeyConfigured()` whitespace-only → false.
- `isPublicKeyConfigured()` valid base64 → true.
- `importUpdateFeedPublicKey()` empty → throws.
- `importUpdateFeedPublicKey()` wrong-length decode → throws.
- `importUpdateFeedPublicKey()` valid 32-byte raw → returns a `CryptoKey`
  with `type: "public"` and `usages: ["verify"]`.

**Documentation roll-forward** (`docs/UPDATE-CHANNEL.md`):
- Replace the "Future" paragraph (lines 81-89) with a "Signed-feed
  contract" section describing:
  - The detached `.sig` file convention (one sentence + the URL example)
  - The maintainer's release procedure (use `script:sign-update-feed`)
  - The key-rotation policy (ship new app version with new constant; no
    online revocation)
- Note in the "Trust model" section that as of v0.2.x, the unsigned-feed
  branch is closed — verification is strict.
- Update `docs/v1-ship-checklist.md` if it has a check item for the
  signed-feed work (it does, at line 140) — flip it to landed.

**Acceptance Criteria**:
- [ ] All unit-test scenarios pass.
- [ ] `pnpm typecheck` green (incl. root gate).
- [ ] No regression in `pnpm test`.
- [ ] UPDATE-CHANNEL.md "Trust model" + "Future" section rewritten to
      describe the realized signed-feed contract, not the deferral.
- [ ] v1-ship-checklist.md item 140's checkbox flipped or annotated as
      shipped.

## Implementation Order

1. Unit 1 (public key constant + helper) — pure new file, blocks Unit 2.
2. Unit 3 (schema field) — schema-only change, blocks Unit 4 banner.
3. Unit 2 (verification in `checkLatest`) — the trickiest unit; depends on
   Unit 1.
4. Unit 5 (release-signing script) — independent of 1-4; can land anywhere.
5. Unit 4 (banner UX) — depends on Unit 3; consumes the schema field.
6. Unit 6 (tests + docs roll-forward) — tests written alongside each unit;
   docs land last.

All six units in one stride. Single commit OK; thematic split (one for the
core verification path, one for the banner+docs+release-script) also OK if
the diff is large.

## Testing

See Unit 6 for the per-unit test plan. Cross-cutting verification:

```bash
pnpm --filter @praxis/core typecheck
pnpm --filter @praxis/core test
pnpm --filter @praxis/ui typecheck
pnpm --filter @praxis/ui test
pnpm typecheck   # root gate
pnpm test
```

Manual smoke (out of automated test scope):

1. Generate a test keypair with `openssl genpkey -algorithm Ed25519 ...`.
2. Replace `UPDATE_FEED_PUBLIC_KEY_BASE64` with the test public key.
3. Sign a fixture feed via `pnpm script:sign-update-feed fixture.json`.
4. Serve `fixture.json` + `fixture.json.sig` from a local static server
   (`python3 -m http.server 8080`).
5. `PRAXIS_UPDATE_FEED_URL=http://localhost:8080/fixture.json pnpm dev` →
   confirm the banner appears.
6. Tamper with `fixture.json` (change the version field) → relaunch →
   confirm the banner does NOT appear; main-process log shows
   `update-service.sig_invalid`.

## Risks

1. **Web Crypto's Ed25519 implementation availability across Node versions.**
   Ed25519 in `crypto.subtle` is Node 18.4+. Praxis requires Node ≥ 24
   (`CLAUDE.md`), so this is well-supported. **Mitigation**: none needed;
   verified by reading the engine constraint.
2. **Public key constant is hardcoded — committing it to a public repo
   exposes the key.** Public keys are by definition public; exposure is
   fine. **Mitigation**: none needed. The private key MUST live in a
   secrets manager and never be committed. The script's PEM-file env-var
   pattern protects against committing the private key.
3. **The maintainer hasn't generated a keypair yet when this feature
   ships.** Empty constant → `status: "disabled"` → no broken update flow.
   When the maintainer is ready, they generate the keypair, replace the
   constant, sign the next feed, and ship the release. **Mitigation**:
   covered by the design.
4. **Sig file fetch latency adds to the update-check time.** Two HTTP
   requests instead of one. **Mitigation**: both fetches are tiny (feed
   JSON is ~1 KB; sig is 88 bytes base64-encoded). Negligible cost over
   any normal network. If it becomes a concern, the sig can be inlined
   as `<feed_url>?sig=<base64>` in a later iteration without changing
   the verification logic.
5. **A pre-existing dismissal of an update banner under the OLD
   verification rules doesn't transfer.** The dismissal state is keyed
   by version, not by signature. **Mitigation**: irrelevant — the
   version is verified via the signature now, so a tampered version
   wouldn't be offered in the first place.
6. **Test setup needs a real Ed25519 keypair generated at runtime, not a
   committed fixture.** Generating in `beforeAll` is the cleanest approach
   but adds setup time. **Mitigation**: keypair generation is fast (<10ms);
   `beforeAll` runs once per file. Acceptable.

## Implementation notes

### Unit status

| Unit | Status | Notes |
|------|--------|-------|
| 1 — `update-feed-public-key.ts` | Done | New file; empty placeholder constant; `isPublicKeyConfigured()` + `importUpdateFeedPublicKey()` helpers as designed. |
| 2 — Verification in `checkLatest` | Done | `_deps` → `deps` rename; `biome-ignore` removed (deps now used); fetch-bytes → fetch-sig → verify → parse order as spec'd. |
| 3 — `installerSha256` schema field | Done | Optional lowercase-hex regex added to `UpdateFeedSchema`. |
| 4 — Banner UX | Done | `<details>` block added; CSS module extended with `.hashDetails`, `.hashSummary`, `.hashValue`, `.hashHint` classes. |
| 5 — `scripts/sign-update-feed.ts` | Done | Node `crypto.sign(null, bytes, privateKey)` as designed; `PRAXIS_UPDATE_FEED_PRIVATE_KEY_FILE` env-var gating; root `package.json` `script:sign-update-feed` added. |
| 6 — Tests + docs | Done | See below. |

### Web Crypto API — no surprises

`crypto.subtle.verify("Ed25519", key, sig, data)` works exactly as documented on Node 24.
`crypto.subtle.importKey("raw", rawBytes, { name: "Ed25519" }, false, ["verify"])` accepts a 32-byte raw public key directly — no DER prefix required (DER prefix stripping is only needed when exporting from an existing key via `publicKey.export({ type: "spki", format: "der" })`).

`crypto.sign(null, data, privateKey)` for signing produces a 64-byte Ed25519 signature as expected; the `null` algorithm is the correct idiom when the key type encodes the algorithm.

### Test approach

Module-level `vi.mock("../update-feed-public-key.js", ...)` with a mutable `mockIsConfigured` / `mockCryptoKey` pair — the mock factory captures both by reference, allowing per-test control without re-importing the module. A real `generateKeyPairSync("ed25519")` keypair is generated in `beforeAll`; signing uses Node `crypto.sign(null, ...)` and verification goes through the real `crypto.subtle.verify` path under the mocked imported key.

Test scenarios covered:
- Empty/no public key → disabled, no fetch
- Valid signature → available / up-to-date
- Tampered feed bytes → sig_invalid
- Wrong-length signature (60 bytes) → sig_malformed
- Wrong key (signed with key B, configured with key A) → sig_invalid
- Sig fetch 404 → signature fetch failed
- Schema-invalid feed after valid signature → validation error
- `installerSha256` present → surfaced in result
- `installerSha256` uppercase → schema rejection

### Docs rolled forward

- `docs/UPDATE-CHANNEL.md` — "Trust model" section entirely rewritten. Removed the "Future" paragraph and the description of the unsigned-feed gap. Replaced with "Signed-feed contract", "Key rotation policy", "Release-signing procedure", and "Installer hash (manual verification)" subsections describing the realized contract. The `installerSha256` feed table row added. Operational steps updated with the `sign-update-feed` step.
- `docs/v1-ship-checklist.md` — step 7.2 updated to include signing the synthetic feed and verifying the hash block; step 7.3 added for tamper-rejection test. Pre-ship checklist got a new `[x]` item documenting the landed feature and the keypair-generation TODO.

### Verification output

```
pnpm --filter @praxis/core typecheck  → clean
pnpm --filter @praxis/core test       → 793 passed (76 test files)
pnpm --filter @praxis/ui typecheck    → clean
pnpm --filter @praxis/ui test         → 800 passed (94 test files)
pnpm typecheck                        → clean (root gate, covers scripts/)
pnpm test                             → 2817 passed | 21 skipped (311 files)
```

## Out of scope

- Auto-update execution (electron-updater integration). The feature
  protects the update-check; downloads remain manual user-clicks for v1.
- Online revocation list. Rotation via app version ship is the policy.
- Hash verification of the downloaded installer by the app. The hash is
  surfaced for *manual* verification in v1; app-side check lands with
  auto-update later.
- Multi-key support (e.g., transition by trusting two keys simultaneously).
  Single-key with version-ship rotation is sufficient for the v1 trust
  model.
- Signing the feed metadata schema itself (the schema is application
  code, baked into the binary).
- Wire-protocol verification of the binary itself beyond what Gatekeeper /
  smartscreen already do (out of scope; `docs/CODE-SIGNING.md` covers
  installer signing).

## Review (2026-05-12)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- Diff at commit `f9fe7ac`: 12 files, +802/-132 lines. Implementation faithful to the design.
- Verification-before-parse order correct — the bytes that JSON.parse decodes are exactly the bytes whose signature was verified (no TOCTOU). Comment at line 134 explicitly calls this out.
- Empty key short-circuit (lines 60-63) avoids network IO until the maintainer configures the key. Lets the feature ship in code form.
- Strict mode is genuine: no `allow-unsigned` branch; configured key + unsigned feed → sig fetch fails → banner hidden.
- Sig length pre-check (lines 109-115) rejects malformed signatures before calling `subtle.verify` — defensive depth.
- Five distinct warn messages distinguish "maintainer hasn't signed yet" / "active attack" / "key rotation" / "malformed" / "transient fetch failure" — enough detail in main-process logs without leaking specifics to the user UX.
- Foundation-doc alignment: UPDATE-CHANNEL.md trust-model section rolled forward from deferral to realized contract. v1-ship-checklist.md got a tamper-rejection smoke step. No drift.
- Web Crypto Ed25519 on Node 24 had no API surprises.
- 793 core + 800 UI tests green; coverage spans empty-key, valid-sig, tampered-feed, wrong-length-sig, wrong-key, and sig-404 paths.

Approved and advancing to done. With this and encrypt-api-key both done, the parent epic `epic-v1-security-hardening` can now advance.
