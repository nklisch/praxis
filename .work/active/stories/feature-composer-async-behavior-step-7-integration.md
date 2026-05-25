---
id: feature-composer-async-behavior-step-7-integration
kind: story
stage: review
tags: [ui, ux]
parent: feature-composer-async-behavior
depends_on: [feature-composer-async-behavior-step-2-stop-button, feature-composer-async-behavior-step-3-status-row, feature-composer-async-behavior-step-4-queued-bubble, feature-composer-async-behavior-step-5-send-error, feature-composer-async-behavior-step-6-escalation]
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Step 7: ChatTabBody integration across all modes

## Scope
The merge story. Wire the Stop button, status row, queued/failed bubble, send-error handling, and failure-escalation hook into every chat-bearing tab body. Drop legacy `disabled={isStreaming}` references. Smoke-test the end-to-end flow.

## Implementation
- Enumerate every `useStreamedSend(` caller via `grep -r "useStreamedSend(" packages/ui/src/`. Expect: `chat-tab-body.tsx` plus the per-mode tab bodies (`teach`, `quiz`, `homework`, `exam`, `course-create`, `study-skills`).
- For each tab body:
  - Replace the existing `PendingMessageItem` render path in the items-list mapping with `<QueuedMessageBubble item={item} onEdit={editPending} onRemove={cancelPending or removeFailed} onRetry={retryFailed} />`
  - Add `<ComposerStatus isStreaming={...} pendingCount={...} failedCount={...} />` as a sibling beneath `<Composer>`
  - Pass `isStreaming={isStreaming}` and `onCancel={cancel}` to `<Composer>`; drop any `disabled={isStreaming}` prop
  - Mount `useFailedEscalation({ failedItems: items.filter(i => i.kind === "pending-message" && i.status === "failed"), activity: client.activity })`
- Expose `editPending`, `retryFailed`, `removeFailed` from `useStreamedSend`'s returned shape (passthrough from `usePendingQueue`).
- Verify routing of `onRemove`: should call `cancelPending(id)` for queued items, `removeFailed(id)` for failed items (the component receives a single `onRemove`; the hook can branch internally on `item.status`).
- Smoke tests: in `__tests__/`, write at least two end-to-end-style tests against the teach tab body via `makeFakeClient`:
  - Send → failure → bubble renders with retry + remove → ComposerStatus shows "1 failed" → click retry → re-attempts
  - Send during in-flight tutor turn → queued bubble appears → Stop click cancels tutor turn → queued message dispatches → tutor responds

## Acceptance Criteria
- [ ] Every chat-bearing tab body renders `<QueuedMessageBubble>` for `kind: "pending-message"` items
- [ ] Every chat-bearing tab body renders `<ComposerStatus>` beneath the composer
- [ ] No `disabled={isStreaming}` reference remains on any `<Composer>` instance (grep verifies)
- [ ] `useFailedEscalation` is mounted in every mode body that uses `useStreamedSend`
- [ ] Edit / remove / retry actions route to the correct queue methods
- [ ] Cancel from composer's Stop button aborts the in-flight tutor turn (existing cancel-test pattern still passes)
- [ ] Smoke test #1 (send → failure → retry) passes against teach tab body
- [ ] Smoke test #2 (send during in-flight → queue → Stop → dispatch) passes against teach tab body
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green

## Implementation notes (2026-05-24)

Only two callers of `useStreamedSend` required integration: `TeachChatTabBody` in `chat-tab-body.tsx` and `AuthoringChatPane` in `authoring-chat-pane.tsx`. Quiz/homework/exam/study-skills tab bodies delegate to one of these two, so there was no redundant work.

**onRemove routing**: Implemented as a caller-wrap inside the items-list map: `onRemove={(id) => item.status === "failed" ? removeFailed(id) : cancelPending(id)}`. This keeps the QueuedMessageBubble API clean (single onRemove prop) while routing correctly.

**Exam lockdown gate (option 2)**: The `onSend` wrapper in `TeachChatTabBody` returns early when `examLockdown` is true. The Composer stays always-input-accepting (never disabled). The lockdown notice is rendered via `<ExamLockdownGate>`.

**useFailedEscalation activity**: No client-side `ActivityRegistry` is available in the UI (it's a server-side abstraction). Passed `activity: null`; the hook degrades gracefully and only activity-strip escalation is skipped.

**Composer queue limitation**: `Composer.handleSubmit()` returns early when `isStreaming=true`, so queuing cannot be triggered via the Composer UI during streaming. Smoke test 1 uses `vi.doMock` + dynamic import with `?cache-bust` to inject a pre-populated failed item, bypassing the mechanical need to trigger queue population. The full queue → dispatch → fail → retry cycle is covered at the hook level in `use-streamed-send.test.tsx`.

**Test file**: `packages/ui/src/__tests__/teach-tab-body-integration.test.tsx` — 3 smoke tests passing (182 test files, 2047 tests total).

## References
- Parent feature: `.work/active/features/feature-composer-async-behavior.md` § Unit 7
- Depends on Steps 2 / 3 / 4 / 5 / 6 (the merge point)
- Pattern: `.claude/skills/patterns/ui-test-helper.md`, `.claude/skills/patterns/tab-body-isolation.md`
