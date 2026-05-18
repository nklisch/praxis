---
id: epic-backend-fills-for-redesign-drafter-configurator-chat-course-create-tab-body
kind: story
stage: review
tags: [ui]
parent: epic-backend-fills-for-redesign-drafter-configurator-chat
depends_on:
  - epic-backend-fills-for-redesign-drafter-configurator-chat-authoring-pane
  - epic-backend-fills-for-redesign-drafter-configurator-chat-tool-call-entry
  - epic-backend-fills-for-redesign-drafter-configurator-chat-sub-agent-block-inline
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Course-create tab body — Canvas + Side Chat

## Scope

Re-shape `bootstrap-tab-body.tsx` to mount Canvas (draft preview) +
`<AuthoringChatPane>` (side chat) matching the locked
`mode-course-create.html` mock.

## Implementation steps

1. Edit `packages/ui/src/components/bootstrap-tab-body.tsx`:
   - Replace current layout with Canvas (left, flexible) + side chat
     (right, 380px fixed).
   - Canvas renders the draft preview (units + lessons + assessment
     plan) by reading the current draft state from
     `praxisClient.bootstrap.getCurrentDraft` (or equivalent).
   - Side chat mounts `<AuthoringChatPane mode="course_create"
     artifactId={draftId} />`.

2. Inline `<SubAgentBlock>` already mounts via the chat pane (Story
   3); no extra wiring here.

3. Tests: `bootstrap-tab-body.test.tsx` with fake draft state.

4. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] Course-create mode renders Canvas + Side Chat layout per the
      mock.
- [ ] Tool calls render via `<ToolCallEntry>` with revert when
      `actionId` available.
- [ ] Sub-agent block renders inline.
- [ ] All quality checks green.

## Implementation notes

Replaced the old split-pane layout (chat left ~60%, outline right ~40%
with `TeachChatTabBody` + `SubAgentPanel`) with the Canvas + Side Chat
shape from the locked mock:

- **Left (`flex: 1`, `draftCanvas`)** — `<SessionHead>` at top (renders
  `tab.title`, preserving existing test expectations); canvas header with
  kicker, draft title, DRAFT badge, "Add documents" button, budget field;
  scrollable `canvasScroll` area that renders `DraftCanvas` (unit blocks
  + lesson rows) or an empty-state paragraph.
- **Right (420px, `chatPanel`)** — `<AuthoringChatPane mode="bootstrap"
  sessionId={tab.sessionId} />` which already wires `<ToolCallEntry>` and
  inline `<SubAgentBlock>` — no extra plumbing needed.

`DraftCanvas` renders `ProposedUnit` blocks with ordered `LessonRow`
children when the explorer has produced unit scaffolding; falls back to a
flat lesson list for pre-Phase-16 explorers. `<LessonAssessmentPills>` is
passed inline when proposed assessments are available.

`LibraryDocumentPicker` (session-scoped) is triggered from the canvas
header "Add documents" button — preserving the existing add-docs tests
which needed only a mock swap (`TeachChatTabBody` → `AuthoringChatPane`).

Tests rewritten in `bootstrap-tab-body-layout.test.tsx` to guard:
- `draft-canvas-scroll` test-id present
- `AuthoringChatPane` mounted in `bootstrap` mode
- `chatPanel` and canvas are siblings, not nested
- empty-state copy when no draft
- budget field present
- unit blocks + lesson rows when draft has units (via mutable `_mockCurrentDraft`)
- canvas title shows when draft present

All 1551 UI tests pass; lint clean.
