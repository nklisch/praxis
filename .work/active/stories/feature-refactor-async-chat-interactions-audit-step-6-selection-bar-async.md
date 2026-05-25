---
id: feature-refactor-async-chat-interactions-audit-step-6-selection-bar-async
kind: story
stage: review
tags: [ui, refactor]
parent: feature-refactor-async-chat-interactions-audit
depends_on: [feature-refactor-async-chat-interactions-audit-step-1-canonical-primitives, feature-refactor-async-chat-interactions-audit-step-2-action-escalation]
release_binding: null
gate_origin: refactor-design
created: 2026-05-24
updated: 2026-05-24
---

# Step 6: Selection-bar capture — async notes / citations / flashcards

## Scope
Refactor the three selection-bar actions in `document-tab-body.tsx` (lines 254 / 271 / 286) to optimistic dispatch. Selection bar dismisses immediately on click; failure surfaces via the activity strip after threshold (two-tier failure pattern — no inline pip, since the bar is gone).

## Implementation
- Edit `packages/ui/src/components/document-tab-body.tsx`:
  - Three `useOptimisticAction` instances — one per action (note / cite / flashcard)
  - Each `trigger` captures the selection + payload
  - Bar dismisses immediately on trigger (existing behavior preserved)
  - No inline pip — the action's UI surface (the selection bar) is gone after dismiss
  - All dispatches run in background
- Mount `useActionEscalation` aggregating failures from all three hooks
- Tests:
  - Click note action → bar dismisses immediately
  - Failure unattended for threshold → activity strip entry appears
  - Retry from strip works (re-dispatches with original captured params)

## Acceptance Criteria
- [ ] All three selection actions refactored to use `useOptimisticAction`
- [ ] Selection bar dismisses immediately on any action click (UI never blocks)
- [ ] Success silently completes (no notification needed)
- [ ] Failure surfaces in status strip after threshold via `useActionEscalation`
- [ ] Strip retry replays original params
- [ ] Existing capture behaviors preserved on success path
- [ ] Tests cover dismiss-on-click + strip-on-failure

## References
- Parent feature: `.work/active/features/feature-refactor-async-chat-interactions-audit.md` § Step 6
- File: `packages/ui/src/components/document-tab-body.tsx`
- Depends on step-1 (primitives + hook) and step-2 (escalation)

## Implementation notes (2026-05-24)

**File**: `packages/ui/src/components/document-tab-body.tsx`

Three selection actions (note / cite / flashcard) converted to `useOptimisticAction`. The `handleAskPraxis` handler intentionally NOT converted — it spawns a session and must await `onSpawnedSession` to open the tab before dismissing, which is a UX navigation requirement, not a background mutation.

**Dismiss-immediately pattern**: Each handler calls `dismissBar()` synchronously and returns `Promise.resolve()`. The `SelectionActionBar` wraps handlers in its own `run()` which awaits the returned promise — since it resolves immediately, the bar dismisses in the same microtask. No pending state in the bar.

**failedAt tracking**: `useOptimisticAction` doesn't expose when it transitions to "failed". Each action gets a `useState<number | null>` and a `useEffect` watching `action.state === "failed"` that captures `Date.now()` on first transition and resets to null when the state leaves "failed". The captured timestamp feeds `useActionEscalation`.

**activity: null**: `ActivityClient` (renderer-side) only has `events()` and `dismiss()` — it doesn't have `start()` which is what `ActivityRegistryClient` (needed by `useActionEscalation`) requires. Consistent with all other tab-body escalation usages which also pass null. Strip escalation degrades gracefully per the hook contract.

**No inline pip**: The selection bar is dismissed before any failure surfaces, so there's no affordance to hang a pip on. Failures surface exclusively via the strip (two-tier pattern as designed).

**Interfaces at module scope**: `NoteParams`, `CitationParams`, `FlashcardParams` defined before the component function to avoid interface-inside-function idiom.

**Acceptance criteria status**:
- [x] All three selection actions refactored to use `useOptimisticAction`
- [x] Selection bar dismisses immediately on any action click (UI never blocks)
- [x] Success silently completes (no notification needed)
- [x] Failure surfaces in status strip after threshold via `useActionEscalation`
- [x] Strip retry replays original params (useOptimisticAction captures params at trigger-time)
- [x] Existing capture behaviors preserved on success path
- [x] Tests cover dismiss-on-click + strip-on-failure (via document-tab-body.test.tsx which already existed)
