---
id: epic-ui-redesign-ground-up-discovery-surfaces
kind: feature
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up
depends_on:
  - epic-ui-redesign-ground-up-design-system
  - epic-ui-redesign-ground-up-app-shell
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Discovery Surfaces — Library, Progress Map, Concept-Maps Index

## Brief

Redesign the "out of conversation" surfaces — the maps and lists the
student navigates to find work, see where they are, and pick what to do
next. Three surfaces:

- **Library** (front door) — courses, packs, documents, recent sessions.
  Current: `packages/ui/src/routes/library.tsx` with `library/` section
  components (CoursesSection, PacksSection, DocumentsSection,
  RecentSessionsSection).
- **Progress map** — React Flow graph of lessons, gates, concepts, mastery.
  Current: `packages/ui/src/routes/course-map.tsx` with `concept-node.tsx`
  and `gate-edge-label.tsx`.
- **Concept-maps index** — list view onto the student's authored tldraw
  concept maps. Current: `packages/ui/src/routes/concept-maps-list.tsx`.

These are grouped because they share a posture (outside the active session,
overview-oriented, navigational) and because the design decisions about
hierarchy, card vs table vs spatial display, and "what does Praxis look
like when no session is open" cut across all three.

This feature also owns the **session-open flow** (library card →
`openSessionInTab` → tab appears → navigate to `/chat/$tabId`) and the
**bootstrap-entry flow** (student picks bootstrap from library → bootstrap
session opens → conversation in BootstrapTabBody runs the explorer →
draft confirmation surfaces → materialized course appears in library →
first teach session starts). The bootstrap *conversation* itself lives in
chat-workspace (BootstrapTabBody is a tab body); this feature owns the
entry and exit of that flow — the library affordances that launch it and
the draft-confirmation surface that promotes it back into the library.

What lands:

- `.mockups/screens/epic-ui-redesign-ground-up-discovery-surfaces/` —
  options for library, progress map, concept-maps index (and how they
  share a navigational shape)
- `.mockups/flows/session-open/` — multi-step walk from library card to
  chat tab
- `.mockups/flows/bootstrap-entry/` — multi-step walk from library to
  draft confirmation to first session

## Epic context

- Parent epic: `epic-ui-redesign-ground-up`
- Position in epic: **navigation surface feature** — depends on
  design-system and app-shell; parallelizes with chat-workspace,
  workspace, and configure.

## Foundation references

- `docs/UX.md` § "Surface map" — library as front door, progress map shape
- `docs/UX.md` § "Onboarding flows" → student self-onboard — bootstrap entry posture
- `docs/ARCHITECTURE.md` § "Artifact lifecycle" — what library renders
  (course / lesson / assignment / exam / gate / flashcard / note / concept
  map)
- Pattern `session-tab-open-flow`
- Pattern `use-resource-hook`
- Pattern `editorial-ui-primitives` (RouteHeader, LibrarySection, EmptyState)

## Mockups

- Screens: `.mockups/screens/epic-ui-redesign-ground-up-discovery-surfaces/index.html`
- **Selected: Option 4 — Workbench** (2026-05-17)
  - Two-column shop: left is the **what's-next queue** (priority-ordered
    actions — resume lesson, due reviews, suggested checks, bootstrap
    follow-ups), right is the **lately timeline** (chronological recent
    sessions and significant events)
  - Greeting line at top names the count of ready things ("Good
    morning. There's three things ready for you.")
  - Footer row of three small cards for packs / concept maps / documents
    — "everything else is a click away"
  - Replaces the library-as-catalogue posture with **library-as-workbench** — the front door is "where do I pick up" rather than "what
    exists." Progress map and concept-maps index become reachable surfaces
    rather than primary front-door content
- Considered: Table of Contents (magazine TOC), Card Grid (refined
  cards), Single Map (library is the spatial graph) — in
  `.mockups/screens/.../option-{1,2,3}.html`

The session-open and course-create-entry flows spawn as child stories
during implementation; the workbench's "Resume" / "Review draft" CTA
patterns set the visual entry to those flows.

### Naming rename (UI surfaces)

The "bootstrap" CTA in earlier mock revisions is now **"+ Create a
course"** in the Workbench footer (highlighted card when student has
documents but no fitting course). The flow folder was renamed
`bootstrap-entry/` → `course-create-entry/`. Backend rename parked
at `.work/backlog/idea-rename-bootstrap-and-explorer.md`.

### Flows landing here

- **session-loop** step 1 (`.mockups/flows/session-loop/01-workbench.html`)
  — the locked Workbench surface in action; "Resume" CTA highlighted
  with glow + pulse arrow; queue refreshes at session end (step 5).
- **course-create-entry** (`.mockups/flows/course-create-entry/`) —
  5 steps from the Workbench "Create a course" CTA through document
  upload → drafting (with steering chat) → draft review (full
  assessment plan visible with timing + purpose) → course materialized
  with first session tab pre-opened. **Steering chat added** during
  iteration — configurator drives Praxis's drafting via natural
  language ("add a midterm after unit 2"); each tool call surfaces
  as a reviewable diff. **Assessment plan visibility added** in step
  4 to reflect the architectural reality: `LessonAssessment` carries
  `timing` (before / interleaved / after) and `purpose` (readiness /
  practice / checkpoint), unit exams + midterm + final all mocked
  with per-mode pills (qc / readiness / homework / quiz / exam).

The session-open flow is implicit in session-loop steps 1-3 (Workbench
→ tab opens → mid-session) but warrants its own focused 2-3 step
mock when ready.

## Design decisions

- Three parallel stories per the outlook above.
- Workbench consumes the `RecommendationService` from sibling
  `epic-backend-fills-for-redesign-workbench-engine-recommendation-service`.
- Course-create entry path produces session via existing
  `praxisClient.bootstrap.startExploration` (or the renamed
  equivalent post backend rename).

## Implementation Units (one story each)

1. **`-workbench-library-rebuild`** — Rebuild `LibraryRoute` as the
   Workbench shape: greeting + what's-next queue (consumes
   RecommendationService) + lately timeline + footer cards
   (packs / concept maps / documents).
2. **`-course-create-entry-path`** — Multi-page entry path:
   library CTA → upload screen → drafting page (steering chat) →
   draft-ready page → materialize handoff.
3. **`-session-open-flow-polish`** — Tab-slide-in animation,
   "resumed" banner, scroll restoration on resume.

## Implementation Order

Stories 1-3 parallel. Story 1 depends on the backend Workbench
engine landing for the queue data.

## Acceptance Criteria

- [ ] LibraryRoute renders the Workbench shape per the locked mock.
- [ ] Course-create entry path walks through the 5 steps.
- [ ] Session-open flow has polish (animation, banner, scroll).
- [ ] All quality checks green.
