---
id: epic-course-create-readiness-unified-landing
kind: feature
stage: drafting
tags: [ui, ingestion, bootstrap, configure, course-authoring]
parent: epic-course-create-readiness
depends_on: [epic-course-create-readiness-startup-invisible]
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-23
---

# Course-create unified landing

## Brief

Unify the course-create entry point: `/course-create` should be the
single landing surface for every path that starts a course-design
session. Pack picker should sit alongside file upload as a source
option inside that landing. Step-2 label in the four-step stepper
should be **Create**, not "Explore", and the code+doc should be
aligned to that single term.

## Re-scope (2026-05-23, validated against code)

Validation during `epic-design --only-questions` showed the original
brief overstated the work. `/course-create` already exists with most
of the intended structure:

- **`packages/ui/src/routes/course-create.tsx`** — the route already
  renders a hero, drop zone, attached-files list, context textarea,
  and a 4-step stepper (`Material · Explore · Confirm · Open` —
  see naming decision below).
- **Pre-seed is already wired:** `course-create.tsx:108-110` passes
  the trimmed context as `initialMessage` when opening the
  course-create session. The "pre-seed and start in one click"
  requirement is already in place.

So this feature reduces to three concrete pieces (plus the dependency
fix on `epic-course-create-readiness-startup-invisible`).

### Piece 1 — Reroute bypass entry points through /course-create

At least 5 code paths bypass `/course-create` and start a course-create
session directly. Each needs to route through the landing first (with
optional pre-selection passed via route state or search params):

| File | Line | Caller | Today's behavior |
|---|---|---|---|
| `packages/ui/src/routes/courses.tsx` | 20 | `handleNewCourse` | Direct `session.start({ modeId: "course-create" })` then navigate to `/`. |
| `packages/ui/src/routes/courses.tsx` | 29 | `handleResumeDraft` | Direct start + seeded message for resume. |
| `packages/ui/src/routes/library.tsx` | 79 | `handleUsePack` | `openSessionInTab({ startOpts: { modeId: "course-create" } })` after pack import. |
| `packages/ui/src/routes/library.tsx` | 130 | `resume_draft` recommendation | Direct start. |
| `packages/ui/src/components/onboarding-flow.tsx` | 341 | onboarding pre-seed | Direct start with seeded message. |

`handleResumeDraft` and the `resume_draft` recommendation may legitimately
**not** route through the landing if the draft is mid-flight (you wouldn't
re-pick source material to resume). Feature-design decides which paths
funnel through the landing and which carry a special "resume" affordance
on the landing.

### Piece 2 — Embed pack picker in /course-create as a source option

`/packs` exists at `packages/ui/src/routes/packs.tsx` with "Use this
pack" CTAs that currently bypass `/course-create`. Pack selection
should become a source option inside the landing alongside file upload.

**Open sub-decision (user lean: move /packs inside Library tab):** the
user hinted that `/packs` may not need a dedicated top-level route —
possibly folding into a Library tab section. Feature-design weighs:
collapse `/packs` into Library / keep standalone / leave for a separate
follow-up. The pack-picker source option inside `/course-create` ships
regardless.

### Piece 3 — Rename stepper step 2: Explore → Create

The stepper at `course-create.tsx:139` currently reads
`Material · Explore · Confirm · Open`. Brief and decision are aligned
on **`Material · Create · Confirm · Open`**.

**Code + doc alignment audit** (per user instruction "make sure we
align code to create as well so we don't have drift later"):

- `packages/ui/src/routes/course-create.tsx:139` — change the one
  stepper label. This is the entire UI drift surface for the rename.
- `docs/designs/phase-16-bootstrap-explorer.md` — phase design doc.
  Frozen history convention says leave as-is; feature-design decides
  whether to rename to phase-16-bootstrap-create or leave (the
  refactor-rename-bootstrap-and-explorer feature already renamed
  backend pieces).
- Semantic verb usage in `packages/curriculum/src/course-create/drafter-prompt.ts`
  ("you have a tool surface to explore them") and
  `packages/core/src/services/session-service.ts:584,660` ("I'd like
  to explore"/"would like to explore a passage") — these describe what
  the agent DOES, not a step label. Leave alone.

## Depends on

- `epic-course-create-readiness-startup-invisible` — the
  pre-seed-and-start flow assumes the visible chat actually surfaces
  when the engine session opens. Without that bug fix, the routed-via-
  landing flow looks broken from the user's perspective.

## Mockups

Net-new surfaces inside the landing:

- **Pack source option** in the existing source-selector area (currently
  only file upload is visible).
- Optional: **"Resume draft" affordance** on the landing if any of the
  resume paths route through it.

The four-step stepper visualization already exists — just relabel step
2. Existing flow mock at `.mockups/flows/course-create-entry/` covers
the post-landing experience (drafting → review → materialize); no flow
re-mock needed unless feature-design discovers it's stale during
implementation.

Tier rule: this feature has an epic parent, so `epic-design` Phase 4.6
is the primary tier for any net-new mocks. They're queued in the
parent epic's `## UI alignment deferred` section.

## Design decisions (feature-design --only-questions, 2026-05-23)

- **Source options: Upload + Pack + Paste (3, not 4).** "From syllabus"
  was a stale framing — a syllabus is just a document or pasted text;
  the agent parses it. No deterministic syllabus parser. Sources
  shipping in the source-selector:
  1. Upload (existing — file drop zone + browse)
  2. Pack (new — pick from canonical packs)
  3. Paste (new — paste textbook chapter / notes / etc. as source
     material; distinct from the existing audience/goal context
     textarea, which stays as-is)

- **Pack picker layout: TBD via mockup pass — kicked off after this
  decision capture.** Three layouts to evaluate via
  `/ux-ui-design:screens feature-unified-landing-source-picker`:
  tabbed source selector / inline section / modal-on-CTA. Once
  finalized, update the existing `.mockups/flows/course-create-entry/`
  mocks to align — canonical truth in one place.

- **Onboarding entry path: route through /course-create + slim
  onboarding down.** Duplication confirmed in
  `packages/ui/src/components/onboarding-flow.tsx:332-367`
  (`CourseStep.handleStart`): the step manually does
  `session.start({ modeId: "course-create" }) → fire-and-forget pre-seed
  → tabs.open → navigate to /chat/$tabId`. That's exactly what
  /course-create + pack-picker does, just inlined. Refactor:
  1. Onboarding's 3 path cards (Algebra / Biology / Syllabus) navigate
     to /course-create with pack pre-selected (algebra/biology paths) or
     no source (syllabus path).
  2. /course-create handles the rest uniformly — pack source pre-attached,
     "Start Praxis →" sends the same canonical pre-seed message.
  3. Remove the inline `session.start` + pre-seed dance from
     `CourseStep.handleStart`; remove the `PRESEED_MESSAGES` constant
     (the pack-source path inside /course-create owns the pre-seed
     wording).
  Onboarding stays as a thin pre-step (3 cards), not a separate flow.

- **/packs disposition: fold into Library tab as a section.** Library
  route gets a PacksSection. Remove the top-level `/packs` route from
  `packages/ui/src/router.tsx:155`. Pack picker inside /course-create
  is the primary source path for "use this pack"; the Library section
  is the browse-and-discover surface.

## Open for feature-design

- Routing the 5 bypass paths: cold-start paths (`courses.tsx:20`
  `handleNewCourse`, `library.tsx:79` `handleUsePack`) route through
  the landing. Resume paths (`courses.tsx:29` `handleResumeDraft`,
  `library.tsx:130` `resume_draft` rec) skip the landing — re-picking
  source material is pointless mid-flight. Onboarding routes through
  per the decision above. Confirm during implementation.
- Paste source — does it create a document via the existing ingestion
  path (so it shows in the documents list and is RAG-retrievable), or
  is it a one-shot context for the drafter only?
- Pack source-attached state shape — passed via route search params
  (e.g., `/course-create?pack=algebra-1`), route state, or
  session-storage one-shot?
- `docs/designs/phase-16-bootstrap-explorer.md` rename — minor, defer
  to implementation; either rename to `phase-16-bootstrap-create` or
  leave as frozen history per the rolling-foundation convention.

## Parked (separate work)

- **Orphan routes/pages audit** — user request during this --only-
  questions pass: audit all routes registered in
  `packages/ui/src/router.tsx` against actual inbound navigation links
  to find pages with no user-reachable path. Parked at
  `.work/backlog/idea-orphan-routes-audit.md` (or equivalent slug).
  Not part of this feature's scope.
