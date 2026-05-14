---
id: epic-test-coverage-adversarial-pass-ui-assertion-gaps-update-banner-hash
kind: story
stage: implementing
tags: [testing]
parent: epic-test-coverage-adversarial-pass-ui-assertion-gaps
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Update banner SHA-256 hash display: pin render contract

## Scope

Strengthen the two existing hash-block tests in
`packages/ui/src/__tests__/update-banner.test.tsx` (lines 114–143) to
pin the full documented render contract:
1. When `installerSha256` is set, the `<details>` block renders
   **collapsed by default** (no `open` attribute on initial render),
   and the **full hash** is visible in a `<code>` element (no
   truncation, no ellipsis) both before and after expanding.
2. When `installerSha256` is absent, the **entire** hash block
   (summary + details + shasum hint) does not render.

Rename the two tests for spec-pinning clarity, and add a one-line
comment at the conditional block in
`packages/ui/src/components/update-banner.tsx` that points back to
the two test names.

This story implements Unit 2 of the parent feature. The full
implementation spec — including the exact replacement test bodies
and the source-comment text — is in the parent feature's
`## Implementation Units` section, Unit 2.

## Files touched

- `packages/ui/src/__tests__/update-banner.test.tsx` — replace the
  two tests at lines 114–143 with the renamed, stronger versions.
- `packages/ui/src/components/update-banner.tsx` — add a comment in
  the `latest.installerSha256 &&` conditional block (around line 32).

No new files. No new runtime code paths.

## Acceptance criteria

- [ ] The two old test names
  (`"renders the SHA-256 hash details block when installerSha256 is present"`
  and `"does not render the SHA-256 block when installerSha256 is absent"`)
  no longer exist in the file.
- [ ] A test named
  `"renders the SHA-256 hash <details> block collapsed by default with the full hash visible when expanded (installerSha256 set)"`
  exists and passes.
- [ ] A test named
  `"does not render the SHA-256 <details> block when installerSha256 is absent"`
  exists and passes.
- [ ] The "present" test asserts: `<details>` has no `open` attribute
  on initial render; the hash is in a `<code>` element; `textContent`
  equals the full 64-char input exactly; no ellipsis characters;
  hash remains fully visible after `open` attribute is set.
- [ ] The "absent" test asserts: no summary text, no `<details>`
  element in the document, no `shasum -a 256` hint text.
- [ ] `packages/ui/src/components/update-banner.tsx` has a comment
  in the conditional block that references the two test names as
  the pin.
- [ ] `pnpm --filter @praxis/ui test` is green.
- [ ] `pnpm typecheck` and `pnpm lint` are green at the repo root.

## Out of scope

- Changing the visual styling of the hash block (collapsed look,
  expanded look, monospace font).
- Adding truncation or a "copy to clipboard" affordance.
- Mocking out the `<details>` element's click-toggle behavior — jsdom
  does not implement it, and the contract pins the markup state, not
  the click handler.
- Editing `docs/ARCHITECTURE.md` or any spec doc. Once the test names
  assert the contract, the test names ARE the pin.
