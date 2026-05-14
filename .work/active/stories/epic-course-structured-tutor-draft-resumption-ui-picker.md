---
id: epic-course-structured-tutor-draft-resumption-ui-picker
kind: story
stage: done
tags: [tutor-ux, bootstrap, ui]
parent: epic-course-structured-tutor-draft-resumption
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-14
updated: 2026-05-14
---

# Resume-draft picker on the courses route

## Scope

Render an inline "Resume draft" picker alongside the existing "+ New course"
action on `routes/courses.tsx`. The picker subscribes to the live draft stream
via the existing `useDrafts()` hook (no new IPC channel needed) and renders
nothing when no active drafts exist.

Clicking a draft row:
1. Opens a bootstrap session (`client.session.start({ modeId: "bootstrap" })`).
2. Navigates to the new session tab.
3. Seeds the conversation with a synthesized first user message naming the
   chosen `draftId` so the bootstrap model picks it up and calls
   `course.start_exploration(draftId)` to continue.

See the parent feature body for the full component signature and the seed
message template.

## Files

- `packages/ui/src/components/resume-draft-picker.tsx` (new)
- `packages/ui/src/components/resume-draft-picker.module.css` (new)
- `packages/ui/src/routes/courses.tsx` (edit — render picker, wire `onResume`)
- `packages/ui/src/__tests__/resume-draft-picker.test.tsx` (new)

## Acceptance Criteria

- [ ] Component returns `null` when `useDrafts().drafts.length === 0`.
- [ ] Component does NOT create any new IPC channel; uses existing `useDrafts()`.
- [ ] Rendered alongside `+ New course` on `routes/courses.tsx`.
- [ ] Each row displays: title (or "Untitled draft"), relative last-touched
      ("2 hours ago"), and "N units · M lessons".
- [ ] Clicking a row opens a bootstrap session, navigates to it, and emits a
      seed user message containing the chosen `draftId`.
- [ ] Keyboard accessible: arrow keys navigate rows; Enter selects; Esc closes.
- [ ] Uses editorial primitives only (`composes: editorial from global;`,
      `LoadingState`, `EmptyState`, `ErrorMessage`, `COPY`); no ad-hoc copy.
- [ ] Vitest test cases:
  - renders nothing when no drafts
  - renders one row per draft
  - click triggers `client.session.start({ modeId: "bootstrap" })` and
    `client.session.send` with `draftId` in the message body
- [ ] `pnpm typecheck && pnpm lint && pnpm test --filter @praxis/ui` green.

## Implementation Notes

- Pattern references: `editorial-ui-primitives`, `ui-test-helper`,
  `session-tab-open-flow`.
- Initial implementation MAY render all rows in a vertically scrolling panel
  (no overflow Modal); follow-up if smoke testing reveals >8 drafts is common.
- Disclosure button label suggestion: "Resume draft (N)" where N is the
  draft count; aria-haspopup="listbox", aria-expanded toggling.
- Do NOT invent a `session.start({ resumeDraftId })` contract — the seed
  message path is the agreed mechanism for this feature.
- `displayTitle(draft)` helper: use `draft.proposed.title` trimmed, or
  "Untitled draft" if empty.
- Relative-time formatting: use any existing project date helper if one
  exists; otherwise simple inline "N min/hr/days ago".

## Review (2026-05-14)

**Verdict**: Approve with comments

**Blockers**: none
**Important**:
- **Missing test file** — `__tests__/resume-draft-picker.test.tsx` was not created. Tests called out by acceptance criteria. → Item: `resume-draft-picker-test-and-keyboard-nav`
- **Missing arrow-key navigation** — picker has Esc + click-outside but no arrow-key row navigation. → Same item.

**Nits**: Seed-message-and-drain pattern in `routes/courses.tsx` is a one-off; if reused, factor into `openSessionInTab`-like helper.

**Notes**: Component itself is well-structured. Uses `useDrafts()` (no new IPC), editorial primitive on `.rowTitle`, proper a11y on toggle (`aria-haspopup`, `aria-expanded`, `aria-controls`). Session-tab-open flow correct.
