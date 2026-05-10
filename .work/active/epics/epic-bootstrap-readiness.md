---
id: epic-bootstrap-readiness
kind: epic
stage: drafting
tags: [bootstrap, course-authoring, tutor-ux]
parent: null
depends_on: []
release_binding: null
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

## Realized decomposition (to be expanded by `/agile-workflow:epic-design`)

These backlog items are the inputs. `/agile-workflow:epic-design` should
read each, decide which to merge into a single feature versus split apart,
and produce child features + stories at `.work/active/` with declared
`depends_on` chains. The likely groupings are sketched below — design is
free to re-cluster.

**Likely Feature: Expressive draft-editing API** (probably merges these two
parks; same `edit_draft` surface, complementary symptoms)
- `idea-course-edit-draft-api-gaps` — silent `add-concept` no-ops, missing
  `relink_concept` op, missing in-`edit_draft` `add_edge` op, no
  `validate_draft` pass.
- `idea-bootstrap-draft-edit-and-query-apis` — `remove-lesson` doesn't
  cascade-clean unit memberships or lesson assessments; `show_draft` returns
  the whole graph (needs chunked / progressive disclosure: list units, list
  lessons in unit, get lesson detail, list dangling refs).

**Likely Feature: Durable draft persistence**
- `idea-persist-partial-courses` — drafts live in memory only and die with
  the session. Persist to disk during construction so cleanup work isn't
  lost and the student can resume.

**Likely Feature: Tutor-initiated structured questions**
- `idea-tutor-structured-questions-via-custom-mcp` — `AskUserQuestion`
  successor as a first-party custom MCP tool routed to the chat UI's
  quick-check surface. Pattern inspired by upstream
  `@nklisch/claude-cli-sdk`'s `Tools.intercept('AskUserQuestion', handler)`.
  Unblocks the bootstrap agent's clarifying-question flow specifically.

**Likely Feature: In-flight chat affordances**
- `idea-thinking-indicator-and-turn-cancel` — thinking animation when
  waiting on the model + Esc-to-cancel an in-flight turn (engine already
  has `conv.abort()`; need IPC + UI wiring + clean episodic-log mark).

**Likely Stories (top-level under epic; small, fix-shaped)**
- `idea-bootstrap-attach-document-throws-without-course` — drop the tool
  from `bootstrapMode.toolNames` (or teach defer-attach via the draft).
- `idea-bootstrap-prompt-no-inline-outline` — revise
  `packages/curriculum/src/modes/fragments/bootstrap-*.ts` so the agent
  points at the outline panel instead of narrating it.
- `idea-cleanup-stale-singular-draft-tool-refs` — already fully drafted
  cleanup; five tool-description / jsdoc references to singular draft tools
  that no longer exist.

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
