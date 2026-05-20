---
id: epic-component-library-codify-and-sharpen-sweep-step-5-components-other
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

- [ ] `pnpm build && pnpm typecheck && pnpm test` green
- [ ] rgba count in scope → 0
- [ ] Bare-px count in scope → 0
- [ ] Bare-ms count in scope → 0
- [ ] No new exceptions added unless inline-commented
      `/* design-system-exception: <reason> */`
- [ ] Commits broken into themed sub-batches for traceability

## Risk

Medium. Largest file count by an order of magnitude; mechanical refactor
per file but the volume means a missed value somewhere is the failure
mode. Mitigation: the grep-style acceptance gates catch any value the
human eye misses, and themed sub-commits make per-family rollback cheap.

## Rollback

Per-themed-commit revert.
