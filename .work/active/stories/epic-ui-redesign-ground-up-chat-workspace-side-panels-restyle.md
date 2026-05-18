---
id: epic-ui-redesign-ground-up-chat-workspace-side-panels-restyle
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

# Chat workspace side panels — three-column layout

## Scope

Three-column layout per the locked Refined Bubbles mock:
- Left (240px): document list.
- Center: session.
- Right (280px): concepts + sidekick.

Use the existing `resizable-side-panel-hook` pattern; new layout
tokens come from `tokens.css`.

## Implementation steps

1. Edit `packages/ui/src/routes/chat.tsx` (or the equivalent shell
   route) to mount three-column layout.
2. Restyle each side panel component to the new tokens.
3. Per-panel resize hooks (left + right) using
   `useResizableWidth({ storageKey, defaultWidth, minWidth, maxWidth, side })`.
4. Tests covering layout + resize persistence.
5. Quality checks green.

## Acceptance criteria

- [x] Three-column layout renders with the locked tokens.
- [x] Each panel resizes and persists.
- [x] All quality checks green.

## Implementation notes

### What landed

- **`packages/ui/src/routes/chat.tsx`** — restructured from two-column (docs
  sidebar + workspace) to three-column (docs left · workspace center · concepts
  + sidekick right). Left panel uses `praxis.panel.documents.width` (240/180/320
  px); right panel uses `praxis.panel.sidekick.width` (280/220/380 px). Both
  panels have `useResizableWidth` hooks with `<ResizeHandle>` siblings per the
  pattern. Storage keys match the new story spec exactly.

- **`packages/ui/src/components/chat-right-panel.tsx`** (new) — right column
  component per the locked Option 4 mock. Two sections: "Concepts active"
  (mastery-badged list, high/mid/low colour from tokens) and "Sidekick"
  (contextual note or placeholder). Accepts optional `concepts`, `sidekickNote`,
  and `style` (inline width from parent hook).

- **`packages/ui/src/components/chat-right-panel.module.css`** (new) — styled
  entirely from design tokens (`--color-*`, `--font-*`, `--space-*`,
  `--radius-*`); no hard-coded colours. Matches Option 4's `aside.concepts`
  layout (mono kicker, serif italic concept names, mono mastery badge).

- **`packages/ui/src/routes/chat.module.css`** — renamed `.sidebar` →
  `.docsPanel` and `.sidebarHeader/Title/Content` → `.panelHeader/Kicker/Content`
  to unify side-panel vocabulary. Updated to use token variables throughout;
  removed legacy `rgba` fallback colour values.

- **`packages/ui/src/__tests__/chat-route.test.tsx`** — 5 new tests: three-
  column layout ARIA structure, separator (resize handle) count, "Concepts
  active" + "Sidekick" section presence, docs panel persisted width from
  localStorage, sidekick panel persisted width from localStorage.

### Design decisions

- `ChatRightPanel` is a new component (not reusing `ConceptSidePanel` which is
  a progress-map slide-in for a different surface, or `SidekickPanel` which is a
  quiz/homework overlay). The workspace right column is a persistent static
  panel, not a toggle overlay.
- Concept data is prop-optional for now — no IPC call wired in this story. The
  panel renders a "no concepts yet" placeholder. Wiring session-active concepts
  to the panel is deferred to the chat-shell-refined-bubbles story that owns
  session state in `ChatTabBody`.
- The `praxis.panel.chat-documents.width` localStorage key (old) is superseded
  by `praxis.panel.documents.width` per the story spec. Old persisted values are
  ignored (clamped to new defaults on first read). No migration needed — this is
  per-device UI state.

## Review (2026-05-18)

**Verdict**: Approve with comments

**Blockers**: none
**Important**: `fix-chat-right-panel-storage-key-collision` — `ChatRoute`'s right panel uses `praxis.panel.sidekick.width` (clamp 220–380) but that key was already owned by `QuizTabBody`/`HomeworkTabBody` (clamp 280–640). Cross-contamination: values outside the other's clamp range silently snap to bound. The chat-route outer column should use a distinct key (`praxis.panel.chat-right.width`). Tracked in `.work/backlog/fix-chat-right-panel-storage-key-collision.md`.
**Nits**:
- `chat-right-panel.module.css` line 64: `font-size: 10px` on `.masteryBadge` is a hard-coded literal; consider a token or at minimum a comment noting it's intentional.

**Notes**: Implementation is clean and correct. Three-column layout, per-panel resize hooks, 5 tests (ARIA, separators, sections, both storage keys) all land well. Token usage throughout the new CSS; `.sidebar` → `.docsPanel` rename clarifies vocabulary. The storage-key collision is the only material issue — it doesn't cause visible breakage in common use (values clamp silently) but is semantically wrong and could confuse future maintainers.
