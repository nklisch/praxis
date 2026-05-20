---
id: epic-component-library-codify-and-sharpen-sweep-step-6-routes
kind: story
stage: implementing
tags: [refactor]
parent: epic-component-library-codify-and-sharpen-sweep
depends_on: [epic-component-library-codify-and-sharpen-sweep-step-1-document-viewer]
release_binding: null
gate_origin: refactor-design
created: 2026-05-20
updated: 2026-05-20
---

# Step 6 — Sweep `routes/` (top + `configure/` + `workspace/`)

## Brief

Apply the design-system contract to all 21 route-level CSS modules. The
route shells are where the editorial primitives (RouteHeader,
LibrarySection, EmptyState) most naturally fit; most are already
imported but not yet composed at the CSS-module level.

## Files in scope

All 21 files under `packages/ui/src/routes/`:

- Top-level: `chat`, `concept-map-editor`, `concept-maps-list`,
  `configure`, `course-concepts-list`, `course-create`, `course-detail`,
  `course-map`, `courses`, `library`, `packs`, `settings`,
  `workspace` (13 files)
- `configure/`: `course-tab`, `gates-tab`, `memory-tab`, `prompt-tab` (4 files)
- `workspace/`: `cards-list`, `note-editor-page`, `notes-list`,
  `review-session` (4 files)

## Current state

Verified 2026-05-20:

- 2/21 declare `composes: editorial from global`
- 23 `rgba(...)` literals
- 207 bare-`Npx` in `padding`/`margin`/`gap`:
  - configure/memory-tab: 42
  - course-create: 34
  - concept-map-editor: 32
  - library: 29
  - configure/prompt-tab: 28
  - configure/course-tab: 25
  - configure (top-level): also includes drift
  - workspace/cards-list: 4
  - others: smaller buckets
- 0 bare-`ms`, 0 `cubic-bezier(...)`

## Target state

- 21/21 declare `composes: ... editorial from global` on their content
  shell (or document an inline exception — some routes may be
  layout-only wrappers without editorial content)
- rgba count in scope → 0
- Bare-px count in scope → 0
- `configure/` tabs adopt `.tabs` and `.section-head` from the tier-1
  primitive set where the structure fits
- Route headers compose `.route-header` (already adopted in React; CSS
  modules should reference the primitive class)

## Implementation notes

- Apply the translation table from step-1
- `configure/` is the single biggest spacing-drift sub-bucket — tackle
  it as a dedicated sub-batch within this story
- Route shells often define `.container` + `.content` + `.header` —
  these are the editorial-utility targets

## Acceptance criteria

- [ ] `pnpm build && pnpm typecheck && pnpm test` green
- [ ] `grep -rnE '\b(rgb|rgba)\(' --include='*.module.css' packages/ui/src/routes | wc -l` returns `0`
- [ ] `grep -rnE '\b(padding|margin|gap)[^:]*:\s*[^v;]*[0-9]+px' --include='*.module.css' packages/ui/src/routes | grep -v 'var(--' | wc -l` returns `0`
- [ ] 21/21 route CSS modules declare `composes: ... editorial from global`
      (or document inline exceptions)
- [ ] Configure tabs adopt `.tabs` / `.section-head` primitives where they fit
- [ ] Manual smoke test: navigate every top-level route and confirm
      visual parity

## Risk

Medium — second-largest drift bucket; route shells set the editorial
frame for everything inside them, so a regression here is visible
everywhere. Mitigation: per-sub-batch commits and route-by-route smoke
test.

## Rollback

Per-sub-batch revert (configure batch, workspace batch, top-level batch).
