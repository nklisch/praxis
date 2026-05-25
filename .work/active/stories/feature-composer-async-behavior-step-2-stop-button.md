---
id: feature-composer-async-behavior-step-2-stop-button
kind: story
stage: done
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

## Implementation notes (2026-05-24)

### Files changed
- `packages/ui/src/components/composer.tsx` — Added `isStreaming: boolean` and `onCancel: () => void` props. Removed `disabled` prop. Textarea is never disabled. Send button conditionally renders as Stop (`■`) with `.composer__send--stop` class when `isStreaming`. Enter-to-send suppressed when `isStreaming`. COPY entries `stopAriaLabel` and `sendAriaLabel` added to `packages/ui/src/lib/copy.ts`.
- `packages/ui/src/components/chat-tab-body.tsx` — Removed the external `{isStreaming && <div className={stopRow}>...}` block; now passes `isStreaming={isStreaming}` and `onCancel={cancel}` to `<Composer>`. Removed `disabled={examLockdown}` prop (see discovery below).
- `packages/ui/src/components/sidekick-panel.tsx` — Added `cancel` to destructuring; replaced `disabled={isStreaming}` with `isStreaming`/`onCancel`.
- `packages/ui/src/components/authoring-chat-pane.tsx` — Removed `disabled` from `AuthoringChatPaneProps` and destructuring; replaced `disabled={!sessionId || isStreaming || disabled}` with `isStreaming`/`onCancel`.
- `packages/ui/src/components/configure-chat-pane.tsx` — Removed `disabled` from `ConfigureChatPaneProps` (dead export — no callers).
- `packages/ui/src/__tests__/composer.test.tsx` — Rewrote: replaced 8 old tests with 14 tests across Send mode and Stop mode groups. Removed all `disabled` assertions. Added Stop button render, `onCancel` fire, Enter-during-streaming-noop, textarea-never-disabled assertions.
- `packages/ui/src/components/__tests__/authoring-chat-pane.test.tsx` — Updated two tests that asserted `textarea.disabled === true` to assert `false` (correct new behavior).
- `packages/ui/src/__tests__/chat-tab-body-dispatch.test.tsx` — Updated exam lockdown test to assert textarea is NOT disabled and lockdown notice is visible.

### Implementation discovery
**Exam lockdown**: The previous `disabled={examLockdown}` on `<Composer>` (in `chat-tab-body.tsx`) was removed since `Composer` no longer accepts `disabled`. The exam lockdown notice (`lockdownNotice`) is still rendered visually. However, the textarea is now NOT HTML-disabled during an exam. This is an intentional step-2 limitation: a proper lock mechanism (overlay, form gate, or Enter-key interception in the exam tab body) should be introduced in step-7 (integration) when exam-mode-specific behavior is re-wired. This is noted in the updated exam lockdown test as a `step 2 intentional change`.

## Review (2026-05-24)

**Verdict**: Approve with comments

**Blockers**: none
**Important**: 1 follow-up parked (`idea-resolve-composer-queue-vs-stop-affordance-conflict`) — Enter-during-streaming as no-op (per this story's spec) makes queue-during-streaming unreachable from composer UI; design tension surfaced at step-7 integration time
**Nits**: none

**Notes**: Send↔Stop morph implemented per spec. `disabled` prop removed from `ComposerProps`; 4 call sites updated. examLockdown regression handled in step-7 via tab-body-level onSend gate. 14 tests passing. Bundled commit `f0674d11`.
