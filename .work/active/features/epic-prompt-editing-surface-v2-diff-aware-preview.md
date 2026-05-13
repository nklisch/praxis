---
id: epic-prompt-editing-surface-v2-diff-aware-preview
kind: feature
stage: done
tags: [ui, configure, prompt-customization]
parent: epic-prompt-editing-surface-v2
depends_on:
  - epic-prompt-editing-surface-v2-compose-attribution
  - epic-prompt-editing-surface-v2-unified-configure-surface
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Diff-aware prompt preview

## Brief

Today the preview pane (`prompt-preview-pane.tsx`) renders the composed final
prompt as an undifferentiated wall of text. The user sees the result of their
customization but can't see *what* they changed — which spans came from
default fragments, which from their override, which from the per-mode append,
which from the global fragment. Mentally diffing against the default by eye
is the only way to know.

This feature replaces the preview pane with a diff- and attribution-aware
renderer. Consuming the segment list from `compose-attribution`, each span
is rendered with its source (default / override / append / global) made
visible — color, tag, or hover affordance per source.

**Render shape (resolved at epic-design)**: the pane has a single toggle
control at the top — `[Composed | Diff]`. In Composed mode the pane
renders the final prompt with source-attributed inline annotations
(highlight per source + tag/hover). In Diff mode it switches to a
side-by-side or unified diff against the unmodified default. The user
chooses the view that fits the task.

This pairs with the **per-block diff buttons** from `full-fragment-view`,
which drill down to a single fragment's diff. The global toggle is "show
me everything"; the per-block button is "show me this one."

Hosted inside the unified configure surface; replaces the current
preview-pane component in place.

## Epic context

- Parent epic: `epic-prompt-editing-surface-v2`
- Position in epic: terminal feature — depends on both foundation features
  (`compose-attribution` for source spans, `unified-configure-surface` as
  the host). Lands in wave 2 alongside `full-fragment-view`.

## Foundation references

- `docs/ARCHITECTURE.md:353` — config UI for the prompt-composition system

## Anchors

- Current preview pane (to replace) —
  `packages/ui/src/components/prompt-preview-pane.tsx`
- Preview service entry —
  `PromptCustomizationServiceImpl.previewPrompt` in
  `packages/core/src/services/prompt-customization-service.ts:153-194`
  (will need to thread the attribution shape from `compose-attribution`)
- IPC channel — `praxis.author.previewPrompt` in
  `packages/client/src/services/authoring-client.ts:180-186` (return shape
  may evolve to carry segments — coordinate with `compose-attribution`)

## Architectural choice

**New `AttributedPreviewPane` component alongside the existing `PromptPreviewPane`** — the unified configure surface's `PromptPreviewWithToggle` switches to the new component; `mode-append-editor` and `global-prompt-editor` keep using the simple-string `PromptPreviewPane`. This keeps the two surfaces single-purpose: the simple editors don't need attribution UI, the unified-surface preview does.

Two alternatives rejected:
- *Replace `PromptPreviewPane` in-place with view-mode prop.* Forces all three callers into the heavier `previewPromptWithAttribution` IPC just for the unified-surface case. The existing simple callers don't need it.
- *One component, view-prop branch.* Same problem; conflates the simple-string and attributed paths in one component.

## Design decisions (resolved by autopilot)

- **IPC channel reuse**: the existing `praxis.author.previewPromptWithAttribution` (added by `compose-attribution`) is the only call needed. **No new channel, no service change.** Baseline for the diff is reconstructed client-side from segments (see Unit 1).
- **Diff style v1: side-by-side, not unified.** Side-by-side reads better for multi-line prompt content and avoids pulling in a `diff`-package dependency. Unified diff is a v2 polish if user feedback warrants it.
- **Baseline reconstruction (client-side)**: a pure function over the current segments — drop `global`/`append` (purely user-added), revert `override` segments to their `defaultText` and re-mark as `default`, pass through `default` and `additional` unchanged. The result's joined prompt is the "unmodified default" view for the diff's left column.
- **Source color palette**: muted gray for `default`/`additional`, amber-ish for `override`, green-ish for `append`, teal-ish for `global`. Uses existing theme tokens — no new hex constants.
- **Hover/tag affordance**: title-attribute tooltip on each segment span carries `{source}` (and `fragmentId` for advanced inspection). No portal-rendered hover card for v1 — title attr is enough.
- **Toggle position**: the `[Composed | Diff]` toggle stays at the TOP of the preview block (where `PromptPreviewWithToggle` already renders it). The disabled "coming in v2" state from `unified-configure-surface` is replaced by a functional toggle.
- **No service-layer change**: `previewPromptWithAttribution` already returns `{ prompt, segments }`. The diff baseline is a client-side projection of `segments`. Cleanest separation — service stays pure over stored config.
- **`PromptPreviewPane` left alone**: existing callers (`mode-append-editor`, `global-prompt-editor`, and indirectly the simple-string path in `PromptPreviewWithToggle`) keep working unchanged. The new `AttributedPreviewPane` is the one wired into the toggle.

## Anchors (verified)

- `ComposedSegment` / `ComposedSystemPromptWithAttribution` — `packages/core/src/types/prompt-attribution.ts`
- `client.author.previewPromptWithAttribution(...)` — `packages/client/src/services/authoring-client.ts:189-198`
- `PromptCustomizationServiceImpl.previewPromptWithAttribution` — `packages/core/src/services/prompt-customization-service.ts:172-174`
- `PromptPreviewWithToggle` (target wiring site) — `packages/ui/src/routes/configure/prompt-tab.tsx:86-130`
- Existing `PromptPreviewPane` (kept for simple-string callers) — `packages/ui/src/components/prompt-preview-pane.tsx`

## Implementation Units

Single-stride. No child stories — one new component + small wiring update + tests, all in `@praxis/ui`. Tightly cohesive; the seams between units are small.

### Unit 1: `AttributedPreviewPane` component

**File**: `packages/ui/src/components/attributed-preview-pane.tsx` (new)

```typescript
import type { JSX } from "react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import type {
  ComposedSegment,
  ComposedSystemPromptWithAttribution,
  SegmentSource,
} from "@praxis/core/types";
import { usePraxisClient } from "../context/client-context.js";
import styles from "./attributed-preview-pane.module.css";

export interface AttributedPreviewPaneProps {
  modeId: string;
  view: "composed" | "diff";
  draftGlobal?: string | null;
  draftAppend?: string | null;
}

export function AttributedPreviewPane(props: AttributedPreviewPaneProps): JSX.Element {
  const client = usePraxisClient();

  const deferredGlobal = useDeferredValue(props.draftGlobal);
  const deferredAppend = useDeferredValue(props.draftAppend);

  const [current, setCurrent] = useState<ComposedSystemPromptWithAttribution | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const result = await client.author.previewPromptWithAttribution({
          modeId: props.modeId,
          ...(deferredGlobal !== undefined && { draftGlobal: deferredGlobal }),
          ...(deferredAppend !== undefined && { draftAppend: deferredAppend }),
        });
        if (!cancelled) setCurrent(result);
      } catch {
        // Silent degradation — keep prior preview on transient errors.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [client, props.modeId, deferredGlobal, deferredAppend]);

  const baseline = useMemo(
    () => (current && props.view === "diff" ? reconstructBaseline(current.segments) : null),
    [current, props.view],
  );

  if (current === null) {
    return <div className={styles.pane}>{loading ? "…" : ""}</div>;
  }

  if (props.view === "composed") {
    return (
      <div className={styles.pane}>
        {loading && <span className={styles.refreshing} aria-label="Refreshing preview">…</span>}
        <ComposedView segments={current.segments} />
      </div>
    );
  }

  // view === "diff"
  return (
    <div className={styles.pane}>
      {loading && <span className={styles.refreshing} aria-label="Refreshing preview">…</span>}
      <DiffView left={baseline!.segments} right={current.segments} />
    </div>
  );
}

// — Client-side baseline reconstruction —
// The diff's "default" column is the prompt as it would compose without ANY user
// customization. Pure projection of the current segments — no extra IPC.
export function reconstructBaseline(segments: readonly ComposedSegment[]): {
  prompt: string;
  segments: ComposedSegment[];
} {
  const baselineSegments = segments.flatMap<ComposedSegment>((s) => {
    if (s.source === "global" || s.source === "append") {
      // User-added cross-mode or per-mode layer — drop from baseline.
      return [];
    }
    if (s.source === "override") {
      // Revert to default text; reclassify as "default" so the renderer treats it cleanly.
      return [{ ...s, source: "default" as const, text: s.defaultText ?? s.text }];
    }
    // default and additional pass through unchanged.
    return [s];
  });
  return {
    prompt: baselineSegments.map((s) => s.text).join("\n\n"),
    segments: baselineSegments,
  };
}
```

Sub-components in the same file (or split if they grow):

```typescript
function ComposedView({ segments }: { segments: readonly ComposedSegment[] }): JSX.Element {
  return (
    <pre className={styles.preview}>
      {segments.map((s, i) => (
        <span
          key={`${s.fragmentId}-${i}`}
          className={`${styles.segment} ${segmentClassFor(s.source)}`}
          title={`${s.source} · ${s.fragmentId}`}
        >
          {s.text}
          {i < segments.length - 1 && "\n\n"}
        </span>
      ))}
    </pre>
  );
}

function DiffView({
  left,
  right,
}: {
  left: readonly ComposedSegment[];
  right: readonly ComposedSegment[];
}): JSX.Element {
  return (
    <div className={styles.diff}>
      <div className={styles.diffCol}>
        <div className={styles.diffHeader}>Default</div>
        <ComposedView segments={left} />
      </div>
      <div className={styles.diffCol}>
        <div className={styles.diffHeader}>Current</div>
        <ComposedView segments={right} />
      </div>
    </div>
  );
}

function segmentClassFor(source: SegmentSource): string {
  switch (source) {
    case "default": return styles.sourceDefault;
    case "override": return styles.sourceOverride;
    case "append": return styles.sourceAppend;
    case "global": return styles.sourceGlobal;
    case "additional": return styles.sourceAdditional;
  }
}
```

**Implementation Notes**:
- Use `useDeferredValue` for both draft inputs — matches `PromptPreviewPane`'s existing pattern.
- The cancelled-effect flag prevents stale IPC results from clobbering newer ones.
- `reconstructBaseline` is exported for unit testing in isolation.

**Acceptance Criteria**:
- [ ] Component renders without error in composed mode against a stubbed `previewPromptWithAttribution`.
- [ ] Each segment gets a source-coded class; `title` attr carries `source · fragmentId`.
- [ ] Diff mode renders left (baseline) and right (current) columns; baseline is reconstructed correctly.
- [ ] Switching `view` prop swaps the rendered content without remounting (no IPC re-fetch).
- [ ] Stale-effect protection: rapid `modeId` changes don't surface old data.

---

### Unit 2: Source-coded CSS

**File**: `packages/ui/src/components/attributed-preview-pane.module.css` (new)

```css
.pane {
  /* mirror prompt-preview-pane.module.css structure */
}

.refreshing {
  /* unchanged from existing pane */
}

.preview {
  /* <pre> reset, monospace, wrap */
  white-space: pre-wrap;
  font-family: var(--font-mono, monospace);
}

.segment {
  display: inline;
  border-radius: 2px;
  padding: 0 2px;
}

.sourceDefault {
  /* unchanged — no decoration */
}
.sourceAdditional {
  /* system-injected — neutral gray tint */
  background-color: var(--surface-muted, rgba(0, 0, 0, 0.04));
}
.sourceOverride {
  /* changed mode fragment — amber */
  background-color: var(--accent-amber-soft, rgba(245, 158, 11, 0.16));
}
.sourceAppend {
  /* purely user-added per-mode — green */
  background-color: var(--accent-green-soft, rgba(34, 197, 94, 0.16));
}
.sourceGlobal {
  /* purely user-added cross-mode — teal */
  background-color: var(--accent-teal-soft, rgba(20, 184, 166, 0.16));
}

.diff {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
}
.diffCol {
  min-width: 0; /* allow flex/grid children to shrink */
}
.diffHeader {
  font-size: 0.875rem;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--text-secondary);
}
```

If the theme tokens above don't exist yet (`--accent-amber-soft` etc.), define them in the closest theme token file (`packages/ui/src/styles/tokens.css` or similar — verify during impl). Stay within the established token system.

**Acceptance Criteria**:
- [ ] Source-coded backgrounds are visible against the editorial background.
- [ ] Diff columns size to half-width on the typical preview-pane container; each column scrolls/wraps independently.
- [ ] Tokens used (not raw hex) wherever a theme has equivalent semantic colors.

---

### Unit 3: Wire into `PromptPreviewWithToggle`

**File**: `packages/ui/src/routes/configure/prompt-tab.tsx` (replace the existing `PromptPreviewWithToggle` body around lines 86-130)

```typescript
function PromptPreviewWithToggle({ modeId }: PromptPreviewWithToggleProps): JSX.Element {
  const [view, setView] = useState<"composed" | "diff">("composed");

  return (
    <div className={styles.previewWithToggle}>
      <div className={styles.previewToggle} role="tablist" aria-label="Preview view">
        <button
          type="button"
          role="tab"
          aria-selected={view === "composed"}
          className={`${styles.previewToggleBtn} ${view === "composed" ? styles.active : ""}`}
          onClick={() => setView("composed")}
        >
          {COPY.prompt.toggleComposed ?? "Composed"}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "diff"}
          className={`${styles.previewToggleBtn} ${view === "diff" ? styles.active : ""}`}
          onClick={() => setView("diff")}
        >
          {COPY.prompt.toggleDiff ?? "Diff"}
        </button>
      </div>
      <AttributedPreviewPane modeId={modeId} view={view} />
    </div>
  );
}
```

Remove the `diffDisabled` state and the "coming in v2" tooltip — both go away.

**Implementation Notes**:
- The toggle is just two `<button role="tab">` controls — no router state, no URL persistence. Local component state is sufficient for view-mode.
- Existing CSS for `.previewToggle`, `.previewToggleBtn`, `.active` should already be in the styles file from `unified-configure-surface`. If the disabled-button class was the only diff-toggle styling, replace it with the active-button styling here.

**Acceptance Criteria**:
- [ ] Toggle starts in "composed" mode.
- [ ] Clicking "Diff" switches to diff view; clicking "Composed" switches back.
- [ ] `aria-selected` on the active tab; both buttons accessible to screen readers.
- [ ] No "coming in v2" tooltip surfaces anywhere.

---

### Unit 4: COPY updates

**File**: `packages/ui/src/lib/copy.ts`

Add (or update if placeholders exist from `unified-configure-surface`):

```typescript
export const COPY = {
  // …existing…
  prompt: {
    // …existing…
    toggleComposed: "Composed",
    toggleDiff: "Diff",
    // remove or repurpose `diffToggleDisabledTooltip` — no longer needed
  },
};
```

**Acceptance Criteria**:
- [ ] Toggle labels reference COPY rather than literals.

---

### Unit 5: Tests

**File**: `packages/ui/src/components/__tests__/attributed-preview-pane.test.tsx` (new)

Test cases:
- **`reconstructBaseline` pure-function tests**:
  - Drops `global` and `append` segments.
  - Reverts `override` segments to `defaultText`, source becomes `default`.
  - Passes through `default` and `additional` unchanged.
  - Preserves render order.
  - `prompt` field equals `segments.map(s => s.text).join("\n\n")`.
- **Component composed-mode**:
  - Renders each segment with the source-coded class.
  - `title` attr present with `source · fragmentId`.
  - Loading indicator while IPC in flight.
- **Component diff-mode**:
  - Renders two columns (`Default`, `Current`).
  - Baseline column omits user-added segments.
  - Baseline column shows default text where override existed.
- **View-prop switching**:
  - No re-fetch when only `view` changes.
- **Stale-effect protection**:
  - Rapid `modeId` change with delayed IPC doesn't surface stale data.

Use `makeFakeClient(overrides?)` from `__tests__/helpers/fake-client.ts` (per `ui-test-helper` pattern); inject a fake `author.previewPromptWithAttribution` returning controlled `ComposedSegment[]`.

**File**: `packages/ui/src/__tests__/configure-prompt-tab.test.tsx` (extend)

Add cases:
- Clicking the Diff toggle button switches the preview content (no longer disabled).
- Default state is Composed view.

**Acceptance Criteria**:
- [ ] All new tests pass.
- [ ] Existing configure-prompt-tab tests pass (existing "diff disabled" assertion is updated).

---

## Implementation Order

Single-stride. Suggested intra-stride order:

1. Unit 5 (`reconstructBaseline` test first — TDD-style for the pure function).
2. Unit 1 (`AttributedPreviewPane` component + the pure baseline function).
3. Unit 2 (CSS).
4. Unit 4 (COPY constants).
5. Unit 3 (wire into `PromptPreviewWithToggle`).
6. Unit 5 remainder (component tests + configure-tab tests).

## Testing

Covered by Unit 5. The pure `reconstructBaseline` function is the highest-value test target — every other piece composes off it. The component tests verify the render shape; the configure-tab test verifies the wiring.

## Risks

1. **Theme tokens for soft accent colors may not exist** (low). The CSS uses semantic tokens (`--accent-amber-soft`, etc.). If those aren't already defined, add them to the closest token file alongside existing tokens or fall back to inline rgba values matching the design's intent. Verify during impl.

2. **Side-by-side width with long prompts** (low-medium). Long prompts in a 400px-each column are cramped. Each column has its own scroll (overflow: auto on `.diffCol > pre`) so the user can scroll independently. If real prompts are routinely wider than what comfortably side-by-sides, v2 can add a unified-diff toggle or full-width-comparison mode.

3. **`reconstructBaseline` semantic mismatch** (low). The function assumes that "baseline" === "no user customization at all" (revert overrides, drop user layers). If a user's mental model is "what does the default look like for THIS mode WITH the system context they already have?", the `additional` segments staying in the baseline is correct. The reconstruction is faithful to that intent.

4. **Stale baseline during a rapid mode-switch** (low). If `modeId` changes, `current` updates and `baseline` is recomputed from the new segments via `useMemo`. Both come from the same IPC response, so no drift between them. Good.

5. **No new IPC = no new server-side surface to keep in sync.** Big risk reduction vs. the alternative (a `useBaseline` flag on the service method). Approval-tone risk: low.

## Notes for downstream

- `full-fragment-view` (sibling wave-2 feature) renders per-fragment blocks with their own diff button. That diff is a per-block view of `{ defaultText, text }` on a single `ComposedSegment` — the same shape this feature consumes globally. The two features stay aligned by both reading from `ComposedSegment` without coordinating directly.

## Implementation Notes

### Files added
- `packages/ui/src/components/attributed-preview-pane.tsx` — new `AttributedPreviewPane` component + exported `reconstructBaseline` pure function + `ComposedView` / `DiffView` sub-components
- `packages/ui/src/components/attributed-preview-pane.module.css` — source-coded CSS with per-`SegmentSource` background colors; uses CSS custom property fallbacks (`--accent-amber-soft`, `--accent-green-soft`, `--accent-teal-soft`) with inline rgba values — tokens didn't exist in the theme, so rgba fallbacks are the live values
- `packages/ui/src/components/__tests__/attributed-preview-pane.test.tsx` — 16 tests: 7 pure `reconstructBaseline` tests, composed-mode component tests, diff-mode column tests, view-prop no-re-fetch test, stale-effect protection test

### Files modified
- `packages/ui/src/routes/configure/prompt-tab.tsx` — replaced `PromptPreviewPane` with `AttributedPreviewPane`; removed `disabled` / `aria-disabled` / `title` from Diff button; renamed `activeTab` → `view`; removed `PromptPreviewPane` import
- `packages/ui/src/lib/copy.ts` — removed `diffToggleDisabledTooltip` (no longer needed; the toggle is functional)
- `packages/ui/src/__tests__/configure-prompt-tab.test.tsx` — updated `makeClient` to include `previewPromptWithAttribution` stub; flipped "Diff disabled" assertion to "Diff enabled"; removed "coming soon tooltip" assertion; added 4 new tests (enabled state, no tooltip, click-to-switch, default-to-composed)

### Decisions
- CSS theme tokens `--accent-amber-soft` / `--accent-green-soft` / `--accent-teal-soft` do not exist in `packages/ui/src/styles/global.css` — used inline rgba fallbacks per design guidance (acceptable for v1; can be promoted to tokens when the theme system expands)
- `segmentClassFor` returns `styles.X ?? ""` to satisfy `noUncheckedIndexedAccess` / CSS module `string | undefined` return type
- `reconstructBaseline` export is pure — no React, no effects — enabling straightforward unit testing without JSDOM

### Verification
- `pnpm typecheck` — clean
- `pnpm lint` — 12 pre-existing errors (confirmed via `git stash` baseline); 0 new errors from this changeset
- `pnpm test` — 331 passed, 3 skipped (all pre-existing skips); 0 failures
- `pnpm build` — clean

## Review (2026-05-13)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**:
- The agent fell back to inline `rgba(...)` values for source-coded backgrounds because the theme tokens (`--accent-amber-soft` etc.) don't exist yet. Acceptable — the substrate body acknowledges this as a known trade-off. If theme tokens are added later, the CSS substitutes cleanly.
- The pure `reconstructBaseline` function is the load-bearing piece; tested in isolation with 7 dedicated cases. Excellent separation.

**Notes**: No new IPC channel — diff baseline is reconstructed client-side from segments. That's the cleanest possible split: service stays pure over stored config, client owns the projection. View-prop switching does NOT re-fetch (asserted by test) — segments stay stable while the user toggles between Composed and Diff. Stale-effect protection on rapid modeId changes is tested. 16 tests pass.

What's now possible: the Diff toggle works. Users can see exactly which spans came from defaults vs. overrides vs. append vs. global, in both composed and side-by-side views. Pairs with the per-block diff buttons in full-fragment-view — same source-coded color vocabulary across both surfaces.
