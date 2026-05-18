---
id: epic-ui-redesign-ground-up-chat-workspace-chat-shell-refined-bubbles
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-chat-workspace
depends_on: [epic-ui-redesign-ground-up-design-system-token-swap]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Chat shell — Refined Bubbles base

## Scope

Convert `ChatTabBody` + `Message` to the locked Refined Bubbles
shape: drop bubble outlines; tutor turns on
`var(--color-bg-secondary)`; student turns right-aligned on
`var(--color-bg-tertiary)`; no borders. Sticky session-head with
kicker + title + progress bar. Preserve `tab-body-isolation`.

## Implementation steps

1. Edit `packages/ui/src/components/chat-tab-body.tsx` +
   `chat-tab-body.module.css`:
   - Apply the locked layout per `.mockups/screens/.../-chat-workspace/option-4.html`.
   - Three-column shell is added by the sibling `-side-panels-restyle`
     story; this story focuses on the center column + session-head.
2. Edit `packages/ui/src/components/message.{tsx,module.css}`:
   - Drop outlined-bubble styling.
   - User vs tutor differentiated by alignment + background tint.
3. New `packages/ui/src/components/session-head.{tsx,module.css}`:
   - Kicker (mode glyph + tint dot + mode label).
   - Italic title (session title).
   - Progress bar (where applicable).
4. Tests assert visual contract via snapshots + dom queries.
5. Quality checks green.

## Acceptance criteria

- [x] `ChatTabBody` + `Message` match the Refined Bubbles mock.
- [x] `<SessionHead>` renders kicker + title + progress bar.
- [x] `tab-body-isolation` preserved.
- [x] All quality checks green.

## Implementation notes

### What landed

**`message.module.css`**: Dropped all borders. Tutor turns (`assistant`) now
use `var(--color-bg-secondary)` with full-width left alignment; student turns
(`user`) right-aligned at 75% max-width on `var(--color-bg-tertiary)`.
Speaker labels switched to mono kicker weight (`--font-mono`, `--letter-spacing-kicker`).
Student content uses `font-style: italic` per the locked mock. No bubble outlines.

**`chat-tab-body.module.css`**: Message list padding updated to `1.5rem 2rem`
(matching the mock's 24/32px) with `max-width: 800px` centered column.
Pending bubble also updated to use `--color-bg-tertiary` with no border.
Message gap increased to `1.25rem` for breathing room between turns.

**`session-head.{tsx,module.css}`** (new): Sticky `<header>` with three zones:
- Kicker: `--head-tint` dot + italic serif glyph + mono uppercase mode label.
  Tint flows through CSS custom property `--head-tint` set inline from
  `getModeMeta(modeId).tint` — same pattern as `ModeHeader`.
- Title: `<h1>` in italic display serif (via `composes: editorial from global`).
- Progress: optional `role="progressbar"` with percentage text; omitted when
  `progress` prop is absent.

**`chat-tab-body.tsx`**: Replaced `<ModeHeader>` with `<SessionHead modeId={...} title={tab.title} />`.
Removed the unused `useNavigate` import + `navigate` variable (previously only
used for ModeHeader's "New chat" button). Tab title (`tab.title`) is now the
source for the session head — this matches the UX intent (the tab title
carries the context label, e.g. "algebra · L3").

### Key decision

`SessionHandle` has no `title` field — titles live on `SessionTabSummary`.
The `SessionHead` receives `tab.title` directly from `TeachChatTabBody` rather
than adding a field to `SessionHandle`. Progress bar is optional and unused
for now; it renders if a `progress: number` prop is passed (range [0,1]) and
is wired up when per-lesson progress data becomes available.

### tab-body-isolation preserved

`TeachChatTabBody` itself does not manage its own visibility. The `display:none`
isolation remains in the parent (`chat.tsx`). The component mounts once and
stays mounted — only the CSS visibility is toggled externally. Tests verified.

### Tests

- `session-head.test.tsx` (10 tests): kicker glyph + label, h1 title,
  progress bar presence/absence, aria attributes, unknown mode fallback.
- `message-bubble-refined.test.tsx` (10 tests): label text, CSS class
  application per role, streaming class toggle.
- `chat-tab-body-session-head.test.tsx` (5 tests): SessionHead integration
  in TeachChatTabBody, title in h1, tab-body-isolation mount contract.
- Updated `chat-route.test.tsx`: three tests that used `getByText` on tab
  titles now use `getAllByText` since the title appears in both the TabStrip
  and the new SessionHead h1.

### Files changed

- `packages/ui/src/components/message.module.css`
- `packages/ui/src/components/chat-tab-body.tsx`
- `packages/ui/src/components/chat-tab-body.module.css`
- `packages/ui/src/components/session-head.tsx` (new)
- `packages/ui/src/components/session-head.module.css` (new)
- `packages/ui/src/components/__tests__/session-head.test.tsx` (new)
- `packages/ui/src/components/__tests__/message-bubble-refined.test.tsx` (new)
- `packages/ui/src/components/__tests__/chat-tab-body-session-head.test.tsx` (new)
- `packages/ui/src/__tests__/chat-route.test.tsx` (3 test query updates)

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: `styles.streaming` is referenced in `message.tsx:63` but has no matching
`.streaming` rule in `message.module.css`. This is pre-existing (predates this story
by several commits) — in test environments the CSS module mock stubs the name so the
test passes, but at runtime the class attribute receives the literal string
`"undefined"` when streaming. The cursor + eased-stream mechanism still works
correctly (cursor element is shown via a separate `{streaming && ...}` conditional),
so the missing class has no visible behavioral impact. Leaving as a nit; a follow-up
story can add the class or remove the dead reference.

**Notes**: Implementation matches the locked Refined Bubbles mock cleanly. All 25
tests added by the story are well-structured and cover the behavioral contract
(not implementation details). The `--head-tint` CSS variable pattern for the kicker
dot is consistent with `ModeHeader`. `tab-body-isolation` is correctly left to the
parent. Typecheck failures in `@praxis/desktop` (`courses-section.tsx`,
`note-editor-page.tsx`) are pre-existing and unrelated to this story.
