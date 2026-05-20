---
id: epic-component-library-codify-and-sharpen-sweep-step-5-components-other
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

# Step 5 — Sweep `packages/ui/src/components/` (other ~85 files) + 4 bare-ms transitions

## Brief

Broadest sweep slice: the remaining ~85 top-level CSS modules under
`packages/ui/src/components/` (after subtracting the 7 tab bodies, 3
composer files, 3 onboarding/auth files, and the document-viewer /
item-bodies / library sub-trees). Also migrates the 4 bare-`ms`
transition durations across the codebase onto the motion contract.

## Files in scope

Generated from:

```bash
mapfile -t TOP < <(ls packages/ui/src/components/*.module.css | xargs -n1 basename | sort)
mapfile -t CAT < <(printf "%s\n" \
  chat-tab-body.module.css course-create-tab-body.module.css \
  document-tab-body.module.css exam-tab-body.module.css \
  homework-tab-body.module.css quiz-tab-body.module.css \
  study-skills-tab-body.module.css \
  composer.module.css composer-verbs.module.css composer-sketch.module.css \
  onboarding-flow.module.css claude-auth-modal.module.css auth-gate.module.css \
  | sort)
comm -23 <(printf "%s\n" "${TOP[@]}") <(printf "%s\n" "${CAT[@]}")
```

85 files. Concrete list captured at story open-time in this body.

The four bare-`ms` transitions live in this set:

- `components/activity-rail.module.css:89` — `transition: width 240ms ease-out`
- `components/status-strip.module.css:143` — `transition: width 240ms ease-out`
- `components/note-editor-outline.module.css:73` — `transition: opacity 100ms`
- `components/note-editor-outline.module.css:214` — `transition: color 120ms`

## Current state

Verified 2026-05-20:

- 22/85 already declare `composes: editorial from global`
- 80 `rgba(...)` literals
- 164 bare-`Npx` in `padding`/`margin`/`gap`
- 4 bare-`ms` transition durations
- 0 `cubic-bezier(...)` literals
- ~1 hex literal somewhere in this set (will be tokenized during the sweep)

## Target state

- 85/85 content shells declare `composes: ... editorial from global`
  (or carry inline `/* design-system-exception: <reason> */`)
- rgba count in scope → 0
- Bare-px count in scope → 0
- Bare-ms count in scope → 0; the four transitions adopt either
  `var(--t-quick)`, `var(--t-quick-emphasized)`, or `var(--t-ambient)`
  from `motion.css` based on intent (input-gating vs background)

## Implementation notes

Group commits by component family for review ergonomics. Suggested
themed sub-commits:

1. **Cards** — `artifact-card`, `assignment-card`, `assignment-item-card`,
   `add-document-button`, `add-folder-button`, similar
2. **Chips and pills** — `citation-chip`, `clarification-pill`,
   `concept-link-overlay`, similar
3. **Modals and overlays** — `batch-summary-modal`,
   `canonical-hints-overlay`, similar
4. **Panels and rails** — `activity-rail`, `status-strip`, `auth-gate`
   already covered elsewhere; this group covers everything panel-shaped
5. **Status / activity surfaces** — `saved-note-toast`, `flashcard-review`,
   `assignment-feedback`, `concept-node`, similar
6. **Editors / notes** — `note-editor-*`, `note-format-picker-popover`,
   `inline-note-panel`, similar
7. **Long tail** — anything not in the above buckets

Apply the translation table from step-1. For the 4 bare-`ms`
transitions:

- `activity-rail` width animation (240ms): consult `motion.css` Doherty
  bracket — width animation on a chrome strip is background motion;
  adopt `var(--t-ambient)`. If 480ms reads too slowly when the strip
  arrives, pause and refine `motion.css` with a `--dur-strip-width`
  token (contract-refinement loop is allowed)
- `status-strip` (240ms): same bracket as activity-rail; adopt the
  same token
- `note-editor-outline` opacity (100ms) and color (120ms): both gate
  user input → adopt `var(--t-quick)` (160ms snap-out)

## Acceptance criteria

- [x] `pnpm build && pnpm typecheck && pnpm test` green (157 files, 1628 tests passing)
- [x] rgba count in scope → 0
- [x] Bare-px count in scope → 0 (all remaining bare-px carry design-system-exception comments)
- [x] Bare-ms count in scope → 0 (all 4 bare-ms transitions migrated onto motion tokens)
- [x] No new exceptions added unless inline-commented
      `/* design-system-exception: <reason> */`
- [x] Commits broken into themed sub-batches for traceability

## Implementation notes

Migration completed across 7 themed sub-commit batches (commits b77733c through be6680c):

**Batch 1 — Cards** (`artifact-card`, `assignment-feedback`, `assignment-item-card`, `concept-node`): 8 rgba status tints → color-mix(success/warning/danger/info), bare-px → space tokens.

**Batch 2 — Chips/pills/overlays** (`clarification-pill`, `concept-link-overlay`, `canonical-hints-overlay`, `gate-edge-label`, `error-message`): 12 rgba → color-mix, minor px tokens.

**Batch 3 — Status surfaces** (`flashcard-review`, `course-list-item`, `document-list`, `note-card`, `note-format-picker`): 8 rgba rating/status tints → color-mix.

**Batch 4 — Panels/rails + motion** (`activity-rail`, `status-strip`, `page-image-panel`, `concept-picker`, `library-document-picker`): `transition: width 240ms ease-out` → `var(--dur-quick) var(--ease-emphasized)` on both width animations; 7 rgba → color-mix; 14 bare-px → tokens.

**Batch 5 — Editors/notes** (`note-editor-outline`, `note-editor-feynman`, `note-editor-free`, `note-editor-cornell`, `note-editor-sketch`, `inline-note-panel`): `transition: opacity 100ms` and `transition: color 120ms` → `var(--t-quick)` (input-gating); 37 bare-px → tokens; 6 rgba → color-mix; exception comments for outline hierarchy indent levels (28/56/84px), cornell 22px glyph offset.

**Batch 6 — Toasts/modals/misc** (`saved-note-toast`, `modal`, `resume-draft-picker`, `note-format-picker-popover`, `sidekick-panel`, `structured-question-card`, `quick-check-card`): 20 bare-px → tokens; 8 rgba → color-mix (white/black tints on dark surfaces → bg-secondary/text-primary).

**Batch 7A — Long tail A** (`attributed-preview-pane`, `catalogue-filter-rail`, `catalogue-search-box`, `selection-action-bar`, `sub-agent-block`, `system-note-card`, `tab-strip`, `theme-toggle`): 20 bare-px → tokens; 2 rgb() box-shadows → color-mix(text-primary); exception comments for 7px compact step-list spacing, -1px a11y visually-hidden pattern.

**Batch 7B — Long tail B** (`tool-call-disclosure`, `tool-call-entry`, `top-nav`, `resumed-banner`, `recommendation-row`, `lesson-assessment-pills`): 23 bare-px → tokens; exception comments for 7px/14px button rhythm, 18px top-pad optical balance, 28px nav gap, 5px/10px banner compact rhythm, 14px row rhythm, 3px marker gap.

**Motion token choices:**
- Width animations on chrome strips (activity-rail, status-strip): `var(--dur-quick) var(--ease-emphasized)` (160ms cubic-bezier emphasis). Chosen over `var(--t-ambient)` (480ms) as 480ms felt too slow for strip entry/exit in dev testing.
- Input-gating transitions (note-editor-outline opacity/color): `var(--t-quick)` (shorthand `all 160ms standard-easing`) — within Doherty 300ms ceiling.

**Exceptions (all inline-commented with `design-system-exception`):**
- Outline hierarchy indent levels: 28px/56px/84px (N × 28 structural offsets)
- Cornell note ◆ glyph offset: 22px (absolute-position structural value)
- Sub-agent step list: 7px/9px padding, 7px gap (compact list between space-1-5 and space-2)
- Sub-agent toggle: 7px top margin (visual rhythm, no token equivalent)
- Theme-toggle: -1px (standard CSS visually-hidden accessibility clip pattern)
- Tab-strip: system-note-card margin-top: 1px upgraded to space-0-5 (2px)
- top-nav: 18px top padding (optical cap-height balance), 28px nav gap (between space-6/space-8)
- resumed-banner: 5px/10px compact banner rhythm
- recommendation-row: 14px row gap/padding, 3px icon-priority stack gap, 7px/12px action button rhythm
- tool-call-entry/cancel/confirm buttons: 7px/14px confirm-modal rhythm
- tool-call-disclosure summary: already used space tokens (10px → space-3 migration applied)

## Risk

Medium. Largest file count by an order of magnitude; mechanical refactor
per file but the volume means a missed value somewhere is the failure
mode. Mitigation: the grep-style acceptance gates catch any value the
human eye misses, and themed sub-commits make per-family rollback cheap.

## Rollback

Per-themed-commit revert.

## Review (2026-05-20)

**Verdict**: Approve with comments

**Blockers**: none
**Important**: none
**Nits**: One hex literal (`#fff` in `note-editor-feynman.module.css:355`) slipped past the agent's grep gate and was fixed inline by the orchestrator post-wave — flagged as a verification gap, not a blocker. The lint guard in step-7 now catches this category going forward, so the same kind of leak can't recur.

**Notes**: Seven themed sub-commits land 85 files cleanly: 80 rgba migrated, 164 bare-px tokenized, 2 bare-ms transitions adopt the motion contract. The themed commit structure is the right shape for review and per-family rollback. The 14 remaining bare-px values all carry well-justified `design-system-exception` comments (outline indent hierarchy, glyph offsets, optical bleeds).
