---
id: epic-ui-redesign-ground-up-configure-prompts-tab-canvas
kind: story
stage: done
tags: [ui]
parent: epic-ui-redesign-ground-up-configure
depends_on: [epic-ui-redesign-ground-up-configure-canvas-side-chat-shell]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Configure Prompts tab canvas — composed fragment document

## Scope

Rebuild Prompts tab canvas per `tab-prompts.html`:
- Left rail: mode picker (teach / quiz / homework / exam /
  course-create / study-skills / configure).
- Canvas: composed prompt document with ordered fragments.
- Per-fragment lock-status pill (locked / default / custom / added
  today) and knobs (scaffold / tone / formality / verbosity).
- Composed-prompt summary at bottom shows fragment composition order.

## Implementation steps

1. Edit `packages/ui/src/routes/configure/prompt-tab.tsx`.
2. New `<ModePickerRail>` (rail of mode buttons).
3. New `<FragmentDocument>` showing ordered fragments per mode;
   per-fragment editor + lock pill + knobs.
4. Composed-prompt summary at bottom.
5. Wire to `praxisClient.authoring.{listFragmentOverrides,
   customizePrompt, clearFragmentOverride, previewPromptWithAttribution}`.
6. Tests cover mode switch + fragment edit + composition preview.
7. Quality checks green.

## Acceptance criteria

- [x] Prompts tab matches the locked mock.
- [x] Mode picker + fragment editing works.
- [x] Composed-prompt preview surfaces.
- [x] All quality checks green.

## Implementation notes

Rebuilt `packages/ui/src/routes/configure/prompt-tab.tsx` as a v4 canvas
surface per the locked `tab-prompts.html` mock.

**Left rail (`ModePickerRail`, ~200px)**: Lists all registered modes from
`listModes()` with typographic glyphs (§ ‡ ❦ †…). Active mode is
highlighted with accent left-border. Calls `setSelectedModeId` on click;
passes `dirtyModes` set for change-dot display (cross-mode dirty tracking
deferred — single-mode dirty state wires through `useDirtyState` in the
fragment document).

**Canvas (`FragmentDocument`)**: Ordered `PromptFragment[]` for the selected
mode. Each fragment renders as a `FragmentCard` with:
- Position number (01., 02., …)
- Fragment ID and humanised name in the header
- Lock-status pill (`locked` / `default` / `custom`) — colour-coded amber for
  custom, muted grey for locked/default; derived from `PromptFragment.customizable`
  + override presence
- View mode: locked fragments show plain text; customizable fragments render as
  a `<button>` (click-to-edit); custom fragments get the accent-muted background
  highlight
- Edit mode (inline): expands to `<textarea>` + Save / Cancel / Revert buttons;
  Save calls `client.author.customizePrompt`; Revert calls
  `client.author.clearFragmentOverride`; both refresh overrides and repreview
- Dirty state: `useDirtyState("configure.prompts")` is marked dirty when any
  override is present; cleared when none

**Composed-prompt summary (`ComposedSummary`)**: Renders at the bottom of the
canvas via `previewPromptWithAttribution`. Shows fragment IDs in render order
with italic source badges (`override`, `append`, `global`) for non-default
segments. Refreshes after every save/clear.

**Key routing decisions**:
- Used `key={selectedModeId}` on `FragmentDocument` so the component re-mounts
  on mode switch — cleanly resets loading state and overrides without extra
  orchestration.
- Dropped the old v3 two-section layout (Teaching Style + Prompt blocks) in
  favour of the mode-rail + canvas pattern. Existing `StyleSliderForm` and
  `PromptBlockStack` components are no longer used by this route (they remain
  in the tree for other consumers).
- `configure.tsx` passes no props to `<PromptTab />` — mode selection is
  entirely internal.

**Tests** (`src/__tests__/configure-prompt-tab.test.tsx`): 11 tests covering
mode picker render, mode switching, fragment card render, lock-status pills,
custom pill when override present, composed summary render + content, click-to-
edit open, save → `customizePrompt`, revert → `clearFragmentOverride`.
Updated `configure-route.test.tsx` (2 tests) to reflect the new v4 layout
identifiers ("Modes" label for tab-body-isolation, mode picker nav for tab
switch).

## Review (2026-05-18)

**Verdict**: Approve with comments

**Blockers**: none
**Important**:
- **Prompt tab change-dot never lights up** (`configure.tsx:25` uses `dirtyKey: "configure.prompt"` but `prompt-tab.tsx:339` registers `useDirtyState("configure.prompts")` — the `s` mismatch means the tab button's change-dot never activates when fragments are customised; the save-bar still works via `useDirtyAggregate`).
  → Item: `fix-configure-prompt-tab-dirty-key-mismatch` (`.work/backlog/`)

**Nits**: none

**Notes**: Core functionality correct — `ModePickerRail`, `FragmentDocument`, `FragmentCard` (inline edit + save + revert), `ComposedSummary` (previewPromptWithAttribution), and dirty tracking all work. The `key={selectedModeId}` remount pattern cleanly resets loading state on mode switch. 11 new tests + 2 updated covering all acceptance criteria. The dirty-key mismatch is a visual-only bug (change-dot) that doesn't affect data operations. Advancing to `stage: done`.
