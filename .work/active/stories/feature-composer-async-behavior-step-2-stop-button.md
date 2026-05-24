---
id: feature-composer-async-behavior-step-2-stop-button
kind: story
stage: implementing
tags: [ui, ux]
parent: feature-composer-async-behavior
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 2: Composer Send ↔ Stop button morph

## Scope
Replace the composer's `disabled={isStreaming}` lock with a Send-button-morphs-to-Stop pattern. Composer accepts input regardless of streaming state; Stop fires `onCancel` (already wired to the AbortController path through `useStreamedSend.cancel()`).

## Implementation
- Edit `packages/ui/src/components/composer.tsx`:
  - Add props: `isStreaming: boolean`, `onCancel(): void`
  - Remove the `disabled` prop entirely
  - When `isStreaming === true`, render `<button class="composer__send composer__send--stop" aria-label="Stop tutor turn">■</button>` → `onCancel`
  - When `isStreaming === false`, render existing Send button → `onSend`
  - Same DOM element; modifier class swap; preserves focus through transition
  - Enter-to-send: only fires when `value` non-empty AND `isStreaming === false`. Enter during streaming is a no-op.
- Update `packages/ui/src/__tests__/composer.test.tsx`:
  - Add cases for Stop button render, click → onCancel, Enter during streaming is no-op
  - Remove any `disabled` references; add typecheck guard
- COPY: if a `COPY` module exists in `packages/ui/src/copy.ts`, route the aria-labels through it; otherwise inline.

## Acceptance Criteria
- [ ] Composer renders Send button when `isStreaming=false`
- [ ] Composer renders Stop button (with `composer__send--stop` class) when `isStreaming=true`
- [ ] Click on Stop fires `onCancel` exactly once
- [ ] Enter key during `isStreaming=true` fires neither `onSend` nor `onCancel`
- [ ] Textarea accepts input regardless of `isStreaming`
- [ ] `disabled` prop removed from `ComposerProps`
- [ ] All composer tests pass; no references to the removed `disabled` prop

## References
- Parent feature: `.work/active/features/feature-composer-async-behavior.md` § Unit 2
- Mockup: `.mockups/screens/feature-composer-async-behavior/state-in-flight-empty.html`
- Existing file: `packages/ui/src/components/composer.tsx`
