---
id: epic-course-create-readiness-unified-landing
kind: feature
stage: implementing
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

- **Source-picker layout**:
  `.mockups/screens/epic-course-create-readiness-unified-landing-source-picker/index.html`
  - **Selected: Option 4 — Pack-First Tabs + Below-Hints (tweaked)**
    (2026-05-23)
  - Tabs at top with **Pack as the landing tab** (most first-time users
    benefit from a zero-effort canonical pack). The Upload tab carries a
    `create your own` tag — frames it as the bring-your-own-material
    path for users who already have material. Pack rows are equal-weight
    (no "our pick" highlight — the landing position is enough signal).
  - Below the active surface, an italic **"Or —" bar** always names the
    OTHER two source options as alternative paths. Clicking switches
    tabs (Option 3's pattern but tab-switching, not modal-opening).
  - Triple-redundant communication: tabs at top (menu), Pack-as-hero
    (recommended path), italic alternatives at foot.
  - Considered: tabbed-with-Upload-landing (option-1), inline-sectioned
    (option-2), modal-on-CTA (option-3) — in `.../option-{1,2,3}.html`.

- **Canonical-truth realignment for existing flow mocks**: the existing
  `.mockups/flows/course-create-entry/02-upload-docs.html` shows the
  pre-feature source area (drop zone only). During implementation,
  update that step to reflect the new source-picker (Pack tab landing
  + Upload tab with "create your own" + Paste tab + "Or —" bar). The
  other course-create-entry screens (03-drafter-running through
  05-course-materialized) are post-landing and don't need re-mocks.

- **Other net-new surfaces in this feature** (no separate mocks needed
  — composes existing patterns):
  - Optional "Resume draft" affordance on the landing if any of the
    resume paths route through it (per Open-for-design notes above).
  - Stepper label change `Explore → Create` is a one-word edit; no mock.

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

## Design decisions (feature-design, 2026-05-23, autopilot)

Resolved open questions:

- **Paste source — full ingestion path.** Pasting creates a Document via
  the existing ingestion path (text/plain content type). The Document
  shows up in the documents list, is RAG-retrievable, and behaves
  identically to an uploaded `.txt` file. SSOT preserved (one document
  abstraction). Alternative one-shot context-only path was rejected as
  duplicative of the existing context textarea AND inconsistent with
  Upload's behavior.
- **Pack source-attached state shape — URL search params.**
  `/course-create?pack=algebra-1` is the contract. RESTful,
  bookmarkable, survives reload, simplest navigation API. Onboarding's
  path cards and any other "pre-select a pack" entry point set this
  param. The route reads it on mount and pre-attaches the pack.
- **Bypass paths routing matrix (confirmed)**:
  - `courses.tsx:20` `handleNewCourse` → route through `/course-create`
  - `courses.tsx:29` `handleResumeDraft` → skip landing (resume is
    direct: re-pick source is pointless)
  - `library.tsx:79` `handleUsePack` → route through
    `/course-create?pack=<id>`
  - `library.tsx:130` `resume_draft` recommendation → skip landing
  - `onboarding-flow.tsx:341` → route through
    `/course-create?pack=<id>` (or no param for syllabus card)
- **phase-16 doc rename**: defer per rolling-foundation convention
  (frozen history). Skip in this feature.

## Architectural choice

**4 stories**: a source-picker UI shell (which absorbs the stepper rename
since both touch course-create.tsx), the bypass-routes reroute pass, the
onboarding slim-down, and the /packs-fold-into-Library refactor.

Sequencing:
- Wave 1 (parallel): source-picker, packs-fold-into-library (disjoint
  files; can run together).
- Wave 2: bypass-routes-reroute and onboarding-slim-down both depend on
  source-picker landing first (they consume the `?pack=` URL contract).

## Implementation Units

### Unit 1: Source-picker UI shell + paste source + stepper rename

**File**: `packages/ui/src/routes/course-create.tsx` + new
`source-picker.tsx` + new `paste-source.tsx`
**Story**: `epic-course-create-readiness-unified-landing-source-picker`

Per the locked Option 4 mock
(`.mockups/screens/epic-course-create-readiness-unified-landing-source-picker/`),
the source area is a 3-tab control:

- **Pack tab (landing)**: list of canonical packs with "Use this pack"
  rows. Selecting a pack sets it as the source.
- **Upload tab** (carrying a `create your own` tag): existing drop zone
  + file browse.
- **Paste tab**: textarea + "Add as source" button that calls the
  ingestion path to create a Document from the pasted text.
- **Below the tabs**: italic "Or —" bar always names the OTHER two
  source options as alternative paths; clicking switches tabs (not
  modals — tab-switching per the Option 4 tweak).

URL contract: `/course-create?pack=<packId>` pre-selects the Pack tab
and pre-attaches that pack as source on mount.

Stepper rename: `course-create.tsx:139` — change `Explore` → `Create`.
Included in this story to avoid file conflict with the source-picker
change (same file).

**Acceptance Criteria**:
- [ ] Source picker renders the 3 tabs (Pack landing, Upload, Paste).
- [ ] Pack tab lists available packs via `client.packs.list` (or equiv).
- [ ] Selecting a pack sets it as the attached source (visible in the
  attached-files list area).
- [ ] Upload tab preserves existing drop-zone + browse behavior.
- [ ] Paste tab creates a Document via the ingestion path; the new
  Document appears in the attached-files list.
- [ ] "Or —" bar shows the OTHER two source options and switches tabs
  on click.
- [ ] `/course-create?pack=algebra-1` pre-selects the Pack tab and
  pre-attaches the pack on mount.
- [ ] Stepper reads `Material · Create · Confirm · Open`.
- [ ] UI tests cover: tab switching, paste-creates-document, URL param
  pre-selection.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

### Unit 2: /packs → Library section + remove top-level route

**File**: `packages/ui/src/routes/library.tsx` + delete
`packages/ui/src/routes/packs.tsx` + `packages/ui/src/router.tsx:155`
**Story**: `epic-course-create-readiness-unified-landing-packs-into-library`

- Create `PacksSection` component (extract from existing `packs.tsx`
  content) and add it to the Library route.
- Remove the top-level `/packs` route from `router.tsx:155`.
- Audit and update any inbound links to `/packs` (search the codebase
  for `to="/packs"` or `navigate("/packs")` and update to
  `/library#packs` or whatever the Library section anchor is).
- Delete `packs.tsx` once all references are gone.

**Acceptance Criteria**:
- [ ] Library route shows a Packs section listing canonical packs.
- [ ] `/packs` URL no longer resolves; it 404s or redirects to
  `/library` (pick redirect for backward-compat with any external
  links).
- [ ] All inbound links to `/packs` updated.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

### Unit 3: Bypass routes reroute pass

**File**: `packages/ui/src/routes/courses.tsx`,
`packages/ui/src/routes/library.tsx`
**Story**: `epic-course-create-readiness-unified-landing-bypass-reroute`
**Depends on**: source-picker (consumes the `?pack=` URL contract)

Per the routing matrix:
- `courses.tsx:20` `handleNewCourse` → `navigate({ to: "/course-create" })`
  (replace the direct `session.start` dance).
- `courses.tsx:29` `handleResumeDraft` → leave as-is (resume is direct).
- `library.tsx:79` `handleUsePack` →
  `navigate({ to: "/course-create", search: { pack: packId } })`
  (replace `openSessionInTab`).
- `library.tsx:130` `resume_draft` rec → leave as-is.

**Acceptance Criteria**:
- [ ] `handleNewCourse` navigates to `/course-create` instead of starting
  a session directly.
- [ ] `handleUsePack` navigates to `/course-create?pack=<id>`.
- [ ] Resume paths unchanged.
- [ ] UI tests cover: cold-start paths route through landing; resume
  paths don't.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

### Unit 4: Onboarding slim-down

**File**: `packages/ui/src/components/onboarding-flow.tsx`
**Story**: `epic-course-create-readiness-unified-landing-onboarding-slim`
**Depends on**: source-picker (consumes the `?pack=` URL contract)

- Replace `CourseStep.handleStart`'s inline `session.start` + pre-seed +
  `tabs.open` + `navigate` with a navigation to
  `/course-create?pack=<id>` (Algebra/Biology cards) or just
  `/course-create` (Syllabus card).
- Remove the `PRESEED_MESSAGES` constant.
- Onboarding remains a thin pre-step (3 path cards). After clicking a
  card, the user lands on `/course-create` with the pack pre-attached
  (or empty for syllabus path).

**Acceptance Criteria**:
- [ ] Onboarding's Algebra card navigates to
  `/course-create?pack=algebra-1` (or the canonical id).
- [ ] Biology card navigates to `/course-create?pack=biology-1`.
- [ ] Syllabus card navigates to `/course-create` (no pre-attach).
- [ ] `PRESEED_MESSAGES` constant removed.
- [ ] `session.start` + `tabs.open` dance removed from
  `CourseStep.handleStart`.
- [ ] Onboarding tests cover the 3 paths' navigation targets.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation Order

1. Wave 1 (parallel): source-picker + packs-into-library
2. Wave 2 (parallel): bypass-reroute + onboarding-slim

## Testing

- UI tests per story (component-level + URL-param assertions).
- E2E coverage: onboarding → /course-create with pack pre-attached →
  start session and see the chat (relies on
  `epic-course-create-readiness-startup-invisible`, done).

## Risks

- **Pack id contract** — what's the canonical id format
  (`"algebra-1"`, `"algebra_1"`, course slug, etc.)? Check
  `client.packs.list` shape during source-picker implementation;
  document in story body.
- **Paste content size** — large paste could overwhelm the ingestion
  path. Existing limits apply; if there's no limit yet, this isn't the
  story to add one.
- **Inbound links to `/packs`** — exhaustive grep needed; missing one
  produces 404s. The acceptance criterion explicitly requires the audit.
