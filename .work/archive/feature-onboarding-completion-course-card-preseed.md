---
id: feature-onboarding-completion-course-card-preseed
kind: story
stage: done
tags: [ui, onboarding]
parent: feature-onboarding-completion
depends_on: []
release_binding: v0.1.1
gate_origin: null
created: 2026-05-12
updated: 2026-05-12
---

# Pre-seed bootstrap message on canonical-pack course-card click

## Scope

Story 2 of `feature-onboarding-completion`. Two of the three course-card
click handlers (Algebra and Biology) pre-seed a bootstrap-session message
after `session.start` resolves, so the user lands in a session that's
already moving toward their chosen pack. The Syllabus card stays
as-is (no pre-seed; user uploads their own materials).

UI-side approach: after `client.session.start({ modeId: "bootstrap" })`
resolves, call `client.session.send(handle.sessionId, message)` with the
pack-specific message. No new IPC, no `session.start` parameter change.

## Files to touch

- `packages/ui/src/components/onboarding-flow.tsx` (or the course-step file if separate) — extend the Algebra and Biology click handlers. Read the file to find the existing click-handler shape.
- Test file (find existing onboarding-flow test or course-step test) — add cases asserting the send is invoked with the correct message for each card; syllabus produces no `send`.

## Pre-seed messages

- Algebra (canonical) → `"Please use the canonical algebra-1 pack to create my course."`
- Biology (canonical) → `"Please use the canonical biology pack to create my course."`
- Syllabus → no pre-seed.

**Verify pack ids** during implementation: the exact `algebra-1` / `biology pack` wording must match what the bootstrap mode's tutor recognizes (the bootstrap role prompt already nudges canonical packs; the pre-seed message just saves the user a turn). Grep the bootstrap mode prompt or the pack registry for the canonical pack names and adjust the message text if needed.

## Acceptance criteria

- [ ] Clicking "Algebra (canonical)" calls `session.start` → `session.send` with the algebra pre-seed message.
- [ ] Clicking "Biology (canonical)" calls `session.start` → `session.send` with the biology pre-seed message.
- [ ] Clicking "From your own syllabus" calls `session.start` only; no `session.send` follow-up.
- [ ] All three paths still open a bootstrap-mode session and route the user to the chat tab (per existing onboarding behavior).
- [ ] No regression in existing onboarding tests.
- [ ] At least 3 new tests (one per card) lock the contract.

## Implementation notes

- The pre-seed `send` should happen AFTER `session.start` resolves and BEFORE (or as part of) the tab-navigation step, so the user sees the message already in flight when they land in the chat.
- If `session.send` is async with an error path, log warnings but don't block the navigation — the user's experience shouldn't degrade if the pre-seed fails for some transient reason.

## References

- Design: `.work/active/features/feature-onboarding-completion.md` (Story 2)
- Origin idea: `.work/backlog/idea-onboarding-course-card-pre-seed.md`
- Pattern: `session-tab-open-flow` — see `.claude/skills/patterns/session-tab-open-flow.md` for the existing session.start → tabs.open → navigate chain.

## Implementation notes

### Pack names verified

Confirmed pack ids from `packages/curriculum/packs/algebra-1.json` (`"id": "algebra-1"`) and `packages/curriculum/packs/biology.json` (`"id": "biology"`). The pre-seed message text uses these ids verbatim:

- Algebra: `"Please use the canonical algebra-1 pack to create my course."`
- Biology: `"Please use the canonical biology pack to create my course."`

These match the story spec exactly — no text adjustments needed.

### Sequence chosen: start → fire-and-forget send → tabs.open → navigate

The `openSessionInTab` helper was inlined into `handleStart` for the Algebra and Biology paths because the helper provides no hook between `start` and `tabs.open`. The sequence:

1. `client.session.start({ modeId: "bootstrap" })` → `handle`
2. (algebra/biology only) fire a background `void (async () => { for await (const _ of client.session.send(handle.sessionId, message)) {} })()` — starts the stream and lets it drain on its own without blocking
3. `client.tabs.open({ sessionId: handle.sessionId })` → `tab`
4. `navigate({ to: "/chat/$tabId", params: { tabId: tab.id } })`

The syllabus path continues to use the same inline sequence but skips step 2 (`PRESEED_MESSAGES.syllabus === null`).

### Error handling for transient send failures

The background IIFE wraps the `for await` loop in a `try/catch`. On error it calls `console.warn("[onboarding] pre-seed send failed (non-blocking):", err)` and the loop exits cleanly. Navigation proceeds regardless — the user can type the equivalent message themselves.

### Tests added

Three new tests under `describe("pre-seed messages on canonical course cards")` in `packages/ui/src/__tests__/onboarding-flow.test.tsx`:

1. **Algebra card pre-seeds canonical algebra-1 pack message** — clicks the Algebra card, asserts `sendSpy` called with `("sess-1", "Please use the canonical algebra-1 pack to create my course.")`.
2. **Biology card pre-seeds canonical biology pack message** — same pattern for the Biology card.
3. **Syllabus card does not call session.send** — clicks the Syllabus card, waits for `tabs.open` to have been called, asserts `sendSpy` not called.

The `buildClient` helper was extended with a `sendSpy` option and a `send` mock that returns an async iterable completing immediately.

### Verification

- `pnpm --filter @praxis/ui typecheck` — passed
- `pnpm biome check` on modified files — passed (also auto-fixed formatter)
- `pnpm --filter @praxis/ui test` — 830/830 passed (16 in onboarding-flow.test.tsx, 13 pre-existing + 3 new)
- `pnpm typecheck` (full workspace) — passed

## Review (2026-05-12)

**Verdict**: Approve

**Blockers**: none. **Important**: none. **Nits**: none.

**Notes**:
- Diff at commit `29549db`: clean. The fire-and-forget IIFE pattern (`void (async () => { for await (...) {} })()`) starts the stream without blocking navigation — correct shape for a non-blocking pre-seed. try/catch with warn-log + cleanup matches the design's "transient send failure shouldn't degrade UX" requirement.
- Pack ids verified against the actual canonical packs (`algebra-1`, `biology`) — no message text adjustment needed.
- `openSessionInTab` helper inlined into `handleStart` because the helper provided no hook between `start` and `tabs.open` — a reasonable structural choice. The syllabus path stays clean (just skips the pre-seed step).
- 3 new tests + `buildClient` helper extension for the `sendSpy`. Test count went up by 3 (16 vs 13 prior in `onboarding-flow.test.tsx`).

Approved and advancing to done.
