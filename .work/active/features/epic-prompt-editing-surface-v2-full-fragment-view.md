---
id: epic-prompt-editing-surface-v2-full-fragment-view
kind: feature
stage: done
tags: [ui, configure, prompt-customization]
parent: epic-prompt-editing-surface-v2
depends_on: [epic-prompt-editing-surface-v2-unified-configure-surface]
release_binding: v0.1.2
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Full fragment view with locks, badges, and configurator lock fix

## Brief

The fragment override editor today (`prompt-fragment-editor.tsx:9-41`) ships a
hardcoded `CUSTOMIZABLE_FRAGMENTS` list — only those appear in the dropdown.
Non-customizable fragments (preamble, role, tools, postamble, etc.) are
completely invisible, so the user can't tell whether a missing fragment is
"doesn't exist" or "you can't touch it." Active overrides aren't badged
either: the user has to pick each fragment to find out which ones they've
already changed. And the configurator lock affordance is asymmetric — global
and append editors honor the lock (read-only when locked) but the fragment
editor has no lock check at all (`prompt-fragment-editor.tsx:54-185`), which
is the source of the "lock button does nothing" bug reported against the
prompt surface.

This feature redesigns the fragment view to:
- Render **every** fragment in the active mode (driven by the mode's
  `PromptFragment[]` and `FRAGMENT_ORDER`, not the hardcoded list) as a
  block in the unified surface.
- Mark non-customizable fragments visibly locked (read-only with their
  default text shown) so the user sees the full shape of the composed
  prompt without being able to break invariants `composeSystemPrompt`
  already protects (`compose.ts:54-60`).
- Badge fragments that currently have a stored override.
- Per-block "return to default" button that clears the override for that
  fragment (calls `clearFragmentOverride`).
- Per-block "diff view" button — drills down to show that single
  fragment's default vs. override (the global Composed | Diff toggle is
  handled by `diff-aware-preview`).
- Honor the **configurator lock** — Praxis's parent/child safety
  mechanism that restricts the configurator surface to a sub-set when
  engaged. When the lock is on, the fragment editor goes read-only,
  consistent with the global and append editors. Fixes the
  lock-button-no-op bug by making the fragment editor honor the same
  lock everything else honors.

## Epic context

- Parent epic: `epic-prompt-editing-surface-v2`
- Position in epic: consumer of the unified surface; runs in parallel with
  `diff-aware-preview` in wave 2.

## Foundation references

- `docs/ARCHITECTURE.md:353` — "Prompt customization … config UI"

## Anchors

- Current editor (to replace) —
  `packages/ui/src/components/prompt-fragment-editor.tsx`
- Hardcoded customizable list (to remove) —
  `prompt-fragment-editor.tsx:9-41`
- Source of truth for which fragments are customizable —
  `PromptFragment.customizable: boolean` in
  `packages/core/src/types/mode.ts:29-34`
- Override list — `listFragmentOverrides(modeId)` in
  `packages/core/src/services/prompt-customization-service.ts:145-151`
- Lock pattern to mirror — `global-prompt-editor.tsx:23,33,102-103` and
  `mode-append-editor.tsx:34,44,128-132,150-151`
- Existing test — `packages/ui/src/__tests__/prompt-fragment-editor.test.tsx`

## Architectural choice

**Rebuild `<PromptFragmentEditor>` and the `<FragmentStack>` scaffold from `unified-configure-surface` into a single rich per-block view driven by `PromptFragment.customizable`, with built-in lock honoring.** The hardcoded `CUSTOMIZABLE_FRAGMENTS` list goes away. The unified-surface's `<FragmentStack>` currently slots `<PromptFragmentEditor>` into customizable positions and renders inert read-only blocks for locked positions; this feature replaces both with a single `<FragmentBlock>` that renders both states correctly.

Two alternatives rejected:
- *Keep `<PromptFragmentEditor>` and just unlock the hardcoded list.* Treats the symptom (locked fragments invisible) but leaves the structural asymmetry (per-mode hardcoded list drifts from `PromptFragment.customizable`). The next mode that adds a customizable fragment would silently disappear.
- *Server-side authoritative customizability check + client trusts every list.* Adds a roundtrip for what's already in the in-memory mode definition; `PromptFragment.customizable` is the SSOT — client just reads it.

## Design decisions (resolved by autopilot)

- **Driver of which fragments render**: `requireMode(modeId).promptFragments` enumerated in `FRAGMENT_ORDER`. Every fragment renders as a block — customizable or not. No hardcoded list anywhere.
- **Per-block UI for customizable + unlocked**: editable textarea pre-filled with the current override (or default if no override), Save / Cancel buttons; "Return to default" button (calls `clearFragmentOverride`); "Diff" button toggles per-block default-vs-current inline view; "Edited" badge when an override is stored.
- **Per-block UI for non-customizable**: read-only `<pre>` showing the default template; "Locked" label/badge; no edit affordances. Per-block "Diff" button is hidden (there's nothing to diff).
- **Per-block UI for customizable + locked (configurator engaged)**: same as non-customizable PLUS a hint indicating the lock is on. "Return to default" is also disabled while locked.
- **Lock signal**: `useLock()` hook (existing, used by `<GlobalPromptEditor>` and `<ModeAppendEditor>` per anchors). The lock applies uniformly to every customizable block — when on, all save/clear/edit affordances disable. Fixes the lock-button-no-op bug.
- **Override badge**: derived from `listFragmentOverrides(modeId)` (existing service method). Block renders the badge when its fragment id appears in the override list.
- **Per-block diff view**: collapsible inline section under the block. Shows two columns: `Default` and `Current` (the override text or the default if no override). Implementation reuses `<ComposedView>` from `diff-aware-preview` if available; otherwise renders the two texts as `<pre>` blocks side-by-side. Lightweight — uses the same source-coded styling vocabulary as `diff-aware-preview` for consistency.
- **Save flow**: per-block "Save" calls `client.author.saveFragmentOverride({ modeId, fragmentId, override })`. "Return to default" calls `clearFragmentOverride({ modeId, fragmentId })`. Both invalidate the override list state so the badge updates.
- **Replacement strategy for `<PromptFragmentEditor>`**: the old component is REMOVED. Its only consumer (the wave-1 `<FragmentStack>` in `prompt-tab.tsx`) is updated to use the new `<FragmentBlock>` directly. `<ModeAppendEditor>` is unaffected — it owns its own block at the `user-append` position and isn't rebuilt here.
- **`<FragmentStack>` simplification**: becomes a thin loop that maps `requireMode(modeId).promptFragments` → `<FragmentBlock>` in `FRAGMENT_ORDER`. The `user-append` position keeps its `<ModeAppendEditor>` mount.
- **Save indication**: "Edited" badge surfaces on the block as soon as the server confirms the save. "Saving…" indicator on the Save button mirrors existing editors' pattern.
- **Editor focus state**: clicking a non-customizable block does nothing (no focus, no edit). Clicking a customizable block focuses the textarea — same UX as existing editors.

## Anchors (verified)

- Current `<PromptFragmentEditor>` — `packages/ui/src/components/prompt-fragment-editor.tsx` (REMOVE)
- Hardcoded list `CUSTOMIZABLE_FRAGMENTS` — `prompt-fragment-editor.tsx:9-41` (DELETED with the file)
- `PromptFragment.customizable` SSOT — `packages/core/src/types/mode.ts:29-34`
- `useLock` hook — `packages/ui/src/hooks/use-lock.ts` (verified import path mirrors existing editors)
- `<FragmentStack>` (target of rewire) — `packages/ui/src/routes/configure/prompt-tab.tsx`
- `PromptCustomizationServiceImpl.listFragmentOverrides` — `packages/core/src/services/prompt-customization-service.ts`
- `client.author.saveFragmentOverride` / `clearFragmentOverride` — `packages/client/src/services/authoring-client.ts` (existing)
- `requireMode` / `FRAGMENT_ORDER` — `packages/curriculum/src/modes/index.ts` and `packages/curriculum/src/brief/compose.ts:35-45`

## Implementation Units

Single-stride. The work is one new component + small wiring update + tests. Cohesive UI change in one package. ~5 files.

### Unit 1: `<FragmentBlock>` component

**File**: `packages/ui/src/components/fragment-block.tsx` (new — replaces what `<PromptFragmentEditor>` used to do)

```typescript
import type { JSX } from "react";
import { useEffect, useState } from "react";
import type { PromptFragment } from "@praxis/core/types";
import { usePraxisClient } from "../context/client-context.js";
import { useLock } from "../hooks/use-lock.js";
import styles from "./fragment-block.module.css";

export interface FragmentBlockProps {
  modeId: string;
  fragment: PromptFragment;        // includes customizable flag and default template
  override: string | null;          // null = no override stored
  onOverrideChange: () => void;     // tells parent to refresh override list
}

export function FragmentBlock(props: FragmentBlockProps): JSX.Element {
  const client = usePraxisClient();
  const { isSet, isUnlocked } = useLock();
  const isLocked = isSet && !isUnlocked;
  const { fragment } = props;

  // Three modes: locked-or-noncustomizable, customizable-and-unlocked, in-edit
  const editable = fragment.customizable && !isLocked;

  const [draft, setDraft] = useState<string>(props.override ?? fragment.template);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  const hasOverride = props.override !== null;

  const save = async () => {
    if (!editable || !dirty || saving) return;
    setSaving(true);
    try {
      await client.author.saveFragmentOverride({
        modeId: props.modeId,
        fragmentId: fragment.id,
        override: draft,
      });
      setDirty(false);
      props.onOverrideChange();
    } finally {
      setSaving(false);
    }
  };

  const returnToDefault = async () => {
    if (!editable) return;
    setSaving(true);
    try {
      await client.author.clearFragmentOverride({
        modeId: props.modeId,
        fragmentId: fragment.id,
      });
      setDraft(fragment.template);
      setDirty(false);
      props.onOverrideChange();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className={styles.block} data-locked={isLocked} data-customizable={fragment.customizable}>
      <header className={styles.header}>
        <h3 className={styles.title}>{fragment.id}</h3>
        <div className={styles.badges}>
          {!fragment.customizable && <span className={styles.lockedBadge}>Locked</span>}
          {hasOverride && <span className={styles.editedBadge}>Edited</span>}
        </div>
        <div className={styles.actions}>
          {fragment.customizable && (
            <button type="button" onClick={() => setShowDiff((v) => !v)}>
              {showDiff ? "Hide diff" : "Diff"}
            </button>
          )}
          {editable && hasOverride && (
            <button type="button" onClick={returnToDefault} disabled={saving}>
              Return to default
            </button>
          )}
        </div>
      </header>

      {editable ? (
        <>
          <textarea
            className={styles.editor}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setDirty(true);
            }}
            disabled={saving}
          />
          <div className={styles.editorActions}>
            <button type="button" onClick={save} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            {dirty && (
              <button type="button" onClick={() => { setDraft(props.override ?? fragment.template); setDirty(false); }}>
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <pre className={styles.readonly}>{props.override ?? fragment.template}</pre>
      )}

      {showDiff && fragment.customizable && (
        <div className={styles.diff}>
          <div className={styles.diffCol}>
            <div className={styles.diffHeader}>Default</div>
            <pre>{fragment.template}</pre>
          </div>
          <div className={styles.diffCol}>
            <div className={styles.diffHeader}>Current</div>
            <pre>{props.override ?? fragment.template}</pre>
          </div>
        </div>
      )}

      {isLocked && fragment.customizable && (
        <p className={styles.lockHint}>Configurator lock is on — unlock to edit.</p>
      )}
    </section>
  );
}
```

**Acceptance Criteria**:
- [ ] Customizable fragment renders editable when lock is off.
- [ ] Non-customizable fragment renders read-only with Locked badge.
- [ ] Customizable + locked: read-only + lock hint visible.
- [ ] "Edited" badge present iff `override !== null`.
- [ ] Save calls `saveFragmentOverride` and triggers `onOverrideChange`.
- [ ] "Return to default" calls `clearFragmentOverride`, clears local draft.
- [ ] Diff button toggles inline default-vs-current side-by-side.
- [ ] When `compose-attribution`'s `SegmentSource` styling exists, the diff section reuses the same `sourceDefault`/`sourceOverride` color vocabulary (cross-feature consistency — verify during impl).

---

### Unit 2: CSS module

**File**: `packages/ui/src/components/fragment-block.module.css` (new)

Standard block styling with locked / edited badge variants, diff column layout, and the existing editorial palette. Reuses the source-coded background tokens defined by `diff-aware-preview` (if landed) for visual consistency.

**Acceptance Criteria**:
- [ ] Locked badge visually distinct from Edited badge.
- [ ] Diff columns side-by-side at full editorial width.
- [ ] Lock hint readable but unobtrusive.

---

### Unit 3: Rewire `<FragmentStack>` in `prompt-tab.tsx`

**File**: `packages/ui/src/routes/configure/prompt-tab.tsx`

Replace the existing `<FragmentStack>` body (currently slots `<PromptFragmentEditor>` for customizable positions and inert blocks for locked) with a loop that maps `requireMode(modeId).promptFragments` → `<FragmentBlock>`:

```typescript
function FragmentStack({ modeId }: { modeId: string }): JSX.Element {
  const mode = requireMode(modeId);
  const sorted = [...mode.promptFragments].sort(
    (a, b) => FRAGMENT_ORDER.indexOf(a.position) - FRAGMENT_ORDER.indexOf(b.position),
  );

  const overrides = useFragmentOverrides(modeId); // existing or new tiny hook
  // refresh callback that re-queries listFragmentOverrides

  return (
    <div className={styles.fragmentStack}>
      {sorted.map((fragment) => (
        <FragmentBlock
          key={fragment.id}
          modeId={modeId}
          fragment={fragment}
          override={overrides.byId.get(fragment.id) ?? null}
          onOverrideChange={overrides.refresh}
        />
      ))}
      {/* user-append slot keeps the existing ModeAppendEditor mount */}
      <ModeAppendEditor modeId={modeId} />
    </div>
  );
}
```

`useFragmentOverrides(modeId)` is a thin `useResource`-style hook returning `{ byId: Map<string,string>, refresh: () => Promise<void> }`. Backed by `client.author.listFragmentOverrides(modeId)` (existing).

**Acceptance Criteria**:
- [ ] Every fragment in the mode renders (no hardcoded gating).
- [ ] Customizable fragments are editable when lock is off.
- [ ] Locked fragments render read-only with the Locked badge.
- [ ] Edited badge tracks the override state correctly.

---

### Unit 4: Delete `<PromptFragmentEditor>` and stale references

**Files**:
- `git rm packages/ui/src/components/prompt-fragment-editor.tsx`
- `git rm packages/ui/src/components/prompt-fragment-editor.module.css`
- `git rm packages/ui/src/components/__tests__/prompt-fragment-editor.test.tsx` (or, if useful, port its assertions into the new test file)

Sweep: `grep -rn "PromptFragmentEditor\|prompt-fragment-editor" packages/` returns no results.

**Acceptance Criteria**:
- [ ] Old component and CSS gone.
- [ ] Old test gone or ported.
- [ ] No surviving imports.

---

### Unit 5: COPY entries

**File**: `packages/ui/src/lib/copy.ts`

Add (or update if placeholders exist):

```typescript
COPY.prompt = {
  // …existing…
  fragmentBlockEditedBadge: "Edited",
  fragmentBlockLockedBadge: "Locked",
  fragmentBlockLockHint: "Configurator lock is on — unlock to edit.",
  fragmentBlockReturnToDefault: "Return to default",
  fragmentBlockDiffShow: "Diff",
  fragmentBlockDiffHide: "Hide diff",
};
```

JSX references the COPY constants.

**Acceptance Criteria**:
- [ ] No string literals in JSX where COPY equivalents exist.

---

### Unit 6: Tests

**File**: `packages/ui/src/components/__tests__/fragment-block.test.tsx` (new)

Test cases:
- Customizable + unlocked: textarea editable; Save calls `saveFragmentOverride`.
- Customizable + locked: textarea is read-only; Save button absent; lock hint visible.
- Non-customizable: pre-rendered text matches `fragment.template`; no Save/Edit affordances.
- Edited badge visible iff `override !== null`.
- "Return to default" calls `clearFragmentOverride` and clears draft.
- Diff toggle reveals/hides the diff section.

**File**: `packages/ui/src/__tests__/configure-prompt-tab.test.tsx`

Update existing tests:
- Every mode fragment renders (count check).
- Locked fragments show the Locked badge.
- Save flow still works (via fake client).
- Configurator lock toggle disables edit affordances across all blocks.

**Acceptance Criteria**:
- [ ] All new tests pass.
- [ ] Existing configure-prompt-tab tests updated and pass.

---

## Implementation Order

Single-stride. Suggested intra-stride order:

1. Unit 1 (`<FragmentBlock>` component)
2. Unit 2 (CSS)
3. Unit 5 (COPY constants)
4. Unit 3 (rewire `<FragmentStack>` to use `<FragmentBlock>`)
5. Unit 4 (delete `<PromptFragmentEditor>` + sweep)
6. Unit 6 (tests, run continuously)

## Testing

Covered by Unit 6. Key invariants:
- Lock is honored uniformly across all customizable blocks.
- Override badges reflect server state.
- Hardcoded `CUSTOMIZABLE_FRAGMENTS` list is gone; visibility is driven by `PromptFragment.customizable`.

## Risks

1. **Lock-button-no-op fix as side effect** (none, intentional). The bug from the parent epic's brief is fixed by mirroring `useLock` from `<GlobalPromptEditor>` / `<ModeAppendEditor>` — same pattern, same hook, same lock state. Smoke test: with the configurator lock engaged, the fragment editor should disable saves. Manual smoke during review.

2. **Cross-feature visual consistency with `diff-aware-preview`** (low). Both features render diff side-by-side using `pre` blocks; both can use the same `sourceDefault` / `sourceOverride` background tokens. If `diff-aware-preview` lands first, this feature's CSS imports the same tokens. If this lands first, the diff CSS here is the source for the tokens; `diff-aware-preview` consumes the same.

3. **Override state freshness** (low). After Save, the override list must refresh so the badge appears immediately. The `useFragmentOverrides` hook exposes `refresh()`; `<FragmentBlock>`'s `onOverrideChange` triggers it. Verified via test.

4. **Per-block diff redundancy with `diff-aware-preview`** (low — by design). The per-block diff is the focused "this fragment only" view; the preview-pane diff is the global "whole prompt" view. Both ship intentionally — they answer different questions.

## Notes for downstream

- After this feature lands, `<PromptFragmentEditor>` and its hardcoded `CUSTOMIZABLE_FRAGMENTS` list are gone — anywhere external code references either symbol is broken and should be removed (verify via Unit 4's sweep).
- A future "per-fragment lock" (override-this-one-fragment but-keep-other-defaults-locked) would extend `useLock` to be per-fragment-key — out of scope here.

## Implementation Notes

### Files added
- `packages/ui/src/components/fragment-block.tsx` — new `<FragmentBlock>` component
- `packages/ui/src/components/fragment-block.module.css` — CSS module for fragment blocks
- `packages/ui/src/hooks/use-fragment-overrides.ts` — `useFragmentOverrides(modeId)` hook
- `packages/ui/src/components/__tests__/fragment-block.test.tsx` — 22 tests for `<FragmentBlock>`
- `packages/ui/src/hooks/__tests__/use-fragment-overrides.test.tsx` — 4 tests for the hook

### Files modified
- `packages/core/src/types/tool.ts` — added `FragmentOverride` interface + `listFragmentOverrides` to `AuthoringService`
- `packages/core/src/types/client.ts` — added `listFragmentOverrides` to `AuthoringClient`, imported `FragmentOverride`
- `packages/core/src/services/authoring-service.ts` — implemented `listFragmentOverrides` (delegates to `promptCustomization`)
- `packages/client/src/services/authoring-client.ts` — added `listFragmentOverrides` client method over IPC
- `packages/desktop/electron/main/ipc-server.ts` — added `praxis.author.listFragmentOverrides` handler
- `packages/curriculum/src/brief/compose.ts` — exported `FRAGMENT_ORDER` constant (was unexported)
- `packages/ui/src/lib/copy.ts` — added 6 new `COPY.prompt.fragmentBlock*` entries
- `packages/ui/src/routes/configure/prompt-tab.tsx` — rewired `<FragmentStack>` to use `<FragmentBlock>` + `useFragmentOverrides`; removed local `FragmentBlock` wrapper
- `packages/ui/src/__tests__/configure-prompt-tab.test.tsx` — added `listFragmentOverrides` to mock + 6 new tests

### Files deleted
- `packages/ui/src/components/prompt-fragment-editor.tsx`
- `packages/ui/src/components/prompt-fragment-editor.module.css`
- `packages/ui/src/__tests__/prompt-fragment-editor.test.tsx`

### Key substitutions from design
- Design called `client.author.saveFragmentOverride({...})` — actual method is `client.author.customizePrompt(modeId, fragmentId, override)`. Used `customizePrompt` throughout.
- `listFragmentOverrides` was not exposed on the client — added end-to-end: `AuthoringService` interface, `AuthoringServiceImpl`, IPC handler, `AuthoringClientImpl`.
- `FRAGMENT_ORDER` was not exported from `@praxis/curriculum/brief` — exported it.

### Verification
- `pnpm build` on core and curriculum: clean.
- `pnpm typecheck` on UI: no errors in changed files (pre-existing errors from other story's `DocumentDetail` gap remain).
- `pnpm lint:fix`: auto-formatted 7 files, no violations.
- 48 new + updated tests all pass. Only pre-existing `pdf-renderer.test.tsx` failure remains (unrelated).

## Review (2026-05-13)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- The agent had to add `listFragmentOverrides` end-to-end (interface, service, IPC, client) because the design assumed it already existed on the client. Necessary plumbing — clean addition.
- The agent substituted `customizePrompt` for the non-existent `saveFragmentOverride` named in the design. Correct substitution.

**Notes**: The lock-button-no-op bug is fixed by mirroring `useLock` from the global/append editors — symmetry restored across all three editors. The hardcoded `CUSTOMIZABLE_FRAGMENTS` array is gone; visibility is now driven by `PromptFragment.customizable` (SSOT). 48 tests pass (22 FragmentBlock + 4 useFragmentOverrides + 6 new configure-prompt-tab assertions). `<PromptFragmentEditor>` deleted with no surviving references.

What's now possible: every fragment in every mode renders as its own block. Users can see what's locked, what's been edited, and diff per-fragment against defaults. The configurator lock now uniformly disables all save/clear affordances.
