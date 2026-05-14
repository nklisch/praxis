---
id: epic-editorial-polish-pass-prompt-config-redesign
kind: feature
stage: done
tags: [ui, configure, prompt-customization]
parent: epic-editorial-polish-pass
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Prompt config redesign — section reorder + unified block-oriented preview

## Brief

The prompt-editing surface that shipped in `epic-prompt-editing-surface-v2`
(done) has two outstanding polish gaps. **First**, the teaching-style
section — the highest-signal knob users touch — sits at the bottom of
the configurator form, forcing scrolling past less-frequent options to
reach the primary lever. **Second**, the preview surface has too many
parallel shapes: global prompt preview, append preview, composed
preview, full-fragment view. Each has its own layout, they drift out
of sync, and the user has to understand four panels to see one prompt.

This feature delivers a v3-shaped prompt-editing surface. Sections
reorder by **frequency of use** (teaching style to the top, lower-
frequency options below — exact ordering decided at feature-design).
The four preview shapes collapse onto a **single block-oriented view**:
one block per fragment / section, with a single toggle to switch
between "blocks" (each fragment as a discrete editable card) and
"composed" (the assembled output). The global prompt becomes just
another block in the stack — no separate "global" surface. The append
preview reuses the composed-preview path with the appended block
highlighted. Net effect: one canonical surface, with the only axis of
variation being "blocks vs composed."

## Epic context

- Parent epic: `epic-editorial-polish-pass`
- Position in epic: independent — touches the configurator and the
  prompt-editing primitives. Runs in parallel with the other three
  features.

## Scope absorbed from backlog

- `idea-teaching-style-top-of-prompt-config` — reorder configurator
  sections by frequency of use; teaching style to the top.
- `idea-unified-prompt-preview-blocks` — unify global / append /
  composed / full-fragment previews onto one block-oriented view with
  a composed-output toggle.

## Foundation references

- `docs/ARCHITECTURE.md` — prompt composition pipeline; mode +
  pedagogy pack composition
- Prior epic: `epic-prompt-editing-surface-v2` (done) — this is the
  v3 polish on top
- `CLAUDE.md` — patterns `editorial-ui-primitives`,
  `mode-prompt-fragment-composition`

## Anchors (current implementation)

- Configurator route —
  `packages/ui/src/routes/configure/` (the prompt config tab specifically)
- Prompt configurator panel — search for prompt-config / configurator
  components under `packages/ui/src/components/` and the configure
  route directory
- Existing preview components — search for `Preview`, `AppendPreview`,
  `ComposedPreview`, `FullFragmentView` in `packages/ui/src/components/`
- Editorial primitives — `packages/ui/src/components/editorial/`
- Block-oriented UI reference patterns — look at how the existing
  fragment-list renders for shape inspiration

## Pre-design decisions (2026-05-14)

- **Block edit shape**: per-block edit with local save. Each block
  has an Edit button — clicking opens an inline editor for THAT
  block only; Save / Cancel scoped to that block. Other blocks stay
  in view-mode while one is being edited. Matches the
  block-oriented mental model the unified preview introduces.
- **Section ordering driver**: feature-design picks the right
  approach (manual reorder vs. frequency-of-use driven). The brief
  proposes manual ordering with teaching style at the top; the only
  hard requirement is that teaching style ends up above the
  lower-frequency knobs.
- **Preview unification scope**: replace the four parallel preview
  shapes (global / append / composed / full-fragment) with one
  block-oriented view + a single "composed" toggle. The global
  prompt becomes a block in the stack. The append-preview path
  reuses the composed view with the appended block highlighted.

## Design decisions (2026-05-14, autopilot)

- **Section ordering driver**: manual, declarative in `prompt-tab.tsx` JSX.
  No registry — the configurator has exactly 2 top-level sections (Teaching
  Style, Prompt Blocks); declaring their order in JSX is clearer than an
  abstraction. Teaching Style goes first (highest-frequency knob),
  Prompt Blocks second.
- **Block component shape**: extract a `<PromptBlock>` editorial primitive
  that wraps the per-block view-mode → edit-mode → save/cancel lifecycle.
  Reused by global block, every mode-fragment block, and the user-append
  block. The existing `FragmentBlock` collapses into one usage of this
  primitive.
- **Composed-toggle scope**: the toggle is **stack-level**, not per-block.
  `[Blocks | Composed]` flips the entire stack between editable cards and a
  single attributed pane. Per-block Diff (already on FragmentBlock) stays
  as a block-internal affordance.
- **Append-preview path**: reuses the composed view; the existing
  `AttributedPreviewPane`'s `draftAppend` plumbing is already in place. The
  append block in edit-mode passes its in-flight draft to the composed
  view via a `highlightedFragmentId` prop so the segment renders with an
  amber outline.
- **Global prompt promotion**: `GlobalPromptEditor`'s side-by-side
  layout (textarea + small preview) is retired. The global prompt becomes
  a `PromptBlock` at position `user-global` in the stack, edited like any
  other fragment. The dedicated cross-mode preview goes away — composed
  view shows the global segment in-context for the selected mode.

## Architectural choice

**Chosen approach: extract a `PromptBlock` editorial primitive; unify the
stack render path; gate the preview swap on a single toggle.**

Considered alternatives:

1. **Cosmetic reorder + leave four preview shapes** — cheapest, but doesn't
   address the brief's "four parallel shapes" complaint. Punts the polish.
2. **Per-block edit + per-block preview** — every block carries its own
   mini-preview. Maximally decoupled but recreates the "wall of previews"
   problem at the block level. Rejected.
3. **Single stack-level composed toggle** *(chosen)* — one stack, one
   composed pane behind a toggle, blocks share one editorial primitive.
   Minimum surface area for the maximum legibility win.

The chosen approach builds directly on the v2 work: `FragmentBlock`
already has the view→edit→save lifecycle; `AttributedPreviewPane` already
renders attributed composed segments. The redesign is structural unification,
not new infrastructure.

## Implementation Units

### Unit 1: `<PromptBlock>` editorial primitive

**File**: `packages/ui/src/components/prompt-block.tsx` (new)
**Story**: `epic-editorial-polish-pass-prompt-config-redesign-block-primitive`

The block primitive consolidates the view-mode → edit-mode lifecycle that
`FragmentBlock`, `GlobalPromptEditor`, and `ModeAppendEditor` each
re-implement today. Each block represents one logical "slot" in the
composed system prompt: a mode fragment, the user-global, or the
user-append. The block owns its draft state, local Save/Cancel, and
edit-mode entry; the parent stack owns the list and the refresh after
mutations.

```typescript
export interface PromptBlockProps {
  /** Stable id; matches PromptFragment.id or the synthetic "user-global"/"user-append" ids. */
  blockId: string;
  /** Display title shown in the block header. */
  title: string;
  /** Position label shown muted in the header (e.g. "preamble", "user-global"). */
  positionLabel: string;
  /** Current persisted text — what view-mode shows and what edit-mode initialises with. */
  currentText: string;
  /**
   * The fragment's unmodified default. Present only for mode fragments — global
   * and append blocks have no notion of a default. Drives the per-block Diff
   * affordance and the "Return to default" button.
   */
  defaultText?: string;
  /** True when an override / non-empty user value is stored. Drives the "Edited" badge. */
  hasOverride: boolean;
  /** Whether the block accepts edits at the data layer (PromptFragment.customizable). */
  customizable: boolean;
  /** True when the configurator lock is active (forces read-only). */
  locked: boolean;
  /** Called when the user saves a new value. Returns when the IPC completes. */
  onSave: (text: string) => Promise<void>;
  /** Called when the user clears the override (only for blocks with defaultText). */
  onReturnToDefault?: () => Promise<void>;
  /**
   * Called whenever the in-flight draft changes during edit-mode. Lets the
   * parent stack feed the draft into composed-view highlighting / preview
   * IPC. Fires on every keystroke; debouncing happens upstream.
   */
  onDraftChange?: (draft: string | null) => void;
}

export function PromptBlock(props: PromptBlockProps): JSX.Element;
```

**Implementation notes**:
- Internal state: `editing: boolean`, `draft: string`. Defaults: `editing=false`,
  `draft=currentText`. Entering edit-mode snapshots `currentText` into `draft`.
- Header layout (editorial — `composes: editorial from global;` for `title`):
  `[title]   [Position chip]   [Edited badge]   [Locked badge]   [Edit | Diff]`
  In edit-mode, the `Edit` button is replaced by `Save / Cancel`.
- Lock semantics: `locked || !customizable` → view-mode only, Edit hidden.
- Diff affordance: only when `defaultText` is set and `customizable`. Toggles
  a 2-column read-only diff below the editor, mirroring the existing
  `FragmentBlock` diff render.
- "Return to default" button: shown when `hasOverride && customizable && !locked`
  in view-mode. Calls `onReturnToDefault`.
- `onDraftChange` fires on every keystroke with the current draft text;
  fires with `null` when the user cancels or saves. The parent uses this to
  pipe the in-flight draft into composed-view highlighting (only meaningful
  for the user-append block today, but the primitive doesn't care which block
  is in flight).

**Acceptance criteria**:
- [ ] View-mode renders `currentText` in a `<pre>` with the editorial header.
- [ ] Clicking Edit swaps into edit-mode; Save persists; Cancel reverts draft.
- [ ] Only one block is in edit-mode at a time per stack (parent enforces;
      primitive accepts).
- [ ] When `locked || !customizable`, Edit button is not rendered.
- [ ] `onDraftChange` fires with each keystroke in edit-mode and with `null`
      on save / cancel.
- [ ] Per-block Diff toggle is gated on `defaultText !== undefined && customizable`.
- [ ] "Edited" badge appears iff `hasOverride === true`.
- [ ] Unit tests cover all three display modes (editable, locked, non-customizable)
      and the edit lifecycle.

---

### Unit 2: `<PromptBlockStack>` — unified preview replacement

**File**: `packages/ui/src/components/prompt-block-stack.tsx` (new)
**Story**: `epic-editorial-polish-pass-prompt-config-redesign-stack-and-preview`

The stack is the single rendering surface that replaces all four parallel
preview shapes (global / append / composed / full-fragment). It owns the
mode picker, the assembled list of blocks in render order, the
stack-level `[Blocks | Composed]` toggle, and the IPC wiring for refresh
after mutations. The `AttributedPreviewPane` is reused unchanged for the
"composed" view.

```typescript
export interface PromptBlockStackProps {
  modeId: string;
  onModeChange: (modeId: string) => void;
}

export function PromptBlockStack(props: PromptBlockStackProps): JSX.Element;

// Internal view model — not exported.
type StackView = "blocks" | "composed";

interface AssembledBlock {
  blockId: string;
  title: string;
  positionLabel: PromptFragmentPosition;
  currentText: string;
  defaultText?: string;
  hasOverride: boolean;
  customizable: boolean;
  /** Which IPC action handles save for this block (fragment / global / append). */
  saveAction: "fragment" | "global" | "append";
}
```

**Assembly logic** (the trickiest unit — designed first):

The stack must produce a single ordered list of `AssembledBlock` instances
that matches `FRAGMENT_ORDER`. Three sources:

1. **Mode fragments** at positions `preamble / role / principles / tools /
   context / constraints / postamble` — pulled from `requireMode(modeId).promptFragments`,
   overrides loaded via `useFragmentOverrides`. `saveAction: "fragment"`.
2. **Global block** at position `user-global` — singleton synthetic block.
   `currentText` is the stored global prompt (loaded via
   `client.author.getGlobalPrompt()`). `saveAction: "global"`. No `defaultText`
   (the default is empty). `hasOverride: currentText !== ""`.
3. **Append block** at position `user-append` — singleton synthetic block,
   per-mode. `currentText` is the stored per-mode append (loaded via
   `client.author.getModeAppend(modeId)`). `saveAction: "append"`. No
   `defaultText`. `hasOverride: currentText !== ""`.

Sort by `FRAGMENT_ORDER.indexOf(positionLabel)`. The result is the same
order `composeSystemPromptWithAttribution` produces — so Blocks-view and
Composed-view are positionally aligned 1:1.

**Save dispatch**:
```typescript
async function dispatchSave(block: AssembledBlock, text: string): Promise<void> {
  switch (block.saveAction) {
    case "fragment":
      await client.author.customizePrompt(modeId, block.blockId, text);
      await overrides.refresh();
      return;
    case "global":
      await client.author.setGlobalPrompt(text.trim() === "" ? null : text);
      await refreshGlobal();
      return;
    case "append":
      await client.author.setModeAppend({ modeId, text: text.trim() === "" ? null : text });
      await refreshAppend();
      return;
  }
}
```

**Toggle UX**:
- `[Blocks | Composed]` toggle (segmented control, same editorial pattern as
  the current `previewToggleRow`).
- Blocks view: vertical stack of `<PromptBlock>` components.
- Composed view: a single `<AttributedPreviewPane modeId={modeId} view="composed"
  draftGlobal={appendOrGlobalDraft} draftAppend={appendDraft} />`.
- When a user is editing the append block and switches to Composed, the
  in-flight `draftAppend` flows in and the user-append segment renders with
  amber attribution (already the existing diff colour). No new attribution
  source needed.

**Editing exclusivity**: only one block can be in edit-mode at a time.
Stack tracks `editingBlockId: string | null` and passes `editing` props
down. Attempting to edit while another block is dirty either: (a) prompts
"discard changes?" via `window.confirm` (matches existing ModeAppendEditor
pattern), or (b) silently locks the Edit button on other blocks while one
is open. Picked **(b)** — less disruptive; user must explicitly Cancel or
Save to switch.

**Implementation notes**:
- Mode picker stays as it is today (top of the section) — the picker drives
  both the mode-fragment loading and the append-block loading.
- Block-position-label uses `PromptFragmentPosition` directly. Display
  strings: keep raw position name in a muted mono chip (matches today's
  fragment header).
- Title strings:
  - Mode fragments: `fragment.id` (matches today's FragmentBlock title).
  - Global: `"Global prompt"` (constant via COPY).
  - Append: `` `${modeId} append` `` (constant function via COPY).
- Loading: stack renders `<LoadingState />` until all three sources have
  resolved on first render.

**Acceptance criteria**:
- [ ] Stack assembles all mode fragments + the global block + the append block
      into a single list sorted by `FRAGMENT_ORDER`.
- [ ] Save dispatch routes to the correct IPC call per block type.
- [ ] Stack toggle flips between Blocks view (PromptBlock list) and Composed
      view (AttributedPreviewPane).
- [ ] When the append block is in edit-mode, its draft is passed into the
      composed view's `draftAppend` prop so toggling shows the in-flight text.
- [ ] When the global block is in edit-mode, its draft is passed into
      `draftGlobal` likewise.
- [ ] Only one block is in edit-mode at a time; other blocks' Edit buttons
      are disabled while one is open.
- [ ] Mode picker change reloads the per-mode append and the per-mode
      override list, but the global block's text is preserved across mode
      changes.
- [ ] Unit tests cover assembly order, save dispatch routing, the edit
      exclusivity rule, and the toggle.

---

### Unit 3: PromptTab integration — section reorder + retirement of legacy editors

**File**: `packages/ui/src/routes/configure/prompt-tab.tsx` (modified)
**Story**: `epic-editorial-polish-pass-prompt-config-redesign-tab-integration`

Replaces the five-section layout with two ordered sections:

```typescript
export function PromptTab() {
  const [modeId, setModeId] = useState<string>(DEFAULT_MODE_ID);

  return (
    <div className={styles.layout}>
      {/* ── 1. Teaching style — primary knob, top of the page ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{COPY.prompt.styleSectionTitle}</h2>
        <p className={styles.sectionDesc}>{COPY.prompt.styleSectionDesc}</p>
        <StyleSliderForm />
      </section>

      {/* ── 2. Prompt blocks — unified surface with Blocks/Composed toggle ── */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{COPY.prompt.blocksSectionTitle}</h2>
        <p className={styles.sectionDesc}>{COPY.prompt.blocksSectionDesc}</p>
        <PromptBlockStack modeId={modeId} onModeChange={setModeId} />
      </section>
    </div>
  );
}
```

**Deletions**:
- `<GlobalPromptEditor>` — retired. Its IPC calls (`getGlobalPrompt` /
  `setGlobalPrompt`) move into `PromptBlockStack`. The component file and its
  test file are removed.
- `<ModeAppendEditor>` — retired. Same pattern: IPC moves into the stack.
  Component and test files removed.
- `<FragmentBlock>` — retired. Replaced by `<PromptBlock>` driven by the
  stack's assembly logic. Component and test files removed.
- `<PromptPreviewPane>` (the pre-attribution preview pane used by the
  retired editors) — retired. The attributed pane is the single preview
  surface. Component and test files removed.
- The internal `<FragmentStack>` and `<PromptPreviewWithToggle>` components
  inside `prompt-tab.tsx` — folded into `PromptBlockStack`.

**COPY changes** (in `packages/ui/src/lib/copy.ts`):
- Add `blocksSectionTitle`, `blocksSectionDesc`.
- Add `blockGlobalTitle`, `blockAppendTitleFor(modeId: string): string`.
- Add `stackToggleBlocks` / `stackToggleComposed`.
- Drop now-unused keys: `globalSectionTitle`, `globalSectionDesc`,
  `modePickerLabel`, `fragmentSectionTitle`, `fragmentSectionDesc`,
  `previewSectionTitle`, `previewSectionDesc`, `previewToggleComposed`,
  `previewToggleDiff` (the toggle keys move to stack-level under new names).

**Implementation notes**:
- The `<FragmentStack>` inline component in the current `prompt-tab.tsx` is
  what `PromptBlockStack` replaces — same role, broader scope.
- Single-pass migration: do not keep the old editors behind a flag. The
  three retired component files and their tests are deleted in this story's
  commit.

**Acceptance criteria**:
- [ ] `prompt-tab.tsx` renders exactly two sections, in order: Teaching Style,
      then Prompt blocks.
- [ ] `GlobalPromptEditor`, `ModeAppendEditor`, `FragmentBlock`, and
      `PromptPreviewPane` files are removed.
- [ ] All tests in `__tests__/{global-prompt-editor,mode-append-editor,
      fragment-block}.test.tsx` are deleted; equivalent coverage is added to
      `prompt-block.test.tsx` and `prompt-block-stack.test.tsx`.
- [ ] `attributed-preview-pane.tsx` is unchanged (still the composed-view
      renderer); its tests still pass.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` are green.
- [ ] Manual smoke (out of scope for the test plan but documented in the
      story): edit a fragment → see Edited badge → toggle Composed → see
      override segment highlighted; edit append → toggle Composed → see
      append segment with in-flight draft.

## Implementation Order

1. **Unit 1: PromptBlock primitive** — no dependencies. Pure presentational
   primitive with internal state.
2. **Unit 2: PromptBlockStack** — depends on Unit 1. Owns assembly, IPC
   dispatch, mode picker, and the Blocks/Composed toggle.
3. **Unit 3: PromptTab integration + deletion of legacy editors** — depends
   on Unit 2. The section reorder happens here; once the stack exists, the
   old editors are deleted in one commit.

Each unit is one story. Total: 3 child stories.

## Testing

### Unit tests

- `packages/ui/src/components/__tests__/prompt-block.test.tsx`:
  - view-mode renders currentText
  - clicking Edit enters edit-mode; Save calls `onSave(draft)`; Cancel reverts
  - `onDraftChange` fires on keystroke and with `null` on save/cancel
  - locked / non-customizable → Edit button absent
  - Edited badge appears iff `hasOverride === true`
  - Diff toggle visible iff `defaultText && customizable`
  - "Return to default" calls `onReturnToDefault` when present

- `packages/ui/src/components/__tests__/prompt-block-stack.test.tsx`:
  - block list order matches `FRAGMENT_ORDER`
  - global block + append block appear at the correct positions
  - save dispatch routes to the right IPC method per `saveAction`
  - editing exclusivity: opening one block disables Edit on others
  - Composed-view toggle calls the attributed preview with the right
    `draftGlobal` / `draftAppend` while a block is in edit-mode
  - mode-picker change refetches append + overrides; global is preserved

- `packages/ui/src/routes/configure/__tests__/prompt-tab.test.tsx`
  (extend existing test or create):
  - exactly two sections render
  - Teaching Style renders before Prompt blocks (DOM order assertion)

### Integration

- The stack's `AttributedPreviewPane` integration is covered transitively by
  the existing attributed-preview tests — no new integration tests needed.

### Test data

- `makeFakeClient(overrides?)` from the existing UI test helper covers the
  three IPC paths the stack uses. Add fake-client overrides for
  `getGlobalPrompt`, `getModeAppend`, and the corresponding setters as needed.

## Risks

- **Cross-cutting deletion**: this feature deletes 4 components and 4
  test files. If a downstream consumer imports `GlobalPromptEditor`,
  `ModeAppendEditor`, `FragmentBlock`, or `PromptPreviewPane` from
  outside `prompt-tab.tsx`, the build breaks. Mitigation: a `grep -r`
  for each import name during Story 3; the design assumes prompt-tab is
  the only consumer (verified — no other imports found in the
  `find ... -name "*prompt*"` survey during design).
- **Edit-mode exclusivity surprise**: with N blocks, the "only one editing
  at a time" rule may feel restrictive if a teacher wants to compare two
  drafts. Mitigation: the Composed toggle is the comparison affordance,
  not parallel edit. If the constraint bites in practice, revisit by
  allowing N concurrent drafts in the stack-level state — non-breaking
  change to PromptBlock's API.
- **COPY key removal**: dropping keys from `COPY.prompt.*` will break any
  string reference outside the prompt tab. Mitigation: Story 3 audits
  consumers with grep before deletion.

## Review (2026-05-14)

**Verdict**: Approve

All three child stories landed cleanly through per-story review on
2026-05-14:
- block-primitive (already done before this drain)
- stack-and-preview — Approve (11 tests; pure `assembleBlocks` is
  the right testable seam)
- tab-integration — Approve (net deletion of ~2700 lines across 11
  retired files; single-pass migration, no flag)

**Aggregate lenses (epic-style)**:

- **Decomposition realised**: matches the brief. Three-story arc:
  generic `<PromptBlock>` primitive (read/edit/save shape),
  `<PromptBlockStack>` (assembly + dispatch + Blocks/Composed
  toggle), tab integration (two-section v3 layout + retirements).
- **End-to-end capability**: the brief's promise was "consolidate
  the four parallel preview shapes (global / append / composed /
  full-fragment) into a single Blocks-then-Composed surface."
  That holds end-to-end. The four retired components
  (`GlobalPromptEditor`, `ModeAppendEditor`, `FragmentBlock`,
  `PromptPreviewPane`) are gone; the new stack mounts inside a
  two-section prompt tab (Teaching Style → Prompt blocks).
  Composed toggle wires in-flight drafts from the active editing
  block.
- **No foundation-doc drift**. The prompt-fragment-composition
  pattern still drives the assembly order (via `FRAGMENT_ORDER`);
  the editorial-ui-primitives pattern was honoured.

**Children**: 3/3 done. Ready to advance.
