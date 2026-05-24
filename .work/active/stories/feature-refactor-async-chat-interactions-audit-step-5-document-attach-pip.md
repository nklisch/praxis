---
id: feature-refactor-async-chat-interactions-audit-step-5-document-attach-pip
kind: story
stage: implementing
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
