---
id: epic-prompt-editing-surface-v2-unified-configure-surface
kind: feature
stage: implementing
tags: [ui, configure, prompt-customization]
parent: epic-prompt-editing-surface-v2
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Unified prompt-customization surface in Configure

## Brief

Today the three customization layers live in three different places: global
fragment under Settings (`packages/ui/src/routes/settings.tsx:3` mounts
`GlobalPromptEditor`), per-mode append under
`packages/ui/src/routes/configure/prompt-tab.tsx`, and per-fragment override
under the same tab in a separate section. The user has to navigate between
two top-level screens to see one consistent mental model. The editor column
is also narrower than the surrounding editorial layout.

This feature replaces the three scattered editors with one coherent prompt-
customization screen in the Configure prompt tab, hosting all three layers
(global / per-mode append / per-fragment override) as sibling layers in one
view, and unmounts the Settings global-prompt entry point. Settings is
reserved for app-level concerns (engines, keys, theme). The new screen uses
the full editorial-column width so long fragment templates aren't forced to
wrap unnecessarily.

This feature lands the **container** — it can ship with today's editor
internals slotted into the new layout. The redesigned fragment view and
diff-aware preview are separate child features that consume this container.

## Epic context

- Parent epic: `epic-prompt-editing-surface-v2`
- Position in epic: **container feature** — `full-fragment-view` and
  `diff-aware-preview` depend on this for their host screen. Can land in
  parallel with `compose-attribution`.

## Foundation references

- `docs/ARCHITECTURE.md:353` — "Prompt customization — knobs for teaching
  style, persona, mode-prompt overrides. Surfaces the prompt-composition
  system as a config UI." This feature is the realization of that surface.

## Anchors

- Configure prompt tab — `packages/ui/src/routes/configure/prompt-tab.tsx`
  (currently has three sections: Per-mode append, Teaching Style sliders,
  Prompt Fragment Overrides)
- Settings route (relocate global out of here) —
  `packages/ui/src/routes/settings.tsx:3` (mounts `GlobalPromptEditor`)
- Editor components (kept, re-hosted) —
  `packages/ui/src/components/{global-prompt-editor,mode-append-editor,prompt-fragment-editor,prompt-preview-pane}.tsx`
- Editorial primitives — see `editorial-ui-primitives` pattern (RouteHeader,
  LibrarySection, EmptyState, COPY module, `composes: editorial from
  global;`)
- Existing tests: `packages/ui/src/__tests__/configure-prompt-tab.test.tsx`,
  `packages/ui/src/components/__tests__/global-prompt-editor.test.tsx`

## Layout (already resolved at epic-design)

The chosen surface shape:

```
┌───────────────────────────────────────────────┐
│ Global Fragment (applies to all modes)        │
│ [editor]                                      │
└───────────────────────────────────────────────┘

Mode: [Teach ▼]   ← single mode picker drives the rest

┌─ preamble (locked) ──────────────────────────┐
│ [default text rendered read-only]             │
└───────────────────────────────────────────────┘
… more fragment blocks in FRAGMENT_ORDER …
┌─ user-append ──────[return to default] [diff]┐
│ [per-mode append editor]                      │
└───────────────────────────────────────────────┘

[Composed | Diff] preview toggle ──────────────
```

## Design decisions (resolved by autopilot)

- **Settings route**: keeps the engine config + lock controls; **removes**
  the `GlobalPromptEditor` mount and its imports. The `GlobalPromptEditor`
  component itself is kept (re-used in the new screen).
- **Mode picker placement**: top of the screen, below the global editor.
  Drives the active mode for everything below (the fragment blocks +
  per-mode append).
- **Mode picker source**: enumerate from the curriculum mode registry
  (`requireMode` / a new `listModes()` export). Hardcoded list rejected —
  would drift from `ModeMeta` and `Mode.displayName` (the tab-rename
  feature's new SSOT).
- **Fragment blocks within this feature**: render placeholders (one block
  per fragment in `FRAGMENT_ORDER`, showing fragment name + a "TODO: full
  view in wave-2" message) for locked fragments, AND host the existing
  `PromptFragmentEditor` for the currently-supported override slots.
  The `full-fragment-view` wave-2 feature replaces these placeholders
  with rich blocks that include return-to-default + per-block diff.
- **Preview pane in this feature**: shows the composed string via the
  existing `previewPrompt` IPC channel. A `[Composed | Diff]` toggle is
  RENDERED but Diff is disabled with a "coming in v2" tooltip until
  `diff-aware-preview` (wave-2) ships. This keeps the UX shell complete
  while letting the diff renderer land independently.
- **Per-mode append**: integrated as the block at the `user-append`
  position in the fragment stack. Visually consistent with other blocks.
- **Style sliders**: kept in the same screen as a separate section below
  the fragment stack — they're a different concern from prompt
  customization (they affect generation behavior, not the system
  prompt). Don't merge them into the fragment view.
- **Full-width layout**: replace today's narrow content column with the
  full editorial column width. Per the `editorial-ui-primitives`
  pattern, use `RouteHeader` + section primitives consistently.
- **Backward compat**: `GlobalPromptEditor` may still be imported by
  the Settings route during the transition — after this feature lands,
  Settings no longer references it. Component itself stays available
  for re-use under the new screen.
- **Configurator lock**: today's lock semantics still apply
  (lock-button-no-op gets addressed in `full-fragment-view`'s wiring
  fix; this container respects existing locks for global and append
  editors, and the new mode-picker is enabled regardless of lock —
  picking a mode to read its config is fine even when authoring is
  locked).

## Architectural choice

**Compose the new screen out of existing components.** The
`GlobalPromptEditor`, `ModeAppendEditor`, `PromptFragmentEditor`, and
`PromptPreviewPane` components are kept and re-hosted. A new mode picker
and the visual shell are the only new pieces. This minimizes risk —
existing editor behavior is unchanged; the surface is what changes.

Two alternatives rejected:
- *Rewrite all editors as fragment blocks.* That's `full-fragment-view`'s
  job; doing it here mixes concerns and prevents parallel landing of the
  two features.
- *Single mega-component for the whole prompt screen.* Premature; the
  current decomposition is healthy and lets each layer be tested in
  isolation.

## Implementation Units

### Unit 1: Mode listing helper

**File**: `packages/curriculum/src/modes/index.ts` (extend, not create)

Export a `listModes(): Mode[]` helper:

```typescript
import { teachMode } from "./teach.js";
import { bootstrapMode } from "./bootstrap.js";
// … all mode imports …

const ALL_MODES: ReadonlyArray<Mode> = [
  teachMode, bootstrapMode, quizMode, homeworkMode, examMode,
  configureMode, studySkillsMode,
];

export function listModes(): ReadonlyArray<Mode> {
  return ALL_MODES;
}
```

Likely there's already a registry — verify and extend rather than
duplicating. If `requireMode(id)` is implemented via a Map, expose
`listModes()` returning all values.

**Acceptance Criteria**:
- [ ] `listModes()` returns every registered mode in a stable order.
- [ ] Used by the new mode picker in Unit 3.

---

### Unit 2: Settings route — remove global prompt editor

**File**: `packages/ui/src/routes/settings.tsx`

Remove:
- `import { GlobalPromptEditor } from "../components/global-prompt-editor.js";`
  (line 3)
- The JSX that renders `<GlobalPromptEditor />` (find it in the
  current Settings layout).

Keep engine config + any lock-control UI.

**Acceptance Criteria**:
- [ ] Settings no longer renders `GlobalPromptEditor`.
- [ ] Settings still functions for engine selection.
- [ ] No broken imports.

---

### Unit 3: New unified prompt tab

**File**: `packages/ui/src/routes/configure/prompt-tab.tsx` (replace
existing content)

Top-level structure:

```typescript
export function PromptTab() {
  const [modeId, setModeId] = useState<string>("teach");  // default mode

  return (
    <div className={styles.editorial}>
      {/* Global section — applies cross-mode */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Global Fragment</h2>
        <p className={styles.sectionDesc}>
          Applies to all modes. Injected at the user-global position
          before the per-mode append.
        </p>
        <GlobalPromptEditor />
      </section>

      {/* Mode picker — drives everything below */}
      <section className={styles.modePicker}>
        <label htmlFor="prompt-mode-picker">Mode:</label>
        <select
          id="prompt-mode-picker"
          value={modeId}
          onChange={(e) => setModeId(e.target.value)}
        >
          {listModes().map((m) => (
            <option key={m.id} value={m.id}>{m.displayName ?? m.label}</option>
          ))}
        </select>
      </section>

      {/* Fragment stack for the selected mode */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Prompt Fragments</h2>
        <FragmentStack modeId={modeId} />
      </section>

      {/* Preview pane */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Preview</h2>
        <PromptPreviewWithToggle modeId={modeId} />
      </section>

      {/* Style sliders — separate concern, kept below */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Teaching Style</h2>
        <StyleSliderForm />
      </section>
    </div>
  );
}
```

Two new internal components in this file (or split to siblings during
impl):

- `<FragmentStack modeId={modeId} />` — renders every fragment in
  `FRAGMENT_ORDER` for the mode, using the existing
  `PromptFragmentEditor` for customizable slots and a read-only block
  for locked ones. The `user-append` slot renders the existing
  `<ModeAppendEditor modeId={modeId} />` so the per-mode append
  integrates as a block (visually consistent with other blocks).
- `<PromptPreviewWithToggle modeId={modeId} />` — renders the existing
  `<PromptPreviewPane />` plus a `[Composed | Diff]` toggle. Diff is
  disabled with a "coming soon" tooltip until `diff-aware-preview`
  lands.

**Implementation Notes**:
- The mode picker default is `"teach"` — most-common mode. Could be
  persisted in localStorage; v1 ships with hardcoded default.
- `FragmentStack` reads `requireMode(modeId).promptFragments` to know
  what fragments the active mode has. For each fragment, it renders
  a block:
  - If `fragment.customizable === true`: render with
    `<PromptFragmentEditor initialModeId={modeId} initialFragmentId={fragment.id} />`
    inside (existing component, reused).
  - If `fragment.customizable === false`: render the fragment's
    default `template` inside a read-only block with a "Locked"
    label.
- `PromptFragmentEditor`'s `initialModeId` / `initialFragmentId`
  props (already present) let it focus on a specific fragment
  inside its own internal selector. The new container effectively
  collapses its internal selector by passing both initial values.
- Editorial primitives: `composes: editorial from global;` on the
  outer wrapper; section primitives like `LibrarySection` (or the
  CSS-only equivalent) for visual rhythm.

**Acceptance Criteria**:
- [ ] One screen hosts all three customization layers + a mode picker
      + a preview.
- [ ] Mode picker switches the displayed fragment stack and the
      preview's active mode.
- [ ] Existing editor behavior unchanged (saves still persist via the
      same IPC channels).
- [ ] Composed toggle works; Diff is rendered as disabled with a
      tooltip.

---

### Unit 4: Layout / editorial-width

**File**: `packages/ui/src/routes/configure/prompt-tab.module.css`
(replace or extend the current narrow layout)

Update:
- Outer wrapper uses the full editorial column width (composes
  `editorial` from global, matching other Configure routes).
- Section blocks have consistent vertical rhythm.
- Mode picker `<section>` is visually a single-row sticky-ish
  control (doesn't need to actually stick; just visually compact).
- The preview pane uses the full available width below the
  fragment stack.

Don't redesign individual editor components — they keep their own
styles. The container CSS just frames them.

**Acceptance Criteria**:
- [ ] No constrained-narrow column; text editors get the full
      available editorial width.
- [ ] Consistent visual rhythm with other Configure routes.

---

### Unit 5: COPY strings

**File**: `packages/ui/src/lib/copy.ts`

Add COPY constants for the new section titles and descriptions if
the project follows the COPY-module pattern. Examples:

```typescript
export const COPY = {
  // …
  prompt: {
    globalSectionTitle: "Global Fragment",
    globalSectionDesc: "Applies to all modes…",
    modePickerLabel: "Mode:",
    fragmentSectionTitle: "Prompt Fragments",
    previewSectionTitle: "Preview",
    diffToggleDisabledTooltip: "Diff view coming in the next release.",
    // …
  },
};
```

Reference from the tab component.

**Acceptance Criteria**:
- [ ] No string literals in the JSX where the COPY pattern is used
      elsewhere in the file.

---

### Unit 6: Tests

**File**: `packages/ui/src/__tests__/configure-prompt-tab.test.tsx`
(extend; existing tests assert on the old three-section layout — they
update to match the new structure)

Test cases:
- Renders the global section, the mode picker, the fragment stack,
  the preview, and the style sliders.
- Mode picker change updates the fragment stack content.
- Saving a fragment override via the embedded `PromptFragmentEditor`
  still works (mock the IPC).
- Saving the per-mode append still works.
- Saving the global fragment still works (the editor moved from
  Settings to here).
- The Diff toggle is rendered as disabled.

**File**: `packages/ui/src/__tests__/settings.test.tsx` (if exists)

- Verify Settings no longer renders `GlobalPromptEditor` (the import
  is gone; the JSX doesn't include it).

**Acceptance Criteria**:
- [ ] Updated existing tests pass.
- [ ] New tests pass.

---

## Implementation Order

Single-stride. No child stories — UI restructure cohesive in one
package. Suggested intra-stride order:

1. Unit 1 (`listModes()` helper).
2. Unit 2 (Settings cleanup).
3. Unit 3 (new prompt-tab.tsx with mode picker + FragmentStack +
   preview).
4. Unit 4 (CSS).
5. Unit 5 (COPY strings).
6. Unit 6 (tests, run continuously).

## Testing

Covered in Unit 6. Critical: existing IPC channels and persistence
behavior must not regress — the new screen is a re-host, not a
rewrite of the editor logic.

## Risks

1. **Test breakage from layout change** (medium). The existing
   `configure-prompt-tab.test.tsx` asserts on the three-section
   layout. Tests update mechanically to the new structure; not a
   semantic regression.
2. **Mode picker default UX** (low). Defaulting to `"teach"` is
   reasonable for v1; if user feedback shows they want their last
   selection remembered, add localStorage persistence in a follow-up.
3. **FragmentStack rendering placeholder** (low). For non-customizable
   fragments, the read-only block shows the default template. If a
   default template is long, the page can get tall. Acceptable for v1;
   `full-fragment-view` adds collapse/expand controls later.
4. **PromptFragmentEditor's internal selector clash** (low). The
   existing component has its own mode + fragment selector inside.
   When hosted inside `FragmentStack`, we pass both `initialModeId`
   and `initialFragmentId` to focus it on a single fragment — the
   internal selector is still visible (could be confusing). v1
   acceptable; `full-fragment-view` replaces this component entirely
   with a clean per-block editor.
5. **Settings route removal of imports** (low). Mechanical;
   typecheck flags any missed reference.
