---
id: epic-backend-fills-for-redesign
kind: epic
stage: review
tags: []
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
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

## Decomposition

Eight child features along capability seams. Most are independent of
each other — the only within-epic edge is `snapshot-restore` →
`drafter-configurator-chat` (the ↶ revert affordance consumes the
snapshot infrastructure). The other six can run fully in parallel.

UI-feature dependencies (`epic-ui-redesign-ground-up` children) are
**not** in `depends_on` because the work co-ships rather than blocks:
backend can be built in parallel with the UI rebuild, and each
backend feature lands alongside its corresponding UI feature at
release-binding time. Each child brief calls out its UI co-ship
explicitly.

Eight is one over the soft 2-6 cap; collapsing further would force
unnatural bundling. Two features are themselves bundles
(`note-annotations-and-filters` is two related sub-features by user
direction; `ui-completion-bundle` is six tiny items bundled into one
shipping unit per user direction). The shape preserves user-stated
priorities (split F-B, bundle F-J) and matches the gap-analysis
groupings.

### Child features

- `epic-backend-fills-for-redesign-workbench-engine` —
  new `RecommendationService` returning priority-ordered "what's
  next" actions with reason strings — depends on: `[]`
- `epic-backend-fills-for-redesign-snapshot-restore` —
  generic snapshot/restore layer for artifact mutations; foundation
  for the ↶ revert affordance — depends on: `[]`
- `epic-backend-fills-for-redesign-drafter-configurator-chat` —
  UI rebuild surfacing the bootstrap + configure parent-agent chat
  with Canvas + Side Chat shape, tool-entry rendering, SubAgentBlock
  inline — depends on:
  `[epic-backend-fills-for-redesign-snapshot-restore]`
- `epic-backend-fills-for-redesign-note-annotations-and-filters` —
  selection-anchored note annotations (Feynman two-pass) + Catalogue
  search & saved filters (from-session / orphan / due / recent) —
  depends on: `[]`
- `epic-backend-fills-for-redesign-document-viewer` —
  text-selection action bar + cited-passage highlights + scope-aware
  "ask Praxis" from passage — depends on: `[]`
- `epic-backend-fills-for-redesign-concept-map-and-sketch-bridge` —
  three-state node UX + ghost-edge preview + ripples panel +
  sketch→concept-map conversion — depends on: `[]`
- `epic-backend-fills-for-redesign-cross-tab-state` —
  "N unsaved across M surfaces" + parent-child tab pill + system_note
  card rendering — depends on: `[]`
- `epic-backend-fills-for-redesign-ui-completion-bundle` —
  theme persistence + library CTA + quiz confidence + exam timer +
  lesson-plan rendering + `spawnFromNote` — depends on: `[]`

### Decomposition risks

- **8 features is over the 2-6 soft cap.** Mitigated by tight scope
  per feature + user-stated bundling preferences (note-annotations
  and ui-completion-bundle each absorb what would otherwise be
  3-5 trivial features).
- **Co-ship coordination with UI features.** Each backend feature
  needs its UI counterpart to land in the same release for the
  user-facing capability to work. Mitigation: release-binding at
  `/agile-workflow:release-deploy` time pairs each backend feature
  with its UI feature explicitly.
- **`snapshot-restore` is the critical-path within this epic.** If
  its design discovers a heavier-than-expected mechanism (e.g.,
  per-mutation snapshots cause storage bloat at scale), the
  `drafter-configurator-chat` feature blocks. Mitigation: design
  snapshot-restore first; if it surfaces tradeoffs, surface them at
  feature-design time and reconsider revert affordance scope.

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

## Children complete (2026-05-18)

All 8 child features at `stage: done`. Epic advanced `implementing → review`.

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
