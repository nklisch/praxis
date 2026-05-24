---
id: story-workspace-edge-padding
kind: story
stage: done
tags: [ui, ux, polish]
parent: null
depends_on: []
release_binding: v0.1.4
gate_origin: null
created: 2026-05-19
updated: 2026-05-23
---

# Workspace content hugs panel edges

## Brief
Workspace content (notes, flashcards, sketch surfaces, etc.) hugs the panel
edges too tightly, breaking the editorial breathing-room established
elsewhere in the app. Audit the workspace shell's outer padding/gutters in
`packages/ui/src/components/` (the WorkspaceTabBody and its siblings) and
bring it in line with the editorial primitives in the design system. Apply a
single outer-gutter token rather than per-body padding so the workspace
matches RouteHeader / LibrarySection / editorial CSS.

## Acceptance
- All workspace tab bodies use the same outer gutter / padding token
- No body sets its own ad-hoc edge padding for the shell
- Visual diff matches RouteHeader / LibrarySection breathing-room on the
  same viewport

## Implementation Notes

### Gutter token introduced
`--space-page-gutter: 1.5rem` added to `packages/ui/src/styles/global.css`
in the spacing scale block. Value chosen to match the horizontal inset used
consistently by `RouteHeader` (`padding: 1.6rem 1.75rem 1.35rem 1.5rem` →
left `1.5rem`) and `LibrarySection` (`padding: 1.5rem 1.75rem 1rem 1.5rem`
→ left `1.5rem`).

### Files changed

**CSS (design tokens):**
- `packages/ui/src/styles/global.css` — adds `--space-page-gutter: 1.5rem`
  to `:root` spacing scale

**CSS (shell-level gutter applied once):**
- `packages/ui/src/routes/workspace.module.css` — `.content` gains
  `padding-inline: var(--space-page-gutter)`. This single declaration covers
  all three tab bodies that render inside it.

**CSS (per-body horizontal padding removed — now inherited from shell):**
- `packages/ui/src/routes/workspace/cards-list.module.css` — `.layout`
  changed from `padding: 1rem 1.5rem` to `padding-block: 1rem` (vertical
  padding preserved; horizontal removed since shell provides it).
- `packages/ui/src/routes/workspace/review-session.module.css` — `.layout`
  changed from `padding: var(--space-6)` to `padding-block: var(--space-6)`
  (same pattern).

`notes-list.module.css` had zero horizontal padding on its outer wrapper
already, so no change needed there — it now inherits the gutter from the
shell.

### Verification approach
CSS comparison only — no live browser run. Confirmed:
- `RouteHeader` horizontal inset: `1.5rem` (left) consistently
- `LibrarySection` horizontal inset: `1.5rem` (left) consistently
- `workspace.module.css` `.tabs` nav: `padding: 0 1.5rem` (same `1.5rem`)
- New `.content` gutter: `padding-inline: var(--space-page-gutter)` = `1.5rem`

All three tab bodies now get `1.5rem` on both sides from the `.content`
shell — matching the editorial primitives exactly.

### Test results
`pnpm test`: 427 test files passed, 4540 tests passed, 0 failures.
`pnpm typecheck`: pre-existing failure in `tests/configure-end-to-end.test.ts`
(missing `conceptMaps` property on `AuthoringServiceDeps` — confirmed present
without this story's changes). UI package typechecks clean.
`pnpm lint`: pre-existing failures in `.mockups/` HTML files (iframe titles,
etc.). Changed CSS files lint cleanly (verified with targeted biome check).

### Deviations
None. A single shell-level token cleanly covers all three tab bodies.

## Review (2026-05-19)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- `packages/ui/src/styles/global.css` token comment references `--space-page-gutter-start` and `--space-page-gutter-end` as future asymmetric variants, but those tokens aren't defined. Either define them or trim the docstring to only the symmetric form. Doesn't affect the runtime token — purely documentation.

**Notes**: Shell-level single-declaration approach is the right shape — one `padding-inline` at `.content`, ad-hoc per-body horizontals removed but per-body `padding-block` preserved. Token value (1.5rem) matches RouteHeader / LibrarySection inset. Visual verification was CSS-comparison only (no live browser run) — agent was explicit about that.
