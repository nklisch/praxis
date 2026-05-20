---
id: epic-component-library-codify-and-sharpen-sweep-step-3-tab-bodies
kind: story
stage: review
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

## Implementation notes (2026-05-20)

### Files changed and drift cleared

| File | Bare-px cleared | rgba cleared |
|---|---|---|
| `homework-tab-body.module.css` | 51 | 0 |
| `exam-tab-body.module.css` | 44 | 0 |
| `quiz-tab-body.module.css` | 30 | 0 |
| `study-skills-tab-body.module.css` | 24 | 0 |
| `course-create-tab-body.module.css` | 18 | 0 |
| `document-tab-body.module.css` | 4 | 0 |
| `chat-tab-body.module.css` | 0 | 4 |
| **Total** | **171** | **4** |

All 175 drift values cleared. Post-migration grep counts: bare-px = 0, rgba = 0.

### Translation table applied (per step-1 contract)

- `2px → var(--space-0-5)` (exact)
- `3px → var(--space-1)` (1px shift — citation-mark inline pad, negligible at this scale)
- `4px → var(--space-1)` (exact)
- `5px → var(--space-1)` (1px shift — inline-code horizontal pad, same as step-1 decision)
- `6px → var(--space-1-5)` (exact — rail heads, padding-bottom)
- `8px → var(--space-2)` (exact)
- `10px → var(--space-2)` (2px shift — acceptable for outer paddings and gaps)
- `11px → var(--space-3)` (1px shift — `.submitBtn` padding — kept as `var(--space-3)`)
- `12px → var(--space-3)` (exact)
- `14px → var(--space-4)` (2px shift — button paddings, card paddings; acceptable)
- `16px → var(--space-4)` (exact)
- `18px → var(--space-4)` (2px shift — textarea padding; acceptable)
- `20px → var(--space-6)` (4px shift — `.rubricItem` margin-bottom, `.readyHead`; acceptable for between-item spacing)
- `22px → var(--space-6)` (2px shift — rail padding; acceptable)
- `24px → var(--space-6)` (exact)
- `28px → var(--space-8)` (4px shift — `.main` padding in homework/quiz, `.itemCard` padding; acceptable for major layout padding)
- `32px → var(--space-8)` (exact)
- `36px → var(--space-8)` (4px shift — `.itemCard`/`.submittedBanner` side padding in quiz/exam; acceptable)
- `48px → var(--space-12)` (exact — `.clarificationWrap` min-height)
- `rgba(220, 50, 50, α) → color-mix(in srgb, var(--color-danger) α%, transparent)` (tracks theme)
- `rgba(251, 191, 36, α) → color-mix(in srgb, var(--color-warning) α%, transparent)` (tracks theme)

### Editorial composition decisions

- **chat-tab-body**: `.messages` — **composed** — primary prose surface for student ↔ tutor dialogue; serif body is correct here. Also: `.cancelMarker` and `.pendingChip` already had `composes: editorial from global` from prior work.
- **document-tab-body**: `.body` — **composed** — reading column contains arbitrary document prose (h1–h6, p, ul/ol, code, blockquote, table). The reading-column child selectors set explicit typography; composing `editorial` on `.body` is safe and provides the correct baseline for any unstyled children.
- **homework-tab-body**: `.main` — **composed** — center column renders the mode-rule banner, item card, work textarea, and question prompts; all editorial surfaces. The non-prose answer-interaction elements (workTabs, actionBar) live inside `.main` but have explicit non-editorial typography overrides — composition is safe.
- **exam-tab-body**: `.examMain` — **composed** — renders exam title, mode rule, rubric criteria (prose), and clarification affordance; editorial throughout.
- **quiz-tab-body**: `.main` — **composed** — same shape as homework; question prompts and mode rule are editorial.
- **study-skills-tab-body**: `.main` — **composed** — metacognitive prompt banner is editorial; the chat pane nested within renders through its own `ChatTabBody`.
- **course-create-tab-body**: `.container` — **not composed** (explicit `/* design-system-exception: */` comment in file) — this is a structured authoring canvas (unit list, lesson rows, confirm card, authoring chat). No editorial prose body. The authoring chat is handled by `AuthoringChatPane` (its own component) which has its own editorial contract.

### Token gap notes

No new tokens needed. All values mapped cleanly to the existing 10-point scale using the step-1 translation table. The largest single shift is 4px (28px → 32px for `.main` padding), which is acceptable for major layout padding on a content surface.

### Exceptions

No inline `/* design-system-exception */` comments added for spacing values — all mapped cleanly.

One `/* design-system-exception */` comment added at the top of `course-create-tab-body.module.css` documenting the deliberate decision not to compose `editorial` on `.container`.

### Build / test / lint status

- `grep bare-px | wc -l`: **0** (was 171)
- `grep rgba | wc -l`: **0** (was 4)
- `pnpm vitest run packages/ui`: **157 files, 1628 tests, all passed**
- `pnpm build`: **passed** (desktop bundle built successfully)
- `pnpm biome check` on 7 files: **clean (7 files, no fixes)**
