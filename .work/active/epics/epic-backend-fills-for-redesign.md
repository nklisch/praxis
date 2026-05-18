---
id: epic-backend-fills-for-redesign
kind: epic
stage: drafting
tags: []
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Backend fills for the UI redesign

## Brief

The UI-redesign epic (`epic-ui-redesign-ground-up`) produced locked
mockups for six surface features + seven cross-screen flows. The
subsequent gap analysis compared those mocks against the existing
backend and surfaced **eighteen capability gaps** — patterns the
mocks show that have no corresponding backend support today.

This epic collects the **backend work needed to make the locked
mockup direction real**. It is a sibling of the UI-redesign epic
(not a child) because the UI epic is design-only; this epic is
implementation-bearing.

The eighteen gaps cluster into **eight features** (decided after a
round of triage with the user — see "Decomposition" below). Most are
small or medium; one (drafter & configurator chat rebuild) was
originally framed as a large architectural change but **re-scoped to
medium** once we confirmed the existing parent/sub-agent pattern
(`SubAgentRegistry`, `ConfigureChatPane`, `course.start_exploration`
as a tool the parent agent calls) is already in place. The mocks were
then re-mocked to reflect that architecture honestly — tool calls
execute immediately with `↶ revert` (snapshot-restore), not
pre-execution staging.

The gap analysis findings and the corrected mock framings are
documented at:

- Gap matrix: in the conversation history around the
  `epic-ui-redesign-ground-up` design pass — to be inlined into the
  per-feature briefs at decomposition time
- Re-mocked surfaces: `.mockups/flows/course-create-entry/03-*` and
  `04-*`; `.mockups/screens/.../mode-course-create.html`;
  `.mockups/screens/.../configure/option-5.html` (and tabs)

Decomposition into child features happens next via
`/agile-workflow:epic-design`. Each child feature will be scoped
against its specific UI-feature dependency (e.g. the drafter chat
rebuild depends on `epic-ui-redesign-ground-up-chat-workspace`
implementation being in place; the workbench engine is independent).

## Why this is a separate epic

- **UI epic was design-only.** The mocks are throwaway HTML; this
  epic does the production work.
- **Different audience.** UI epic produced design artifacts a reviewer
  signs off; this epic produces shipped backend services + UI
  refactors.
- **Different gates.** This epic will run the gate suite (security /
  tests / cruft / docs / patterns) — the UI epic didn't ship code so
  most gates were not relevant.
- **Different parallelism.** Backend features can run in parallel
  with UI implementation features once the design pass is locked
  (which it is).

## Anticipated child features

To be confirmed/refined by `/agile-workflow:epic-design`:

1. **`-workbench-recommendation-engine`** · new
   `RecommendationService` returning priority-ordered "what's next"
   actions with reason strings. Required by the locked Workbench
   (discovery feature).
2. **`-artifact-snapshot-restore`** · generic snapshot/restore layer
   for artifact mutations. Foundation for the ↶ revert affordance on
   any agent-driven tool call. Used by drafter + configurator + note
   editors.
3. **`-drafter-configurator-chat-rebuild`** · UI rebuild to surface
   the bootstrap-mode + configure-mode parent-agent chat with the
   Canvas + Side Chat shape. Tool-entry rendering with summary +
   ↶ revert affordance. `<SubAgentBlock>` inline for
   `course.start_exploration`. (Smaller than originally framed —
   architecture is already in place; UI just needs to surface it.)
4. **`-note-annotations-and-catalogue-filters`** · selection-anchored
   annotations on the notes schema (Feynman two-pass margin notes) +
   catalogue search/filter queries (from-session / orphan / due /
   recent).
5. **`-document-viewer-enhancements`** · text-selection action bar +
   cited-passage highlight tracking + scope-aware "ask Praxis" from
   passage. DocumentTabBody scaffold exists; this fills it out.
6. **`-concept-map-completion-and-sketch-conversion`** · three-state
   node UX (linked ✓ / best-guess ? / unlinked) + ghost-edge preview
   on candidate hover + ripples panel + sketch→concept-map conversion
   service.
7. **`-cross-tab-and-parent-child-ui`** · UI plumbing only: "N
   unsaved across M surfaces" tracker, "from L3" pill on child tab,
   distinct system-event card rendering in chat. Surfaces what the
   data model already supports.
8. **`-ui-completion-bundle`** · theme persistence + Library "+
   Create a course" CTA + quiz confidence band + exam timer/auto-
   submit + lesson-assessment plan rendering + spawn-from-note brief.
   Small UI gaps bundled into one shipping unit.

## Dependencies

This epic depends on the **design pass** of the UI redesign epic
being locked — which it is. Per-feature dependencies on specific UI
implementation features will be declared at epic-design time. For
example:

- `-drafter-configurator-chat-rebuild` depends on
  `epic-ui-redesign-ground-up-chat-workspace` UI implementation
- `-cross-tab-and-parent-child-ui` depends on
  `epic-ui-redesign-ground-up-app-shell` (open-tabs strip) and
  `epic-ui-redesign-ground-up-chat-workspace`
- Others (workbench engine, snapshot infra, note annotations, etc.)
  can start immediately

## Foundation-doc impact (deferred to per-feature ship time)

This epic adds new components (`RecommendationService`,
`ArtifactSnapshotService`, etc.) and new patterns (snapshot/restore
for authoring tools; Canvas + Side Chat shape formalized as the
authoring-session pattern). Per the rolling-foundation principle, the
docs (`ARCHITECTURE.md`, `CONTRACT.md`, `SPEC.md`) describe the
system as it IS, not as it WILL be. No roll-forward at scope time.
Each child feature rolls foundation docs forward as it ships, via
the `gate-docs` quality gate at `/agile-workflow:release-deploy`
time.

## What this epic does NOT cover

- **Backend rename of `bootstrap` → `course_create` and `explorer` →
  `drafter`** — parked separately at
  `.work/backlog/idea-rename-bootstrap-and-explorer.md`. UI mocks
  already reflect the rename; backend code follows on its own
  schedule.
- **First-run / onboarding flow** — deferred to its own feature in
  the UI redesign epic (`app-shell` feature's outlook).
- **Implementation of the UI redesign per se** — that work lives in
  the per-feature implementation outlooks under
  `epic-ui-redesign-ground-up`'s six children.
