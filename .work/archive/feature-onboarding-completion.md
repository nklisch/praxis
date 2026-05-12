---
id: feature-onboarding-completion
kind: feature
stage: done
tags: [ui, onboarding]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: null
created: 2026-05-11
updated: 2026-05-12
---

# Onboarding flow completion

## Brief

Close the two known gaps in the first-run onboarding flow surfaced by review of
`epic-phase-19-first-run-flow`. The flow ships, but two design-spec items did not
land in v0.1.0 and force a manual hand-off the design explicitly wanted to remove.

**Gap 1 — Inline Claude Code sign-in in the engine step.** The design specced
that when the user selects `claude-code` as their engine, the engine step embeds
a "Sign in to Claude Code" affordance that triggers `<ClaudeAuthModal>` (the same
inline auth path used elsewhere in the app). The current implementation hides the
API-key field for Claude Code (and Ollama) but does not surface the sign-in
trigger. A user who picks Claude Code at onboarding has to skip the flow and
sign in from settings before they can run a session. The fix is bounded:
`packages/ui/src/components/onboarding-flow.tsx`'s `EngineStep` detects
`config.engineId === "claude-code"`, renders a button wired to
`<ClaudeAuthModal />`, reads sign-in state from `useAuthStatus()`, and flips the
label between "Sign in" and "Signed in".

**Gap 2 — Pre-seed course-card messages into the bootstrap session.** The course
step labels three paths — Algebra (canonical), Biology (canonical), From your
own syllabus — but all three open the same fresh bootstrap session with no
pre-seeded message. A click on "Biology (canonical)" lands the user in an empty
bootstrap chat and they have to remember to ask the agent to use the biology
pack. The labels suggest the course is already on its way; the UX should match.
The fix needs either a `session.start({ initialMessage })` parameter or a
follow-up `session.send` call. For Algebra: send "Please use the canonical
algebra-1 pack to create my course." after `session.start`. Same shape for
Biology. Syllabus stays as-is (no pre-seed). The bootstrap-mode role prompt
already nudges toward canonical packs; we just want the user not to have to type
the request first.

Both gaps are small, mechanical, and decouple onto two independent stories. The
design phase should decide whether the pre-seed mechanism is a new
`session.start` parameter (cleaner; reusable for other modes later) or a UI-side
`session.send` after open (smaller surface change). Either is acceptable.

Origins: `.work/backlog/idea-onboarding-claude-code-signin.md`,
`.work/backlog/idea-onboarding-course-card-pre-seed.md` (both from review of
`epic-phase-19-first-run-flow`).

<!-- Design and Implementation Notes accumulate here as work progresses. -->

## Design decisions

Ambiguities resolved during this design pass (autopilot delegation, judgment-based):

- **Pre-seed mechanism**: UI-side `session.send(handle.sessionId, message)` after `session.start`. The brief explicitly accepts either; UI-side is simpler (no IPC contract change, no additional `session.start` parameter to thread through the client/IPC/core stack). If a future mode wants `initialMessage` on start, that's a separate small refactor — premature here.
- **Pre-seed messages** (exact text):
  - Algebra → `"Please use the canonical algebra-1 pack to create my course."`
  - Biology → `"Please use the canonical biology pack to create my course."`
  - Syllabus → no pre-seed (user uploads their own materials and types from scratch).
  Pack ids verified against existing canonical packs at implementation time.
- **Sign-in button placement** (Gap 1): inside the EngineStep, right where the apiKey field would be for non-Claude-Code engines. Same vertical position so the visual rhythm is consistent across engine choices.
- **Sign-in button label**: `"Sign in to Claude Code"` when not signed in; `"Signed in to Claude Code ✓"` (or similar, leveraging existing copy) when signed in. The `useAuthStatus()` hook drives the label.
- **Signed-in state visual treatment**: muted / disabled-looking button when already signed in (still clickable to re-trigger the modal, e.g., for re-auth). Don't hide the button entirely — the user might want to switch accounts.
- **Story decomposition**: 2 child stories, both independent (different files, different concerns). Parallelizable in one wave.

## Architectural choice

**Two independent UI stories, no shared infrastructure**:
- Story 1 fixes Gap 1 in `EngineStep` only (one component, one new hook usage).
- Story 2 fixes Gap 2 in the course-card click handlers in `onboarding-flow.tsx` (or wherever those handlers live).

No new IPC, no new core types, no session.start parameter. Both ride on existing surfaces (`<ClaudeAuthModal>`, `client.session.send`, `useAuthStatus`).

## Implementation Units (child stories)

### Story 1: Inline Claude Code sign-in in EngineStep
**ID**: `feature-onboarding-completion-claude-code-signin`
**Depends on**: `[]`

Scope: In `packages/ui/src/components/onboarding-flow.tsx`'s `EngineStep`,
when `config.engineId === "claude-code"`, render a "Sign in to Claude Code"
button that opens `<ClaudeAuthModal>`. Read auth state via `useAuthStatus()`;
button label flips on signed-in. Hidden state when engineId !== "claude-code".

Files:
- `packages/ui/src/components/onboarding-flow.tsx` — extend `EngineStep`.
- `packages/ui/src/__tests__/onboarding-flow.test.tsx` (or similar — find existing test file) — add cases asserting the button renders only for claude-code, opens the modal on click, label flips based on `useAuthStatus()`.

Acceptance:
- [ ] When `config.engineId === "claude-code"` and `useAuthStatus().loggedIn === false`, the sign-in button is visible and labeled "Sign in to Claude Code".
- [ ] When signed-in, button label reads "Signed in" (or similar) and is visually muted but still clickable.
- [ ] Clicking the button opens `<ClaudeAuthModal />`.
- [ ] When `engineId !== "claude-code"`, the sign-in button is not rendered.
- [ ] Existing apiKey field logic (hidden for claude-code / ollama; visible otherwise) is unchanged.

### Story 2: Pre-seed course-card messages
**ID**: `feature-onboarding-completion-course-card-preseed`
**Depends on**: `[]`

Scope: Two course-card click handlers (Algebra, Biology) pre-seed a bootstrap
message after `session.start`. Syllabus stays no-pre-seed.

Files:
- `packages/ui/src/components/onboarding-flow.tsx` (or the course-step file if separate) — extend the Algebra and Biology click handlers to call `client.session.send(handle.sessionId, message)` after `session.start` resolves.
- Test file — add cases asserting the send is invoked with the correct message for each card; syllabus card produces no `send`.

Acceptance:
- [ ] Clicking "Algebra (canonical)" calls `session.start` → `session.send` with `"Please use the canonical algebra-1 pack to create my course."`.
- [ ] Clicking "Biology (canonical)" calls `session.start` → `session.send` with `"Please use the canonical biology pack to create my course."`.
- [ ] Clicking "From your own syllabus" calls `session.start` only; no `session.send`.
- [ ] All three paths still open a bootstrap-mode session and route the user to the chat tab as before.
- [ ] No regression in existing onboarding tests.

## Implementation Order

Both stories independent — implementable in parallel. The orchestrator runs
them as a 2-agent wave.

## Testing

Per-story tests above. Cross-cutting:
- `pnpm --filter @praxis/ui typecheck && lint && test`
- `pnpm typecheck` (root gate)

Manual smoke (out of automated test scope):
- Run `pnpm dev` with a fresh database; complete onboarding selecting Claude Code → confirm the sign-in button appears and opens the modal.
- Click "Algebra (canonical)" → confirm the bootstrap session opens with the pre-seed message visible as the first user turn.

## Risks

1. **`useAuthStatus()` may not exist with that exact name or signature.**
   Verify before implementation; the design body mentions it as a known hook.
   If it's named differently (e.g., `useClaudeAuthStatus()`), adapt.
2. **`<ClaudeAuthModal>` may already be in use elsewhere.** Reuse the same
   component; don't fork.
3. **`client.session.send(handle.sessionId, message)` shape may differ from
   what the story assumes.** Verify against the existing client API; adapt
   if needed.
4. **Pack ids** (`canonical algebra-1`, `canonical biology pack`) — verify
   the exact wording the bootstrap mode's tutor recognizes. The bootstrap
   mode's role prompt already nudges canonical packs; the pre-seed message
   needs to match what the tutor expects. If the tutor's tool layer keys
   on a specific phrase, use that phrase.

## Children complete + Review (2026-05-12, feature-level)

Both child stories landed and are at `stage: done`:

- `feature-onboarding-completion-claude-code-signin` — **done** (commit `59bf4be`). EngineStep renders sign-in button when `engineId === "claude-code"`; calls `client.claudeAuth.status()` directly (the design's mention of `useAuthStatus()` was the wrong hook — implementer correctly used `ClaudeAuthStatus.loggedIn`). 5 new tests.
- `feature-onboarding-completion-course-card-preseed` — **done** (commit `29549db`). Algebra and Biology cards pre-seed canonical-pack messages via fire-and-forget IIFE after `session.start`. Pack ids verified (`algebra-1`, `biology`). Non-blocking — pre-seed failure warn-logs, navigation proceeds. 3 new tests.

**Verdict**: Approve (feature-level).

**Notes**:
- Both gaps from `epic-phase-19-first-run-flow` review are closed.
- Decomposition matches design: 2 independent stories, no shared infrastructure, no IPC contract change.
- Foundation-doc alignment: no SPEC.md / VISION.md / ARCHITECTURE.md touched — the onboarding flow is implementation detail under the existing first-run epic.
- One discovery in Story 1 (the `useAuthStatus()` vs `claudeAuth.status()` distinction) — implementer recognized and corrected without bouncing back to design.
- Workspace verification: `pnpm typecheck` green; `pnpm --filter @praxis/ui test` 830 passing.

Feature delivered as briefed. Advancing to done; archiving feature + both stories.
