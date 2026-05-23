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

## Design questions for feature-design

- Which of the 5 bypass paths route through the landing, and which
  carry "resume" or "pre-selected pack" affordances directly on the
  landing?
- Where does the pack picker sit in the landing's layout — tabbed
  source selector (Upload / Paste / Pack / Syllabus), inline section,
  modal-on-CTA?
- Does `/packs` collapse into the Library tab (user's lean), stay
  standalone, or get deferred to a separate cleanup?
- Does the phase-16 design doc get renamed (`bootstrap-create`) or
  stay as frozen history?
