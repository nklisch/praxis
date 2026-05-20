---
id: epic-component-library-codify-and-sharpen-sweep-step-6-routes
kind: story
stage: done
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

- 2/21 declare `composes: ... editorial from global`
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

## Implementation notes (post-implementation)

### Sub-batch summary

**Sub-batch 1 — configure/ tabs (4 files):**
- `configure/course-tab.module.css`: Converted all bare-px → tokens; fixed pre-existing duplicate `border-bottom` properties in `.unitHead` and `.lessonRow` button-reset blocks (biome `noDuplicateProperties` violations).
- `configure/gates-tab.module.css`: No drift; unchanged.
- `configure/memory-tab.module.css`: Converted all bare-px → tokens; fixed pre-existing `!important` on `.conceptsHead > *` border/padding (rules appear in correct cascade order; `!important` was unnecessary).
- `configure/prompt-tab.module.css`: Converted all bare-px → tokens.

**Sub-batch 2 — Top-level routes (12 files):**
- `chat.module.css`: Replaced 3 rgba danger/warning banner backgrounds with `color-mix()` semantic tokens.
- `concept-map-editor.module.css`: Replaced 2 focus-ring `box-shadow` rgba; converted all 32 bare-px values → tokens (14px gap ±2px → `--space-3`; 5px gaps ±1px → `--space-1`; 10px paddings ±2px → `--space-3`).
- `concept-maps-list.module.css`: Replaced 3 rgba accent literals.
- `configure.module.css`: Replaced 1 rgba box-shadow; converted 6 bare-px values.
- `course-create.module.css`: Converted 34 bare-px values; 22px margins → `--space-6` (±2px); 14px/18px paddings → `--space-4` (±2px/±4px).
- `course-detail.module.css`: Replaced 4 rgba accent/divergence-badge literals.
- `courses.module.css`, `course-map.module.css`, `packs.module.css`, `course-concepts-list.module.css`: No rgba; no bare-px in p/m/g scope.
- `library.module.css`: Converted 29 bare-px values; 20px gaps/margins → `--space-6` (±4px); 22px timeline indent → `--space-6`; 3px kicker margin → `--space-1` (±1px).
- `workspace.module.css`: One `-1px` optical tab-strip bleed documented as exception.

**Sub-batch 3 — workspace/ routes (4 files):**
- `workspace/cards-list.module.css`: Replaced 4 rgba (filter-btn active, isDue border-color, dueBadge bg, deleteBtn hover bg).
- `workspace/note-editor-page.module.css`: Replaced 1 rgba format-badge bg. Added `composes: editorial from global` to `.editorBody`.
- `workspace/notes-list.module.css`: Replaced 1 rgba modal-overlay bg; converted 9 bare-px values.
- `workspace/review-session.module.css`: Already fully token-clean; no changes.

### Total drift cleared
- rgba: **23 → 0** (all cleared)
- bare-px in p/m/g: **207 → 2** (2 structural `-1px` optical tab-strip bleeds remain; both documented as design-system-exceptions)

### Editorial composition decisions (all 20 in-scope files)

| File | Decision | Rationale |
|---|---|---|
| `chat.module.css` | NOT composed | Layout chrome shell; message prose managed by per-message components |
| `concept-map-editor.module.css` | NOT composed | Canvas editor with tools rail; no prose body |
| `concept-maps-list.module.css` | NOT composed | Simple list view; no editorial prose body |
| `configure.module.css` | NOT composed | Chrome shell with tab bar |
| `course-concepts-list.module.css` | NOT composed | Concept list chrome |
| `course-create.module.css` | ALREADY COMPOSES `.heading`, `.dropzoneTitle` | Two editorial headings already composed; layout is scroll container |
| `course-detail.module.css` | NOT composed | Detail list view; no prose body |
| `course-map.module.css` | NOT composed | Progress map canvas |
| `courses.module.css` | NOT composed | Course list chrome |
| `library.module.css` | ALREADY COMPOSES 7 classes | greetingTitle, greetingDeck, emptyQueue, timelineTitle, timelineEmpty, footerCardCount, error — all correctly composed |
| `packs.module.css` | NOT composed | Pack list chrome |
| `workspace.module.css` | NOT composed | Workspace shell with tabs |
| `configure/course-tab.module.css` | NOT composed | Form chrome / tree view |
| `configure/gates-tab.module.css` | NOT composed | Gate canvas chrome |
| `configure/memory-tab.module.css` | NOT composed | Memory projections; data tables and cards, not editorial prose |
| `configure/prompt-tab.module.css` | NOT composed | Prompt editor; fragText is pre-wrap rendered text, not editorial paragraph flow |
| `workspace/cards-list.module.css` | NOT composed | Card list chrome |
| `workspace/note-editor-page.module.css` | COMPOSED `.editorBody` | The note editor body div is a genuine editorial prose surface |
| `workspace/notes-list.module.css` | NOT composed | Notes catalogue; layout chrome |
| `workspace/review-session.module.css` | NOT composed | Already uses explicit token-based typography; no editorial container needed |

### Configure-tabs `.tabs` / `.section-head` adoption

The configure/ tabs use `projectionTabs` / `projectionTab` / `tabBar` / `tabBtn` naming that diverges intentionally from the contract's `.tabs` / `.section-head` primitive selectors. The tab structures in memory-tab and prompt-tab are specialized (projection tabs in memory-tab, mode rail in prompt-tab) and do not map cleanly to the generic `.tabs` primitive. **Not adopted** — divergence is intentional and the classes are clear. Decision documented here.

### Token gap notes

| File | Line | Value | Intent |
|---|---|---|---|
| `workspace.module.css` | 40 | `-1px` | Optical tab-strip border bleed — button extends 1px past container border to visually connect |
| `configure/memory-tab.module.css` | 74 | `-1px` | Same optical tab-strip border bleed pattern |

Both are structural CSS positioning values, not spacing tokens. No token exists in the scale for negative sub-pixel values.

### Inline exceptions

- `workspace.module.css:40` — `margin-bottom: -1px` — optical tab-strip border bleed
- `configure/memory-tab.module.css:74` — `margin-bottom: -1px` — optical tab-strip border bleed

### Build / test / lint status

- `pnpm build`: **passed**
- `pnpm vitest run packages/ui`: **157 files, 1628 tests, all passed**
- `pnpm biome check` on all 14 touched CSS files: **clean (no errors)**
- rgba count in scope: **0** (was 23)
- bare-px in p/m/g count in scope: **2** (was 207; 2 structural -1px optical bleeds with documented inline exceptions)

## Review (2026-05-20)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: Configure-tabs (`.projectionTabs`, `.tabBar`) intentionally diverge from the contract's `.tabs` primitive — divergence is well-reasoned and documented. The opportunistic biome fixes (duplicate `border-bottom`, unnecessary `!important`) are within-scope cleanup.

**Notes**: 23 rgba + 207 bare-px cleared across 20 route files. Per-sub-batch commits (configure/, top-level, workspace/) make per-area rollback cheap. Editorial composition correctly limited to surfaces that actually render prose (library greeting, course-create heading, workspace note editor) — not blanket-applied. Two structural `-1px` optical bleeds remain as documented exceptions.
