---
id: gate-tests-update-banner-installer-hash-display
kind: story
stage: implementing
tags: [testing]
parent: null
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-12
updated: 2026-05-17
---

# Update-feed installer hash UI display contract not pinned

## Priority
Low

## Spec reference
Item: `epic-v1-security-hardening-sign-update-feed` (Unit 4)
Acceptance criterion: "Banner shows the hash details block when `installerSha256` is set. Block is collapsed by default. Hash value is fully visible when expanded (no truncation). When `installerSha256` is absent, the block doesn't render."

## Gap type
Missing test for valid + invalid partitions

## Suggested test
```ts
// packages/ui/src/__tests__/update-banner.test.tsx
it("renders <details> hash block when installerSha256 is set, collapsed by default", () => {
  const banner = render(<UpdateBanner status={{ kind: "available", latest: { ..., installerSha256: "a".repeat(64) } }} />);
  expect(banner.container.querySelector("details")).not.toBeNull();
  expect(banner.container.querySelector("details")?.open).toBe(false);
  expect(banner.container.textContent).toContain("a".repeat(64));
});

it("does NOT render the hash block when installerSha256 is absent", () => { /* … */ });
```

## Test location (suggested)
`packages/ui/src/__tests__/update-banner.test.tsx`
