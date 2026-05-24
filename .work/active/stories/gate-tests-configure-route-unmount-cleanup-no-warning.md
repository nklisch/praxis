---
id: gate-tests-configure-route-unmount-cleanup-no-warning
kind: story
stage: drafting
tags: [testing, ui]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: tests
created: 2026-05-23
updated: 2026-05-23
---

# Unmount-during-pending-`active()` cleanup is implicit — no console-warning assertion

## Priority
Medium

## Spec reference
Item: `story-configure-route-reuse-and-reset`
Acceptance criterion:
> The unmount cleanup (`cancelled` flag) prevents setState on an
> unmounted component if the user navigates away mid-async.

Story implementation notes say `(The "reuses existing session" test
also implicitly covers the unmount-cleanup path via the cancelled
flag — no extra unmount test was added because React Testing Library's
cleanup in afterEach exercises unmount.)` — but the absence of a
console warning isn't asserted, so a regression that removed the
`cancelled` guard would not fail the test.

## Gap type
missing test for spec-mandated behavior (assertion oracle is weak)

## Suggested test
```ts
it("unmounting during pending active() does not setState (no React warning)", async () => {
  const consoleError = vi.spyOn(console, "error");
  let resolveActive!: (v: SessionHandle | null) => void;
  const client = makeClient(lockClient, {
    active: vi.fn().mockReturnValue(new Promise(r => { resolveActive = r; })),
  });
  const { unmount } = renderRoute(client);
  unmount();
  resolveActive({ sessionId: brandId("x"), modeId: "configure", startedAt: 0 } as SessionHandle);
  await new Promise(r => setTimeout(r, 0));
  expect(consoleError).not.toHaveBeenCalledWith(expect.stringMatching(/unmounted/i));
});
```

## Test location (suggested)
`packages/ui/src/__tests__/configure-route.test.tsx`
