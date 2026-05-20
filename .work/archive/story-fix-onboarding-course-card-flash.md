---
id: story-fix-onboarding-course-card-flash
kind: story
stage: done
tags: [bug]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-19
---

# Onboarding course card flashes and closes immediately

## Symptom

During onboarding, clicking any course card (Algebra / Biology / Syllabus) on
step 3 makes the OnboardingFlow briefly flash its busy state and then close
back to the Library — the chat tab eventually appears a beat later, but the
intermediate flash makes it feel like the action failed. If
`client.session.start` actually fails (no engine configured, IPC error,
etc.), the user is silently stranded in the Library with no error and no
retry path.

## Root cause

`CourseStep.handleStart` in `packages/ui/src/components/onboarding-flow.tsx`
called `await onComplete()` **before** `client.session.start()`,
`client.tabs.open()`, and `navigate()`.

`onComplete` flips `useFirstRun`'s `completed=true`, which causes
`RootLayout` (`packages/ui/src/router.tsx:34-46`) to swap `<OnboardingFlow>`
for the main layout. The main layout renders the current route via
`<Outlet />` — and since the URL is still `/`, the user sees the Library
route. Only *after* that re-render does the function continue to
`session.start → tabs.open → navigate("/chat/$tabId")`. The intermediate
Library render is the "flash"; the unmount of OnboardingFlow is the "closes
immediately".

The error branch was structurally unreachable too: the `catch` block calls
`setError`/`setBusy` on a component that has already unmounted, so the
user never sees the error UI.

## Fix approach

Reorder `handleStart`: do all session work first (`session.start`,
fire-and-forget pre-seed, `tabs.open`, `navigate`), then call `onComplete()`
last. This means:

- The OnboardingFlow stays mounted (with its busy state) until the chat
  tab is ready — no Library flash, one visual transition from onboarding
  straight to chat.
- If `session.start` throws, the `catch` block fires on the still-mounted
  OnboardingFlow, the error UI is visible, and the first-run flag has *not*
  been flipped — so the user can retry without losing the onboarding
  context.

Single-file change in the same component; no API or prop changes.

## Regression test

`packages/ui/src/__tests__/onboarding-flow.test.tsx` adds two guards:

- `course card runs session work before onComplete (no library flash)` —
  asserts call order `["session.start", "tabs.open", "onComplete"]`.
- `course card does not mark complete if session.start fails` — asserts
  `onComplete` is **not** called when `session.start` rejects, and that
  the user-facing "couldn't start" error renders.

## Implementation notes

Files changed:
- `packages/ui/src/components/onboarding-flow.tsx` — moved `await onComplete()`
  from the top of the try-block to after `await navigate(...)`; replaced the
  old comment block with a short note explaining the ordering invariant.
- `packages/ui/src/__tests__/onboarding-flow.test.tsx` — added the two
  regression tests described above.

Test added: see Regression test section.

Adjacent issues observed but **not** bundled:
- `tests/configure-end-to-end.test.ts:197` fails typecheck with a missing
  `conceptMaps` property on `AuthoringServiceDeps`. Pre-existing on `main`
  (confirmed via `git stash && pnpm typecheck`). Not parked separately —
  the user already deleted `idea-fix-session-service-exactoptional-baseline.md`
  from backlog this session, suggesting these end-to-end deps drift items
  are being consolidated elsewhere.
- Workspace lint shows 522 pre-existing errors unrelated to this surface.
  Both files I touched lint clean.

## Review (2026-05-19)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- Root-cause fix: handleStart reorder moves `await onComplete()` after the full session.start → preseed → tabs.open → navigate chain (commit `85e4de8`).
- Two regression tests guard both behaviors — ordering (`["session.start", "tabs.open", "onComplete"]`) and error-recovery (no flag flip on `session.start` rejection). Both pass alongside the 19 existing tests in the suite (21/21 green).
- No foundation-doc drift; no breaking changes; touched files lint clean.
