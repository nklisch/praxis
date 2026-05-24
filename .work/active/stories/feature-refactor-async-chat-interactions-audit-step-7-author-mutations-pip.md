---
id: feature-refactor-async-chat-interactions-audit-step-7-author-mutations-pip
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

# Step 7: Author / configurator mutations — pip sweep

## Scope
Cluster refactor: convert every author-side mutation that currently locks the editor on the round-trip to use `useOptimisticAction`. Per-mutation pip on the trigger affordance; failure → inline retry. Preserve modal-dismissal-on-success contracts where applicable.

## Implementation
- For each file, refactor every sync-await mutation:
  - `packages/ui/src/components/prompt-block-stack.tsx` (lines 115, 132, 152, 158, 164) — `getGlobalPrompt`, `setGlobalPrompt`, `getModeAppend`, `setModeAppend`, `customizePrompt`
  - `packages/ui/src/components/lesson-editor.tsx` (lines 44, 64, 66) — `updateLesson`, `deleteLesson`
  - `packages/ui/src/components/gate-inspector.tsx` (lines 93, 111, 117, 119) — `updateGate`, `overrideGate`, `deleteGate`
  - `packages/ui/src/components/memory-inspector-tabs.tsx` (lines 32, 51, 74, 81) — `studentModel`, `misconceptions` (reads — consider whether refactor applies), `resetConcept`, `clearMisconception`
  - `packages/ui/src/components/tool-call-entry.tsx` (line 90) — `restoreAction`
  - `packages/ui/src/components/attributed-preview-pane.tsx` (line 32) — `previewPromptWithAttribution`
- For each: use `useOptimisticAction`; show pip on the trigger affordance; on failure render `<FailurePopover>` with retry
- Preserve modal-dismissal-on-success via `onSuccess` callback (catalog each before refactoring)
- Group commits per file to keep diffs reviewable
- Tests: each surface's existing author tests must pass; ADD per-surface test asserting trigger does NOT disable

## Acceptance Criteria
- [ ] All 6 listed files refactored to use `useOptimisticAction` for mutations
- [ ] Pure data reads (e.g., `studentModel`, `misconceptions`) handled appropriately (may use `useResource` pattern instead — judgment call per surface)
- [ ] Per-mutation pip on the trigger affordance
- [ ] Failure → `<FailurePopover>` with retry
- [ ] Modal-dismissal-on-success preserved where applicable
- [ ] Existing author tests all pass
- [ ] New per-file test: trigger affordance does NOT disable during in-flight

## References
- Parent feature: `.work/active/features/feature-refactor-async-chat-interactions-audit.md` § Step 7
- Depends on step-1 (primitives + hook) and step-2 (escalation)
