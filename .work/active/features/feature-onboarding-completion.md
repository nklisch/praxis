---
id: feature-onboarding-completion
kind: feature
stage: drafting
tags: [ui, onboarding]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
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
