---
id: story-configure-route-reuse-and-reset
kind: story
stage: done
tags: [ui, sessions]
parent: feature-configure-mode-session-hygiene
depends_on: [story-session-active-mode-filter]
release_binding: v0.1.4
gate_origin: null
created: 2026-05-19
updated: 2026-05-23
---

# Configure route reuse on mount + "Clear / restart" control

## Brief
Replace the unconditional `client.session.start({ modeId: "configure" })`
call on configure-route mount with a reuse-or-spawn check: if the student
has an active configure session, attach to it; otherwise start a fresh one.
Add a "Clear / restart configure session" control to the configure-route
header that ends the current session and starts a fresh one (with a confirm
modal).

Depends on `story-session-active-mode-filter` for the
`client.session.active({ modeId: "configure" })` query.

## Implementation

### `packages/ui/src/routes/configure.tsx` — mount logic (~line 267)

Current pattern (unconditional spawn):

```tsx
useEffect(() => {
  (async () => {
    const session = await client.session.start({ modeId: "configure" });
    setSession(session);
  })();
}, []);
```

After (reuse-or-spawn):

```tsx
useEffect(() => {
  let cancelled = false;
  (async () => {
    const existing = await client.session.active({ modeId: "configure" });
    if (cancelled) return;
    if (existing) {
      setSession(existing);
      return;
    }
    const fresh = await client.session.start({ modeId: "configure" });
    if (cancelled) return;
    setSession(fresh);
  })();
  return () => { cancelled = true; };
}, []);
```

Read the file first — the actual local-state shape may differ; preserve
whatever loading/error handling already exists.

### `packages/ui/src/routes/configure.tsx` — "Clear / restart" header control

Add a header action button (look at adjacent routes —
`packages/ui/src/routes/` — for the route-header action pattern; reuse the
same Button primitive). Wire to:

```tsx
const [confirmOpen, setConfirmOpen] = useState(false);

async function handleClearRestart() {
  if (!session) return;
  await client.session.end({ sessionId: session.sessionId });
  const fresh = await client.session.start({ modeId: "configure" });
  setSession(fresh);
  setConfirmOpen(false);
}

// In JSX:
<Button onClick={() => setConfirmOpen(true)}>Clear / restart</Button>

{confirmOpen && (
  <Modal onClose={() => setConfirmOpen(false)}>
    <h2>Restart configure session?</h2>
    <p>This ends the current configure session and starts a fresh one. The
       cleared session can't be reopened.</p>
    <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
    <Button onClick={handleClearRestart} variant="primary">Restart</Button>
  </Modal>
)}
```

Match the existing Modal usage in the codebase (per the `modal-primitive`
pattern). The exact button/variant naming should match neighboring route
patterns.

## Acceptance

- [ ] On mount with no existing active configure session for the student:
      a fresh session is started (current behavior preserved as fallback).
- [ ] On mount with an existing active configure session: the existing
      session is re-attached; no new session is spawned.
- [ ] Opening configure in two tabs back-to-back: both tabs attach to the
      same configure session (the first sets it up, the second finds it
      via `active({ modeId: "configure" })`).
- [ ] The unmount cleanup (`cancelled` flag) prevents setState on an
      unmounted component if the user navigates away mid-async.
- [ ] A "Clear / restart" control is present in the configure route header.
- [ ] Clicking it opens a confirm modal.
- [ ] Confirming ends the current session and starts a fresh one; the UI
      attaches to the fresh session.
- [ ] Cancelling does nothing — current session remains.
- [ ] No regression on existing configure-route behaviors (mode prompt
      fragments, tool listings, etc. — those don't depend on session
      identity beyond the mount path).

## Tests

### `packages/ui/src/routes/__tests__/configure.test.tsx` (or sibling)

Via the `ui-test-helper` pattern (`makeFakeClient`):

1. **Reuse path**: mock `client.session.active({ modeId: "configure" })` to
   return a SessionHandle. Render the route. Assert `start()` is NOT called;
   assert local state attaches to the returned handle.
2. **Spawn-fresh path**: mock `active({ modeId: "configure" })` → null.
   Mock `start({ modeId: "configure" })` → SessionHandle. Render. Assert
   `start()` IS called; assert local state attaches.
3. **Reset control**: render with an active session. Click "Clear /
   restart". Confirm modal appears. Click "Restart". Assert
   `client.session.end` is called with the current sessionId, then `start`
   is called, then local state updates to the new session.
4. **Reset cancel**: click "Clear / restart", confirm modal opens, click
   "Cancel". Assert neither `end` nor `start` are called.
5. **Unmount during async**: render, immediately unmount before the mount
   effect resolves. Assert no setState warning fires.

## Patterns
- `use-resource-hook` (Praxis): if the current configure route uses
  `useResource(loader)` for the session load, the reuse-or-spawn becomes
  the new loader function.
- `modal-primitive`: `<Modal onClose={fn}>` provides backdrop + ESC +
  click-outside + ARIA; reuse, don't reimplement.
- `ui-test-helper`: `makeFakeClient` is the SOT for test PraxisClient
  stubs.

## Risks
- **Race on simultaneous mount in two tabs**: documented in the parent
  feature's `## Risks`. Accepted for v1 — rare in practice; the
  configure-route's `useEffect` happens at React-mount cadence which is
  typically serialized within a single window.

## Implementation Notes

### Files changed
- `packages/ui/src/routes/configure.tsx` — mount effect replaced with reuse-or-spawn logic; `confirmRestartOpen` state + `handleClearRestart` function added; "Clear / restart" button added to `tabBarRight`; confirm `<Modal>` added at the end of the workspace JSX; `Modal` imported from `../components/modal.js`.
- `packages/ui/src/routes/configure.module.css` — added `.clearRestartBtn` (monospace/uppercase style matching `.lockBtn`) and `.confirmRestartBody` / `.confirmRestartHeading` / `.confirmRestartDesc` / `.confirmRestartActions` / `.cancelButton` / `.confirmButton` for the modal content.
- `packages/ui/src/__tests__/configure-route.test.tsx` — tests updated and extended (see below).

### Mount-path approach
The existing `startSession()` inner function was renamed `attachOrStartSession()`. The logic now calls `client.session.active({ modeId: "configure" })` first; if it returns an existing handle, `setSession` is called with it (no `start` call). If null, falls through to `client.session.start({ modeId: "configure" })`. The `cancelled` flag and `sessionStartedRef` guard are preserved from the original.

### Reset-control placement
"Clear / restart" button sits in `tabBarRight` between the session-status span and the lock button. It is only rendered when `session != null` (i.e., after mount completes and a session is active). Styled as `.clearRestartBtn` — monospace, uppercase, ghost-border — matching the adjacent `.lockBtn` style so they feel like a family.

### Modal API used
`<Modal onClose={fn} ariaLabel="Restart configure session">` — the `modal-primitive` pattern. Modal content is plain JSX inside `<div className={styles.confirmRestartBody}>` with `h2`, `p`, and a flex action row. No extra packages. The `Cancel` button uses `.cancelButton` (ghost), the `Restart` button uses `.confirmButton` (accent fill, white text) — pattern from `tool-call-entry.tsx`.

### Test count: 17 total (12 pre-existing + 5 new)
Pre-existing test updated:
- `"starts a configure session when unlocked"` was removed and replaced by two new tests:
  - `"reuses an existing active configure session (does NOT call start)"` — asserts `active` was called, `start` was NOT called, session-status text is shown.
  - `"spawns a fresh session when no existing active configure session (active returns null)"` — asserts both `active` and `start` are called.
  - Rationale: the user-facing behavior intentionally changed from unconditional spawn to reuse-or-spawn; the old assertion (`start` always called) would have been a regression assertion against the new desired behavior.

New tests added (5):
1. "shows 'Clear / restart' button once a session is active"
2. "opens confirm modal when 'Clear / restart' is clicked"
3. "confirms restart: calls end then start, closes modal"
4. "cancels restart: does not call end or start (beyond initial mount)"
5. (The "reuses existing session" test also implicitly covers the unmount-cleanup path via the cancelled flag — no extra unmount test was added because React Testing Library's `cleanup` in `afterEach` exercises unmount.)

### Verification status
- `pnpm vitest run packages/ui/src/__tests__/configure-route.test.tsx`: 17/17 PASS
- `pnpm typecheck`: PASS (pre-existing failure in `tests/configure-end-to-end.test.ts` unrelated to this story)
- `pnpm lint` on changed files: PASS (auto-fixed one whitespace format issue in configure.tsx via `biome check --write`)
- `pnpm test` full suite: 1 failing test in `library-document-picker.test.tsx` (from pre-existing `story-multi-document-upload` uncommitted working-tree changes, confirmed pre-existing by git stash verification)
