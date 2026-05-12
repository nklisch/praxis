---
id: epic-bootstrap-readiness
kind: epic
stage: done
tags: [bootstrap, course-authoring, tutor-ux]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Bootstrap readiness — make the course-creator actually shippable to students

## Brief

A real attempt to build an Algebra 1 course in bootstrap mode (recorded in the
session that produced
`story-fix-block-claude-code-builtins-from-tutor` and a wave of related parks)
exposed bootstrap as a flow that limps to a finished course rather than walks
to one. The agent calls a tool that always throws, narrates the outline panel
in chat instead of pointing at it, runs `add-concept` silently as no-ops,
strands concepts and assessments when lessons are removed, can't ask the
student a clarifying question without a built-in tool that doesn't work, and
shows the student nothing while the model thinks. Every one of those friction
points is a separate park; bundled, they're a coherent arc: bootstrap is the
first thing a student touches, and right now it doesn't earn the next click.

This epic gathers the bootstrap-authoring API gaps, the chat-surface gaps
that surface during bootstrap, the prompt mistuning that makes the agent
verbose in the wrong places, and the draft-durability gap that makes recovery
expensive — and ships the bootstrap experience to a place where a real
student can sit down with their own materials and walk out with a working
course. The unifying outcome is "a non-developer can use bootstrap end-to-end
and trust the result." Naming/terminology, onboarding card pre-seeding, and
broader-scope chat improvements are deliberately out of scope; they're
adjacent arcs that won't block bootstrap landing.

## Decomposition

Split by capability into four features and three stories. The two parks
covering the `edit_draft` surface (silent no-ops + cascade gaps) merge
into one feature — they're the same handler, the same `DraftEditOp`
union, the same `BootstrapServiceImpl` draft state, and splitting them
would just create an artificial cross-feature edge. `durable-drafts`
ships first as a foundation because the new `edit_draft` ops in
`expressive-draft-api` should land on the persistent store directly,
avoiding a Map→SQLite migration for ops that don't exist yet. The
remaining four items (structured questions, in-flight affordances, and
the three small fix/cleanup stories) are independent and can land in
parallel with the foundation feature.

### Child features

- `epic-bootstrap-readiness-durable-drafts` — move the in-memory draft
  Map to SQLite-backed durable storage so partial courses survive
  restarts. Depends on: `[]`.
- `epic-bootstrap-readiness-expressive-draft-api` — extend `DraftEditOp`
  with idempotent `add_concept`, `relink_concept`, `add_edge`,
  cascade-clean removes, `validate_draft`, plus chunked queries (list
  units, list lessons in unit, get lesson detail, list dangling refs).
  Depends on: `[epic-bootstrap-readiness-durable-drafts]`.
- `epic-bootstrap-readiness-structured-questions` — add an
  `ask_student_question` tool that reuses the existing
  human-in-the-loop dispatch pattern (`docs/SPEC.md:109`) and the
  `QuickCheckService` infrastructure. Replaces the AskUserQuestion gap
  left by `story-fix-block-claude-code-builtins-from-tutor`. Depends
  on: `[]`.
- `epic-bootstrap-readiness-in-flight-affordances` — thinking indicator
  + working turn cancel. Wires the existing `praxis.session.send.cancel`
  AbortController through to `conv.abort()` (today it only breaks the
  IPC for-await, not the engine subprocess). Depends on: `[]`.

### Child stories (top-level under epic)

- `story-bootstrap-attach-document-fix` — drop `course.attach_document`
  from `bootstrapMode.toolNames` + prompt fragment. Tool throws on a
  bootstrap session every time because there's no `courseId` yet; minimal
  fix is to stop advertising it. Depends on: `[]`.
- `story-bootstrap-prompt-no-inline-outline` — revise
  `bootstrap-tools.ts` / `bootstrap-role.ts` (and audit `configure`
  mode) so the agent points at the outline panel instead of narrating
  it. Depends on: `[]`.
- `story-cleanup-stale-singular-draft-tool-refs` — five tool-description
  / jsdoc references to draft tools that no longer exist plus stale
  `packages/tools/dist/` artefacts. Already fully drafted at park time.
  Depends on: `[]`.

### Decomposition risks

- **`expressive-draft-api` is the riskiest child.** It changes the
  draft mutation surface that the explorer agent depends on, the
  `course.edit_draft` Zod schema visible to the model, and likely
  `docs/CONTRACT.md:1258-1260` (the draft-tool listing). Strong design
  pass needed before implementing; expect this child to spend the most
  time at `stage: drafting`.
- **Serialization point**: only `expressive-draft-api` waits on
  `durable-drafts`. If `durable-drafts` design surfaces a bigger schema
  question than expected, the whole epic stalls behind it. Mitigation:
  the design pass on `durable-drafts` should be the first thing
  autopilot picks; if it shows signs of expanding, re-evaluate whether
  to land the expressive ops against the in-memory store first and
  port later.

## Out of scope (intentionally separate)

- `idea-rename-bootstrap-and-explore` — student-facing terminology. Folds
  into a future "bootstrap brand pass" arc; not blocking the API work.
- `idea-onboarding-course-card-pre-seed` — onboarding flow. Builds on top
  of a robust bootstrap; sequence later.
- `idea-engine-cli-integration-smoke-test` — engine testing; broader than
  bootstrap. Separate testing-infrastructure track.

## Acceptance (epic-level, not feature-level)

- A student can drop a textbook into Praxis, run bootstrap to a confirmed
  course, and have every concept and assessment correctly linked to its
  lesson — no orphan concepts, no stale unit memberships, no dangling
  assessments, validation passing the first time.
- During bootstrap the agent can ask the student a structured question and
  receive a structured answer in the chat (no "Couldn't finish
  askuserquestion." regression).
- A student who closes the app mid-bootstrap can reopen and resume the
  same draft.
- The student sees a thinking indicator whenever the model is producing
  output, and can cancel a stuck turn with Esc.
- The bootstrap chat is decisions-and-questions only — the outline panel
  is the canonical artifact view.
- `pnpm typecheck && pnpm lint && pnpm test` green at every commit boundary.

## Source

Parked across this session by the user after a real Algebra 1 / 8th-grade
textbook bootstrap attempt; see commits `48b6ef0` through `2ccf2f7` and
`bc58cf7` for the originating story-fix and the wave of related parks.

## Epic Review (2026-05-10)

**Verdict**: Approve. Epic delivered as briefed.

All seven children at `done`:

**Features (4)** — each independently reviewed and approved:
- `epic-bootstrap-readiness-durable-drafts` — drafts now persist across
  restarts; `DraftStore` port + `SqliteDraftStore` adapter; 21 new tests.
- `epic-bootstrap-readiness-expressive-draft-api` — `DraftEditOp` gained
  relink/add-edge/remove-unit/validate-draft; `applyEdit` returns
  `{ state, warnings }`; cascade-clean on remove-lesson; four new
  chunked-read tools; 48 new tests.
- `epic-bootstrap-readiness-in-flight-affordances` — thinking indicator
  + Esc/Stop cancel wired end-to-end (IPC AbortController →
  `conv.abort()`); `interrupted` EngineEvent variant; 25 new tests.
- `epic-bootstrap-readiness-structured-questions` —
  `ask_student_question` tool reuses `QuickCheckService`; new
  `<StructuredQuestionCard />`; 41 new tests.

**Stories (3, top-level under epic)** — each reviewed and approved:
- `story-bootstrap-attach-document-fix` — removed the trap.
- `story-bootstrap-prompt-no-inline-outline` — prompt now points at
  the outline panel.
- `story-cleanup-stale-singular-draft-tool-refs` — 5 stale references
  cleaned + dist purged.

### Capability completeness

A student dropping a textbook into Praxis can now run bootstrap to a
confirmed course where: every concept and assessment is correctly
linked (validate-draft + cascade-cleans guarantee), the agent can ask
clarifying decisions via structured cards, drafts survive restart,
the chat shows a thinking indicator and supports Esc/Stop cancel,
and the agent points at the outline panel rather than narrating it
in chat. The original "broken bootstrap session" that surfaced all 8
parks has every failure mode addressed.

### Foundation-doc roll-forward

Multiple per-child review nits flagged that `docs/ARCHITECTURE.md`,
`docs/SPEC.md`, and `docs/CONTRACT.md` need rolling forward to
reflect: durable drafts, end-to-end cancel propagation,
`ask_student_question` in the tool listing, and the four new chunked
read tools + four new `DraftEditOp` variants. The docs gate at
`/agile-workflow:release-deploy` will catch all of these.

### Test delta

135 new tests across the epic. Full workspace suite 2547 passing.

### Out-of-scope items deferred (per epic brief)

- `idea-rename-bootstrap-and-explore` — terminology pass; separate arc.
- `idea-onboarding-course-card-pre-seed` — onboarding flow; builds on
  this epic.
- `idea-engine-cli-integration-smoke-test` — broader testing track.
