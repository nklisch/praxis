---
id: feature-refactor-async-chat-interactions-audit-step-5-document-attach-pip
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

# Step 5: Document attach — per-row pip + optimistic state

## Scope
Refactor `library-document-picker.tsx:118` `client.documentScopes.attach()` from sync-await to per-row optimistic dispatch. Each row's attach button uses `useOptimisticAction`; optimistic update marks the doc as attached immediately on click.

## Implementation
- Edit `packages/ui/src/components/library-document-picker.tsx`:
  - One `useOptimisticAction` per row (keyed by document id) OR a single hook with id-keyed params
  - On `trigger`: optimistically add doc id to local `attachedSet` state
  - On `dispatch`: call `client.documentScopes.attach(...)` in background
  - On failure: remove from `attachedSet`, render `<FailurePopover>` with retry on the row
  - `<ActionPip>` on each row's attach button
- Mount `useActionEscalation` for the picker (failed-attach scope)
- Tests:
  - Click attach → row shows attached state immediately
  - Failure → row reverts + retry available
  - Multiple concurrent attaches each have their own pip state

## Acceptance Criteria
- [ ] Per-row attach uses `useOptimisticAction`
- [ ] Optimistic state: doc appears attached before dispatch resolves
- [ ] Pip shows on the attach button per row
- [ ] Failure → row reverts optimistic state + inline retry
- [ ] Multiple rows can be in-flight concurrently without cross-talk
- [ ] Existing attach success behavior preserved
- [ ] Tests cover concurrent rows + failure-reversion

## References
- Parent feature: `.work/active/features/feature-refactor-async-chat-interactions-audit.md` § Step 5
- File: `packages/ui/src/components/library-document-picker.tsx:118`
- Depends on step-1 (primitives + hook) and step-2 (escalation)

## Implementation notes (2026-05-24)

Refactored `library-document-picker.tsx` to use per-row `useOptimisticAction` with optimistic state management.

**Key design decisions:**
- `useOptimisticAction` cannot be called in a loop (React hooks must not be called conditionally). Extracted `DocumentPickerRow` as a proper React sub-component so each row gets its own independent hook instance and pip state.
- Optimistic update: clicking Attach immediately adds the document id to `attachedIds` in the parent's `useResource` state via `handleOptimisticAttach`. On failure, `handleOptimisticRevert` removes it. This ensures the parent's `isAlreadyAttached` prop is the authoritative source of truth for all rows.
- `setData` callback must return `T` not `T | undefined` — the `!prev` fallback returns `{ library: [], attachedIds: new Set() }` rather than `undefined`.
- Each `DocumentPickerRow` receives `onOptimisticAttach` and `onOptimisticRevert` callbacks for the parent state mutations, plus an `onAttach` callback for the actual IPC call.
- Per-row `useActionEscalation` with `activity: null` (graceful degradation).
- The per-row `attaching`/`rowErrors` state maps from the original component are removed entirely — pip + FailurePopover replace them.

**Files changed:**
- `packages/ui/src/components/library-document-picker.tsx`
- `packages/ui/src/__tests__/library-document-picker.test.tsx` (3 new tests: optimistic attach, failure revert, concurrent rows)
