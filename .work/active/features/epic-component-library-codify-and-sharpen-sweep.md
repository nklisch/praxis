---
id: epic-component-library-codify-and-sharpen-sweep
kind: feature
stage: implementing
tags: [refactor]
parent: epic-component-library-codify-and-sharpen
depends_on: [epic-component-library-codify-and-sharpen-contract]
release_binding: null
gate_origin: null
created: 2026-05-19
updated: 2026-05-20
---

# Migration sweep — apply the design-system contract + lint guard

## Brief

Big-bang sweep that applies the locked design-system contract
(`components.css`, `motion.css`) to every production UI file. Goal: at
the end of this feature, every CSS module in `packages/ui/src/` reaches
the design system via tier-1 primitive classes, the editorial CSS
utility (`composes: editorial from global`), or — for the 4–6 selected
domain widgets — a tier-2 widget class; every raw color/spacing value
resolves to a `var(--token)` reference; every bespoke transition or
keyframe adopts a `--ease-*` / `--duration-*` motion token.

The audit at scope time found ~150 of ~200 component files don't use
editorial primitives today and ~262 raw color/spacing values remain.
Adoption is especially low in `components/document-viewer/` (0/13) and
`components/item-bodies/` (0/17); raw values cluster in `components/`
(173 of 262, ~66%). This feature closes both gaps in one focused
sweep, ending with a lint/CI guard so the contract stays a contract.

This feature does NOT redesign the visual language — that's the
sibling contract feature's job. The sweep applies what's locked. If
sweep work surfaces a contract gap (missing token, missing variant,
under-specified state), feed it back to the contract feature for a
refinement pass rather than improvising inline.

## Epic context

- Parent epic: `epic-component-library-codify-and-sharpen`
- Position in epic: consumer feature — depends on the contract feature
  delivering `components.css` and `motion.css`. Runs after the contract
  is reviewed and locked.

## Foundation references

- `docs/UX.md` — "Design-system contract" paragraph names raw color /
  spacing in CSS modules as drift; this sweep makes that statement true
- `.mockups/design-system/components.css` — contract this sweep adopts
  (produced by the sibling feature)
- `.mockups/design-system/motion.css` — motion vocabulary this sweep
  adopts (produced by the sibling feature)

## Sweep area-slicing (refactor-design seed)

The audit suggests the natural slicing axes. The actual child-story
breakdown is `/agile-workflow:refactor-design`'s call:

- **`components/document-viewer/`** (~13 files, 0/13 adopted today) —
  highest-leverage area; entirely untouched by editorial primitives
- **`components/item-bodies/`** (~17 files, 0/17 adopted today) —
  second-highest leverage; quiz/homework/exam item bodies use raw
  values throughout
- **`components/library/`** (~10 files, 6/10 adopted) — light cleanup
- **`components/` (other)** — broad sweep across remaining
  components: composer suite, modals, badges, status surfaces, sketch
- **`routes/` + `routes/configure/`** (~45 files, 18/45 adopted) —
  route-level cleanup; the route shells already adopt editorial
  primitives; this slice catches inner sections
- **Onboarding + auth + settings** — `onboarding-flow`,
  `claude-auth-modal`, `settings` — small but visible surfaces

Each area becomes one or more child stories during refactor-design.
The acceptance criterion per story: every file in the area uses
primitives + tokens + motion tokens; the `composes: editorial from
global` adoption count goes from ~47 to whatever the post-sweep count
should be (refactor-design quantifies); the raw-value count for that
area drops to zero.

## Enforcement (rolled into this feature, not its own)

After the sweep lands, add a lint rule (Biome custom rule or a
post-build grep CI check) that fails the build when a CSS module in
`packages/ui/src/` introduces:

- A hex color literal (only `var(--color-*)` allowed)
- A bare `Xpx` spacing value in `padding`/`margin`/`gap` (only
  `var(--space-*)` allowed)
- A `cubic-bezier(...)` literal or bare-`ms` `transition-duration` (only
  `var(--ease-*)` / `var(--duration-*)` allowed)

Exceptions documented inline with `/* design-system-exception: <reason> */`.
The exact rule implementation is a feature-design call; if the lint
config is small enough it lands as a single child story; if it needs
its own design (e.g., custom Biome plugin), it spawns a child feature
during this feature's design pass.

## Mockups

Inherits from the contract feature — no new mocks at this tier. The
contract IS the visual reference; the sweep applies it. The
`/agile-workflow:refactor-design` pass on this feature does NOT call
`/ux-ui-design:screens` or `/ux-ui-design:flows` — there are no new
surfaces being designed, only existing surfaces being aligned.

## Refactor Overview

Verified drift inventory (2026-05-20, against `packages/ui/src/`):

- 136 `*.module.css` files (the editable contract surface)
- 33 files already declare `composes: ... editorial from global` (target:
  every primitive-class container does)
- **1** raw hex color literal (effectively zero — palette discipline is
  strong already; that lone hex falls inside `components-other`)
- **132** `rgb()` / `rgba()` literals — the bulk of color drift; most are
  inline alpha tints (status hues, sketch highlights, hover surfaces) that
  need to migrate to `var(--color-*)` ± `color-mix(...)` or `var(--alpha-*)`
- **558** bare `Npx` values in `padding` / `margin` / `gap` — the largest
  drift bucket, biggest in tab bodies and configure routes
- **0** `cubic-bezier(...)` literals — zero motion-easing drift; downstream
  CSS just hasn't adopted the named transition helpers yet
- **4** bare-`Nms` transition durations (two `240ms` in activity-rail and
  status-strip — width animations; two in note-editor-outline)

Per-area drift (rgb · bare-px · editorial-adoption / total-files):

| Area | Files | rgb | bare-px | editorial |
|---|---|---|---|---|
| `components/document-viewer/` | 5 | 1 | 5 | 0 |
| `components/item-bodies/` | 6 | 21 | 0 | 0 |
| `components/*-tab-body/` (7 mode bodies) | 7 | 4 | 171 | 2 |
| Composer + library + onboarding/auth | 14 | 3 | 11 | 9 |
| `components/` (other, ~85 files) | 85 | 80 | 164 | 22 |
| `routes/` + `routes/configure/` + `routes/workspace/` | 21 | 23 | 207 | 2 |

The plan is **a proof slice followed by five parallel area sweeps,
finished by a lint guard**. The proof slice is the smallest area
(`document-viewer`, 5 files, 6 total drift values) so its result calibrates
the patterns the other slices apply. Each sweep slice ends with that area
at zero drift — partial completion of the feature means *whole areas
finished*, not files scattered across all areas (a stated decomposition
risk in the parent epic).

The lint guard depends on all five sweep slices because the guard
enforces what the sweeps establish; if any area still has drift when the
guard lands, CI breaks on first push.

## Refactor Steps

### Step 1: Adopt the contract in `components/document-viewer/`

**Priority**: High (proof slice — calibrates the rest)
**Risk**: Low (5 files, 6 drift values, no shared subclasses)
**Story**: `epic-component-library-codify-and-sharpen-sweep-step-1-document-viewer`

**Files**:
- `packages/ui/src/components/document-viewer/fallback-renderer.module.css`
- `packages/ui/src/components/document-viewer/html-renderer.module.css`
- `packages/ui/src/components/document-viewer/markdown-renderer.module.css`
- `packages/ui/src/components/document-viewer/pdf-renderer.module.css`
- `packages/ui/src/components/document-viewer/structured-renderer.module.css`

**Current State**: 0/5 files declare `composes: editorial from global`;
1 `rgba(...)`; 5 raw `Npx` in padding / margin / gap.

**Target State**: Every container that renders editorial body text composes
the `editorial` utility; every color is `var(--color-*)`; every spacing is
`var(--space-*)`. Document-viewer surfaces also adopt `.editorial-kicker`
where they print metadata above a heading and `.section-rule` between
sections, per the tier-1 primitives in `.mockups/design-system/components.css`.

**Implementation Notes**:
- This slice IS the proof. Lock in the per-token translation table that
  every other slice reuses (e.g., `12px → var(--space-3)`, `8px → var(--space-2)`,
  `rgba(0,0,0,0.05) → color-mix(in srgb, var(--color-text-primary) 5%, transparent)`).
  Capture the table inside the story body so the parallel slices reference it.
- If a token doesn't exist for a needed value, pause and refine
  `tokens.css` in-place — that's expected behavior (see the parent epic's
  decomposition risks).

**Acceptance Criteria**:
- [ ] `pnpm build`, `pnpm typecheck`, `pnpm test` green
- [ ] `grep -rnE '\b(rgb|rgba)\(' --include='*.module.css' packages/ui/src/components/document-viewer | wc -l` returns `0`
- [ ] `grep -rnE '\b(padding|margin|gap)[^:]*:\s*[^v;]*[0-9]+px' --include='*.module.css' packages/ui/src/components/document-viewer | grep -v 'var(--' | wc -l` returns `0`
- [ ] Token translation table captured in story body for downstream slices

**Rollback**: `git revert <commit>` — single-area scope means no
cross-file dependencies; revert is one commit.

---

### Step 2: Sweep `components/item-bodies/` (rgba → token)

**Priority**: High (distinct shape: status-tint migration with zero spacing drift)
**Risk**: Medium — `matching-body.module.css` packs 10 rgba values for
correct/incorrect status tints; getting the alpha math wrong breaks the
"answered" visual states students see during quizzes
**Story**: `epic-component-library-codify-and-sharpen-sweep-step-2-item-bodies`
**Depends on**: `step-1-document-viewer`

**Files**:
- `packages/ui/src/components/item-bodies/item-body-shared.module.css`
- `packages/ui/src/components/item-bodies/matching-body.module.css`
- `packages/ui/src/components/item-bodies/numerical-body.module.css`
- `packages/ui/src/components/item-bodies/ordering-body.module.css`
- `packages/ui/src/components/item-bodies/reasoning-textarea.module.css`
- `packages/ui/src/components/item-bodies/two-tier-body.module.css`

**Current State**: 0/6 editorial-adopting; 21 rgba (status-tint heavy); 0 bare px.

**Target State**: Every status tint resolves through `var(--color-success)`,
`var(--color-error)`, `var(--color-info)` with `color-mix(...)` for the
8-12% alpha shades; no inline rgba.

**Implementation Notes**:
- Use the translation table from step-1.
- If `tokens.css` lacks dedicated `--color-success-soft` / `--color-error-soft`
  tokens for the 8-12% wash, extend `tokens.css` in-place — that's a
  contract-refinement loop, expected per the parent epic.

**Acceptance Criteria**:
- [ ] Build / typecheck / tests green
- [ ] `rgb|rgba` count in `components/item-bodies/` → 0
- [ ] Visual parity: rendering the matching item with each status (default /
      correct / incorrect / selected) looks unchanged against the prior
      screenshot (manual check in dev — note the comparison in the story)

**Rollback**: `git revert <commit>`.

---

### Step 3: Sweep `components/*-tab-body.module.css` (per-mode workspace surfaces)

**Priority**: High (the surfaces students actually inhabit — homework,
exam, quiz, study-skills, course-create, document, chat)
**Risk**: Medium — 175 raw px values across 7 files; biggest single bucket
**Story**: `epic-component-library-codify-and-sharpen-sweep-step-3-tab-bodies`
**Depends on**: `step-1-document-viewer`

**Files**:
- `packages/ui/src/components/chat-tab-body.module.css`
- `packages/ui/src/components/course-create-tab-body.module.css`
- `packages/ui/src/components/document-tab-body.module.css`
- `packages/ui/src/components/exam-tab-body.module.css`
- `packages/ui/src/components/homework-tab-body.module.css`
- `packages/ui/src/components/quiz-tab-body.module.css`
- `packages/ui/src/components/study-skills-tab-body.module.css`

**Current State**: 2/7 editorial-adopting (chat); 4 rgba (all in chat);
171 bare px (homework: 51, exam: 44, quiz: 30, study-skills: 24,
course-create: 18, document: 4).

**Target State**: Every tab-body container composes the `editorial`
utility on its content shell; section heads use `.section-head` / `.section-rule`;
every spacing value is `var(--space-*)`; the four rgba in chat resolve to
token references.

**Implementation Notes**:
- Each mode body has the same structural shape (head + body + footer);
  refactoring the homework body first inside the story produces a
  template applied to the remaining six.
- Keep the per-mode `.kicker` / `.kickerDot` / `.kickerGlyph` styling that
  carries the mode tint (`var(--tint-homework)`, etc.) — the tints are
  already tokenized; only spacing drift is at issue.

**Acceptance Criteria**:
- [ ] Build / typecheck / tests green
- [ ] Bare-px count across the seven tab bodies → 0
- [ ] rgba count across the seven tab bodies → 0
- [ ] All seven tab bodies declare `composes: ... editorial from global`
      on their content shell (or document why-not in the story)

**Rollback**: `git revert <commit>`.

---

### Step 4: Sweep composer + library + onboarding/auth/settings

**Priority**: Medium (small concentrated, high-visibility surfaces)
**Risk**: Low (modest drift, mostly already adopted)
**Story**: `epic-component-library-codify-and-sharpen-sweep-step-4-composer-library-auth`
**Depends on**: `step-1-document-viewer`

**Files**:
- Composer suite: `components/composer.module.css`,
  `components/composer-verbs.module.css`, `components/composer-sketch.module.css`
- Library widgets: `components/library/courses-section.module.css`,
  `documents-section.module.css`, `library-section.module.css`,
  `packs-section.module.css`, `recent-sessions-section.module.css`
- Onboarding + auth + settings: `components/onboarding-flow.module.css`,
  `components/claude-auth-modal.module.css`,
  `components/auth-gate.module.css`, `routes/settings.module.css`

**Current State**: 9/14 already editorial-adopting; 3 rgba; 11 bare px
(composer carries 7 of them).

**Target State**: 14/14 editorial-adopting on content shells; rgba count → 0;
bare-px count → 0. The composer family also adopts the tier-2
`.composer` widget class shipped in `components.css` where the structure
fits.

**Implementation Notes**:
- These surfaces double as showpieces (composer is the highest-touch
  control; onboarding is the very first impression; auth-modal gates
  every Claude action). Keep visual diff to zero — purely token /
  primitive migration.

**Acceptance Criteria**:
- [ ] Build / typecheck / tests green
- [ ] rgba count across these 14 files → 0
- [ ] Bare-px count across these 14 files → 0
- [ ] Composer matches the tier-2 `.composer` widget contract (selectors
      align with `components.css`; document any deliberate divergence)

**Rollback**: `git revert <commit>`.

---

### Step 5: Sweep `components/` (other ~85 files) + bare-ms motion migration

**Priority**: High (largest file count; closes the broadest gap)
**Risk**: Medium — 85 files; per-file refactor is mechanical but the
volume means breadth-of-eyes is the failure mode. Patches should land in
themed sub-commits (cards / chips / modals / panels / status surfaces)
so review can trace shape.
**Story**: `epic-component-library-codify-and-sharpen-sweep-step-5-components-other`
**Depends on**: `step-1-document-viewer`

**Files**: the 85 top-level files in `packages/ui/src/components/`
excluding the seven tab-bodies, three composer files, and three
onboarding/auth files already covered by step-3 / step-4. Concrete list
generated in the story via the same `comm -23` pipeline used during
refactor-design.

**Current State**: 22/85 editorial-adopting; 80 rgba; 164 bare px; the 4
bare-ms transitions live in this set (`activity-rail`, `status-strip`,
`note-editor-outline` ×2).

**Target State**: 85/85 editorial-adopting on content shells (or
documented exceptions); rgba count → 0; bare-px count → 0; the four
bare-ms transitions adopt `var(--t-quick)` / `var(--t-ambient)` from
`motion.css`.

**Implementation Notes**:
- Group commits by component family for review ergonomics: cards
  (artifact, assignment, etc.) · chips and pills · modals · panels and
  rails · status / activity surfaces · the long tail.
- The activity-rail and status-strip `240ms` width animation is
  documented in `motion.css` Doherty bracket as background-only — adopt
  `var(--t-ambient)` (480ms) only if 480ms reads acceptably on the strip
  appearing; otherwise pause and refine `motion.css` with a
  `--dur-strip-width` token (contract refinement loop is allowed).

**Acceptance Criteria**:
- [ ] Build / typecheck / tests green
- [ ] rgba count in scoped files → 0
- [ ] Bare-px count in scoped files → 0
- [ ] Bare-ms transition count in scoped files → 0
- [ ] No new exceptions added unless inline-commented
      `/* design-system-exception: <reason> */`

**Rollback**: per-themed-commit revert; the story lands as several small
commits, not one mega-commit, so any single family can roll back
independently.

---

### Step 6: Sweep `routes/`, `routes/configure/`, `routes/workspace/`

**Priority**: High (the route shells set the editorial frame for
everything inside)
**Risk**: Medium — 207 bare px (memory-tab: 42, course-create: 34,
concept-map-editor: 32, library: 29, prompt-tab: 28, course-tab: 25); 23
rgba scattered
**Story**: `epic-component-library-codify-and-sharpen-sweep-step-6-routes`
**Depends on**: `step-1-document-viewer`

**Files**: all 21 files under `packages/ui/src/routes/` (top-level,
`configure/`, `workspace/` — concrete list in the story body).

**Current State**: 2/21 editorial-adopting; 23 rgba; 207 bare px.

**Target State**: 21/21 declare `composes: ... editorial from global` on
their `<RouteHeader>` wrapper or content shell (or document why-not);
rgba count → 0; bare-px count → 0; configure tabs adopt `.tabs` and
`.section-head` from the contract where the structure fits.

**Implementation Notes**:
- Route shells are where the editorial primitives most clearly fit
  (RouteHeader, LibrarySection, EmptyState) — most are already imported
  but not yet composed into the CSS module.
- `configure/` tabs are the single biggest spacing-drift bucket; tackle
  them as a sub-batch within the story.

**Acceptance Criteria**:
- [ ] Build / typecheck / tests green
- [ ] rgba count across `routes/` → 0
- [ ] Bare-px count across `routes/` → 0
- [ ] All 21 route files adopt `composes: editorial from global` (or
      document an inline exception)

**Rollback**: per-sub-batch revert.

---

### Step 7: Lint guard for contract adherence

**Priority**: High (locks the contract; without it the sweep is one
moment-in-time clean rather than a durable contract)
**Risk**: Low — pure additive CI / lint scaffolding; no existing CSS
modules change in this story (they're already clean by step 6's
completion)
**Story**: `epic-component-library-codify-and-sharpen-sweep-step-7-lint-guard`
**Depends on**: `step-2-item-bodies`, `step-3-tab-bodies`,
`step-4-composer-library-auth`, `step-5-components-other`, `step-6-routes`

**Files**:
- New: a guard script (e.g., `scripts/check-css-contract.mjs`) OR a
  Biome custom rule, depending on what's smaller. Implementation choice
  is the story's first design decision; default to the grep-style
  Node script if Biome's plugin surface looks heavier than the
  enforcement need.
- `package.json` — wire the script into the existing `pnpm lint` /
  `pnpm typecheck` cadence so CI fails on contract drift the same way
  it fails on type errors.
- `.work/CONVENTIONS.md` — short append documenting the inline
  exception convention (`/* design-system-exception: <reason> */`).

**Current State**: No automated guard exists; drift accumulates between
reviews unless reviewers spot it.

**Target State**: A guard that fails when a CSS module in
`packages/ui/src/` introduces:
- A hex color literal (only `var(--color-*)` allowed)
- A bare `Npx` value in `padding` / `margin` / `gap` (only `var(--space-*)`
  allowed)
- A `cubic-bezier(...)` literal or a bare-`Nms` `transition-duration` /
  `transition: ... Nms` shorthand (only `var(--ease-*)` and `var(--dur-*)`
  /`var(--t-*)` allowed)

Exceptions must use `/* design-system-exception: <reason> */` on the
same or preceding line.

**Implementation Notes**:
- Implementation pick: a small Node script run as a `pnpm lint:css-contract`
  step is almost certainly less work than a Biome custom rule; pick the
  smaller path unless something in Biome's plugin surface makes it
  cheaper.
- The check should be fast (<1s on this workspace) so it can land in
  the pre-commit / pre-push hook without dragging the loop.

**Acceptance Criteria**:
- [ ] Guard script exists and is executable
- [ ] `pnpm lint:css-contract` returns exit 0 on `HEAD` (validates the
      sweep is actually clean)
- [ ] Wired into top-level `pnpm lint` so CI catches drift on every
      push
- [ ] Two unit cases: a known-drift CSS string fails; a clean CSS string
      passes
- [ ] Inline exception comment convention documented in
      `.work/CONVENTIONS.md` (`/* design-system-exception: <reason> */`)

**Rollback**: revert the script and the `package.json` lint-step entry;
no existing files are mutated.

## Implementation Order

1. `step-1-document-viewer` — proof slice (smallest area, calibrates patterns)
2. In parallel (depends_on: step-1):
   - `step-2-item-bodies` (rgba→token, distinct shape)
   - `step-3-tab-bodies` (per-mode workspace surfaces)
   - `step-4-composer-library-auth` (small concentrated surfaces)
   - `step-5-components-other` (broadest file set + 4 bare-ms transitions)
   - `step-6-routes` (route shells + configure / workspace)
3. `step-7-lint-guard` — enforcement, depends on all five area sweeps