---
id: epic-component-library-codify-and-sharpen-sweep-step-3-tab-bodies
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

# Step 3 — Sweep the seven `*-tab-body.module.css` files

## Brief

Migrate the per-mode workspace tab bodies — the surfaces students
actually inhabit during quiz / homework / exam / study-skills /
course-create / document / chat — onto the design-system contract. This
is the single largest spacing-drift bucket among the per-area slices.

## Files in scope

- `packages/ui/src/components/chat-tab-body.module.css`
- `packages/ui/src/components/course-create-tab-body.module.css`
- `packages/ui/src/components/document-tab-body.module.css`
- `packages/ui/src/components/exam-tab-body.module.css`
- `packages/ui/src/components/homework-tab-body.module.css`
- `packages/ui/src/components/quiz-tab-body.module.css`
- `packages/ui/src/components/study-skills-tab-body.module.css`

## Current state

Verified 2026-05-20:

- 2/7 declare `composes: ... editorial from global` (chat only)
- 4 `rgba(...)` literals (all in chat-tab-body)
- 171 bare-`Npx` in `padding`/`margin`/`gap`:
  - homework-tab-body: 51
  - exam-tab-body: 44
  - quiz-tab-body: 30
  - study-skills-tab-body: 24
  - course-create-tab-body: 18
  - document-tab-body: 4
- 0 bare-`ms` transitions, 0 `cubic-bezier(...)`

## Target state

- All 7 tab-body content shells declare `composes: ... editorial from global`
  (or carry an inline `/* design-system-exception: <reason> */` if a
  surface deliberately opts out)
- Every spacing value resolves to `var(--space-*)`
- Every color value resolves to `var(--color-*)` (the four chat rgba
  values map to existing tokens)
- Section heads use `.section-head` / `.section-rule` where the
  structure fits
- Per-mode `.kicker` / `.kickerDot` / `.kickerGlyph` styling preserved —
  the mode tints (`var(--tint-homework)`, `--tint-exam`, etc.) are
  already tokenized

## Implementation notes

- All seven bodies share the structural shape `head + body + footer`.
  Refactor `homework-tab-body` first (biggest drift, well-exercised
  surface) — it becomes the template for the other six
- Don't restructure the layout; this is a token-and-primitive
  migration, not a redesign
- Apply the translation table from step-1

## Acceptance criteria

- [ ] `pnpm build && pnpm typecheck && pnpm test` green
- [ ] `grep -nE '\b(padding|margin|gap)[^:]*:\s*[^v;]*[0-9]+px' packages/ui/src/components/{chat,course-create,document,exam,homework,quiz,study-skills}-tab-body.module.css | grep -v 'var(--' | wc -l` returns `0`
- [ ] `grep -nE '\b(rgb|rgba)\(' packages/ui/src/components/{chat,course-create,document,exam,homework,quiz,study-skills}-tab-body.module.css | wc -l` returns `0`
- [ ] 7/7 content shells declare `composes: ... editorial from global`
      (or document why-not inline)
- [ ] Manual smoke test: open one session per mode and confirm visual
      shape matches the post-contract showcase

## Risk

Medium — biggest drift bucket means most opportunities to miss a value
or break alignment. Per-tab visual smoke test catches the obvious
breaks; the lint guard (step-7) catches anything left.

## Rollback

`git revert <commit>` — per-file or per-mode-batch revert is possible
if the story lands as separate commits per body.
