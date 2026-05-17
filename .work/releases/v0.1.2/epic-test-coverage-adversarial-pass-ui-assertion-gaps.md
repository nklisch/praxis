---
id: epic-test-coverage-adversarial-pass-ui-assertion-gaps
kind: feature
stage: done
tags: [testing]
parent: epic-test-coverage-adversarial-pass
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# UI assertion gaps — banner hash display and sub-agent collision

## Brief

Two gate-tests findings live in UI / registry code where the spec
pins specific assertable contracts and the test suite is silent on
them. The update banner's installer-hash display contract specifies
that when `installerSha256` is set, a `<details>` block renders
collapsed by default with the full hash visible (no truncation) when
expanded, and when the field is absent the block doesn't render — but
no test exercises either valid or invalid partition. The sub-agent
registry treats a duplicate `parentCallId` collision as a silent no-op,
which is the existing behavior locked by one test, but the spec is
silent on whether duplicate-starts should warn-log so they're
diagnosable.

This feature bundles both because each is a small, isolated test
assertion (or test + small runtime change in the sub-agent case) and
because deciding the spec-silent pinning style for the sub-agent
collision — confirm silent-no-op with a doc note, or change the
contract to warn-log — applies the same decision pattern the ingestion
feature also faces. One design pass, one shared answer.

## Epic context

- Parent epic: `epic-test-coverage-adversarial-pass`
- Position in epic: independent. Parallelizable with the other two
  features.

## Scope absorbed from backlog

- `gate-tests-update-banner-installer-hash-display` — update banner
  hash block render contract (collapsed-by-default, full-hash-when-
  expanded, absent when no hash) not pinned by tests.
- `gate-tests-sub-agent-collision-warn-log` — duplicate `parentCallId`
  collision contract (silent-no-op vs. warn-log) unpinned by spec;
  decide which is correct and pin it.

## Foundation references

- `docs/ARCHITECTURE.md` — sub-agent transparency contract (the
  `SubAgentRegistry` section), update-feed signing flow
- `CLAUDE.md` — `subscriber-fanout-stream` pattern (sub-agent registry
  consumer side)

## Anchors (current implementation)

- Update banner —
  `packages/ui/src/components/update-banner.tsx` (component)
  `packages/ui/src/__tests__/update-banner.test.tsx` (test file —
  may need creating)
- Sub-agent registry —
  `packages/core/src/sub-agents/sub-agent-registry.ts` (or equivalent)
  `packages/core/src/__tests__/sub-agent-registry.test.ts` (existing
  silent-no-op test lives here)
- Sub-agent registry consumer in UI —
  `packages/ui/src/components/sub-agent-block.tsx` (or equivalent)

## Pre-design decisions (2026-05-14)

- **Spec-silent pinning style**: tests with explicit names + one-line
  source comments. No runtime warn-log added.
- **Sub-agent collision contract**: silent-no-op stays as the
  documented behavior. The existing test gets renamed to assert the
  intent (`it("start() with same parentCallId is a silent no-op (by
  design — collision is a registry guarantee, not an error)", ...)`)
  and a comment at the early-return site in the registry points back
  to the test.
- **Update-banner hash display**: two tests — one for `installerSha256`
  set (renders the `<details>` block, collapsed by default, full hash
  visible when expanded — no truncation), one for `installerSha256`
  absent (no block renders).

## Architectural choice

This is a test-assertion-strengthening feature. No runtime code changes
beyond a single one-line source comment per area. Approach: in each
package, edit the existing test file in place — rename the sub-agent
collision test, add or strengthen the two banner-hash tests — and add
one source-comment line per pinned contract pointing back to the
asserted test name. No new test files, no new runtime code paths, no
spec-doc edits (the contracts are already pinned-in-name once the tests
land).

Rejected alternatives:
- **Runtime warn-log for sub-agent collision** — pre-design decision
  locked silent-no-op. Warn-log would change a contract for a registry
  guarantee, breaking callers who rely on idempotency.
- **New `update-banner-hash.test.tsx` file** — the existing
  `update-banner.test.tsx` already has two hash-block tests (lines
  114–143); strengthening them is one file edit. A new file would
  fragment the banner suite for no test-isolation benefit.

## Implementation Units

### Unit 1: Sub-agent collision test rename + source comment
**File**: `packages/core/src/services/__tests__/subagent-registry.test.ts`
**File**: `packages/core/src/services/subagent-registry.ts`
**Story**: `epic-test-coverage-adversarial-pass-ui-assertion-gaps-subagent-collision`

Rename the existing collision test (currently at line 97) to assert
intent rather than mechanics, and tighten its body to also assert the
debug log fires (the existing test only asserts no event and no
duplicate item — it doesn't pin the documented `log.debug(...)` call,
which is the diagnostic seam someone would reach for if collisions
become a problem).

```typescript
// packages/core/src/services/__tests__/subagent-registry.test.ts
// Replace the test at line 97:
it("start() with same parentCallId is a silent no-op (by design — collision is a registry guarantee, not an error)", () => {
  // Capture the logger so we can pin the debug-log diagnostic seam.
  const logger = noopLogger();
  const r = new SubAgentRegistryImpl({
    log: logger as ReturnType<typeof noopLogger>,
    now: () => fakeNow.value,
    // biome-ignore lint/suspicious/noExplicitAny: fake timer compatibility
    setTimeout: fakeSetTimeout as any,
    resolveLabel: (toolName) => `[${toolName}]`,
  });
  const localEvents: SubAgentEvent[] = [];
  const unsub = r.subscribe((e) => localEvents.push(e));
  localEvents.length = 0; // drop snapshot
  r.start({ parentCallId: "call-1", sessionId: "sess-1" as any, label: "first" });
  localEvents.length = 0; // drop first "started"
  r.start({ parentCallId: "call-1", sessionId: "sess-1" as any, label: "second" });
  // No event is emitted for the collision.
  expect(localEvents).toHaveLength(0);
  // No duplicate item is created.
  expect(r.list()).toHaveLength(1);
  // The original label is preserved (the second start is fully ignored,
  // it does NOT update the existing item's label).
  expect(r.list()[0]?.label).toBe("first");
  // The collision is logged at debug for diagnosability without alarm.
  expect(logger.debug).toHaveBeenCalledWith(
    "subagent-registry.start.collision",
    { parentCallId: "call-1" },
  );
  unsub();
});
```

Then add a one-line source comment at the early-return site in the
registry:

```typescript
// packages/core/src/services/subagent-registry.ts, in start():
if (this.items.has(parentCallId)) {
  // Collision is a registry guarantee, not an error: the caller may
  // re-invoke start() for the same parentCallId (e.g. a session resumes
  // a sub-agent stream). Silent-no-op by design — pinned by
  // "start() with same parentCallId is a silent no-op (by design ...)"
  // in subagent-registry.test.ts.
  this.deps.log.debug("subagent-registry.start.collision", { parentCallId });
  return this.makeHandle(parentCallId);
}
```

**Implementation Notes**:
- The existing test scope uses the module-level `registry` from
  `beforeEach`; the rewritten test instantiates its own registry so the
  logger is the local `noopLogger()` instance and `debug` is a
  `vi.fn()` that can be asserted on. Keeping it self-contained avoids
  smearing logger-mock setup across all tests in the file.
- The "original label preserved" assertion is the load-bearing
  behavioral pin: it confirms the second `start()` is a *no-op* on the
  item, not a "merge fields from new args" update. Without this, a
  future refactor could change the start() handler to update the label
  on collision and still pass the existing assertions.
- The debug-log assertion pins the diagnostic seam name; if someone
  changes the log key or args, the test fails loudly.

**Acceptance Criteria**:
- [ ] The old test name `"start() with same parentCallId is a no-op (collision)"`
  no longer exists in the file.
- [ ] A test named `"start() with same parentCallId is a silent no-op (by design — collision is a registry guarantee, not an error)"`
  exists and passes.
- [ ] That test asserts: zero events emitted on the collision, list()
  length stays at 1, the item's `label` is still `"first"`, and
  `log.debug` was called with `"subagent-registry.start.collision"`
  and `{ parentCallId: "call-1" }`.
- [ ] `packages/core/src/services/subagent-registry.ts` has a comment
  block at the collision early-return site that references the test
  name as the pin.
- [ ] `pnpm --filter @praxis/core test` is green.
- [ ] `pnpm typecheck` and `pnpm lint` are green.

---

### Unit 2: Update-banner hash display assertions tightened
**File**: `packages/ui/src/__tests__/update-banner.test.tsx`
**File**: `packages/ui/src/components/update-banner.tsx`
**Story**: `epic-test-coverage-adversarial-pass-ui-assertion-gaps-update-banner-hash`

The two existing hash tests at lines 114–143 of `update-banner.test.tsx`
assert the summary text and that the hash value is "in the document,"
but they don't pin:
1. **Collapsed by default**: the `<details>` element must NOT have the
   `open` attribute on initial render.
2. **Full hash visible when expanded**: after firing `click` (or
   `toggle`) on the `<summary>`, the hash text must be present and
   equal to the full 64-char input — never truncated, never partially
   substring-matched.
3. **Single-element rendering**: the full hash must appear in one
   `<code>` element so layout / copy-paste works (asserts the
   `.hashValue` element's `textContent` strictly equals the input).

Replace the two existing tests with the stronger versions and rename
them for spec-pinning clarity.

```typescript
// packages/ui/src/__tests__/update-banner.test.tsx
// Replace the two tests at lines 114–143:

it("renders the SHA-256 hash <details> block collapsed by default with the full hash visible when expanded (installerSha256 set)", async () => {
  const sha256 = "0123456789abcdef".repeat(4); // exactly 64 hex chars
  renderBanner({
    status: "available",
    current: "1.0.0",
    latest: {
      version: "1.0.1",
      downloadUrl: "https://example.com/Praxis-1.0.1.dmg",
      installerSha256: sha256,
    },
  });

  await waitFor(() => expect(screen.getByText(COPY.update.available("1.0.1"))).toBeDefined());

  // The summary is rendered; we use it to locate the parent <details>.
  const summary = screen.getByText("Verify download · SHA-256");
  const details = summary.closest("details");
  expect(details).not.toBeNull();
  // Pinned contract: collapsed by default — no `open` attribute on
  // initial render.
  expect(details?.hasAttribute("open")).toBe(false);

  // Pinned contract: the full hash is in the DOM, in a single element,
  // and is the COMPLETE 64-char string (no truncation, no ellipsis).
  const hashEl = screen.getByText(sha256);
  expect(hashEl.tagName.toLowerCase()).toBe("code");
  expect(hashEl.textContent).toBe(sha256);
  expect(hashEl.textContent?.length).toBe(64);
  expect(hashEl.textContent).not.toMatch(/…|\.\.\./);

  // Expand the <details> and confirm the hash remains fully visible.
  // (jsdom doesn't auto-toggle <details> on summary click — set the
  // `open` attribute directly to simulate user expansion, which mirrors
  // the browser-level effect of clicking summary.)
  details?.setAttribute("open", "");
  expect(screen.getByText(sha256).textContent).toBe(sha256);
});

it("does not render the SHA-256 <details> block when installerSha256 is absent", async () => {
  renderBanner({
    status: "available",
    current: "1.0.0",
    latest: { version: "1.0.1", downloadUrl: "https://example.com/Praxis-1.0.1.dmg" },
  });

  await waitFor(() => expect(screen.getByText(COPY.update.available("1.0.1"))).toBeDefined());

  // Pinned contract: no summary, no <details>, no shasum hint — the
  // whole hash block must be absent.
  expect(screen.queryByText("Verify download · SHA-256")).toBeNull();
  expect(document.querySelector("details")).toBeNull();
  expect(screen.queryByText(/shasum -a 256/)).toBeNull();
});
```

Then add a one-line source comment at the conditional block in the
component:

```tsx
// packages/ui/src/components/update-banner.tsx, around line 32:
{latest.installerSha256 && (
  // Hash block: collapsed by default (no `open` attr), renders the
  // full SHA-256 verbatim in <code> (no truncation). Absent entirely
  // when `installerSha256` is unset. Pinned by the two
  // "renders the SHA-256 hash <details> block ..." tests in
  // update-banner.test.tsx.
  <details className={styles.hashDetails}>
    ...
  </details>
)}
```

**Implementation Notes**:
- `jsdom` does NOT toggle `<details>` open in response to a `click` on
  the `<summary>` element (it implements DOM but not the `<details>`
  interactive behavior). The test must set the `open` attribute
  programmatically to simulate the expanded state — this matches what
  the browser does and what the contract pins (the markup, not the
  click handler).
- Use `screen.getByText(sha256)` rather than `screen.getByText(sha256, { exact: false })`
  so any future truncation would change the visible text and break the
  exact-match getter.
- The "no truncation" assertion is enforced THREE ways: `textContent`
  exact match, length === 64, and a regex against ellipsis characters.
  This is intentional defense-in-depth — any one of the three failing
  signals a regression but the three together are noisy enough to make
  the intent obvious to a future reader.
- The "absent" test also asserts the `shasum -a 256` hint string is
  not present, since that's the third leaf node of the conditional
  block and pinning it makes the contract "whole block is gated"
  rather than "summary is gated."

**Acceptance Criteria**:
- [ ] The two old test names (`"renders the SHA-256 hash details block when installerSha256 is present"` and `"does not render the SHA-256 block when installerSha256 is absent"`) no longer exist.
- [ ] A test named `"renders the SHA-256 hash <details> block collapsed by default with the full hash visible when expanded (installerSha256 set)"` exists and passes.
- [ ] A test named `"does not render the SHA-256 <details> block when installerSha256 is absent"` exists and passes.
- [ ] The "present" test asserts: `<details>` has no `open` attribute on initial render; the hash is in a `<code>` element; `textContent` equals the full 64-char input exactly; no ellipsis characters appear; after setting `open` programmatically the hash is still fully visible.
- [ ] The "absent" test asserts: no summary text, no `<details>` element anywhere, no `shasum` hint text.
- [ ] `packages/ui/src/components/update-banner.tsx` has a comment in the conditional block that references the two test names as the pin.
- [ ] `pnpm --filter @praxis/ui test` is green.
- [ ] `pnpm typecheck` and `pnpm lint` are green.

---

## Implementation Order

The two units are fully independent (different packages, different
test files, no shared fixtures). They can be implemented in either
order or in parallel:

1. `epic-test-coverage-adversarial-pass-ui-assertion-gaps-subagent-collision` (parallelizable)
2. `epic-test-coverage-adversarial-pass-ui-assertion-gaps-update-banner-hash` (parallelizable)

Both stories declare `depends_on: []`.

## Testing

### Unit 1 tests: `packages/core/src/services/__tests__/subagent-registry.test.ts`

Single replacement test, see Unit 1 above. Verifies the documented
silent-no-op contract end-to-end:
- behavior (no events, no duplicate, label preserved)
- diagnostic seam (the `log.debug("subagent-registry.start.collision", ...)`
  call site)

The existing surrounding tests (snapshot, step events, finish,
interruption) remain untouched.

### Unit 2 tests: `packages/ui/src/__tests__/update-banner.test.tsx`

Two replacement tests, see Unit 2 above. Verifies the documented
hash-block contract:
- partition: `installerSha256` set vs absent
- behavior in the set case: collapsed by default, full hash in a
  `<code>` element, no truncation, still visible when expanded
- behavior in the absent case: entire block (summary + details +
  hint) is gone

The existing surrounding tests (disabled / up-to-date / error /
dismissed / download link / dismiss flow) remain untouched.

## Risks

**Low risk overall.** This is test-text-strengthening with one-line
source-comment additions; the runtime code paths and their behavior
are unchanged.

- **`<details>` toggling in jsdom**: jsdom does not toggle `<details>`
  on summary-click. Mitigated by setting the `open` attribute
  programmatically, which is what the contract pins (the markup
  state, not the click handler — the click handler is browser-native
  behavior we don't own).
- **Test name churn breaking external references**: if any CI report,
  documentation, or `.work/` item references the old test names by
  exact string, those references go stale. Mitigated by `grep`-ing
  for the old names before committing and updating any references
  found (none expected; quick check during implementation).

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Both child stories at done. Source-comment back-references to the test names landed in both runtime files, strengthening the pin in both directions. Children-complete.
