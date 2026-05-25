---
id: feature-refactor-async-chat-interactions-audit
kind: feature
stage: done
tags: [ui, refactor]
parent: epic-chat-interaction-ux-overhaul
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-25
---

# Refactor: audit every UI surface that interacts with chat, sweep sync-await → async

## Brief
Across the app, many buttons that trigger work hitting the chat / LLM pipeline freeze and wait synchronously for the round-trip to complete instead of returning control to the user immediately. The composer send button locks (handled by `feature-composer-async-behavior`), the structured-question submit greys out (handled by `feature-question-panel-rework`), the "ready to materialize" button freezes, and there are presumably more — every interaction that fans out into a chat turn currently gates the UI on it. The two sibling features in this epic fix the two known specific surfaces; this refactor catches everything else.

Refactor-design will:
1. **Audit** — discover every UI surface that interacts with `client.session.*`, `client.tabs.*`, or any engine-triggering RPC. For each, classify as sync-await (locks UI until response) vs already-async (fire-and-forget with progress shown elsewhere).
2. **Catalogue findings** as child stories tagged `[refactor]`, one per sync surface that needs converting.
3. **Establish the uniform pattern** — "click fires the action, UI updates optimistically to show in-flight state, errors surface asynchronously" (failed-to-send badge, retry control, activity-strip integration). Codify as a pattern skill if the shape recurs enough.

## Source idea
`idea-async-chat-interactions-audit` (parked 2026-05-24). Related: `idea-composer-queue-and-cancel`, `idea-user-question-no-dismiss-on-submit` (both promoted as sibling features / stories in this epic).

## Foundation reference
`docs/UX.md` cross-cutting interaction patterns now states: "Chat round-trips never gate user input. The 'UI never blocks' principle applies to in-conversation interactions, not just background streams. ... Any in-chat affordance that triggers engine work updates optimistically and surfaces failures asynchronously rather than freezing. The student is always free to do the next thing while the previous request is in flight." This refactor brings the rest of the codebase in line with that principle.

## Why a refactor feature (not a perf or feature-design feature)
- Behavior preserved: same end-state outcomes, different intermediate UX
- Cross-cutting: touches many components in the same way
- Pattern-establishing: produces a reusable shape (the optimistic-dispatch + async-error UI pattern) that future code should follow
- /agile-workflow:refactor-design is the right entry point — discovery mode to find sync surfaces, then per-surface story decomposition

## Design decisions
*(captured 2026-05-24 via `feature-design --only-questions --all`. These lock in directional choices so the full design pass + per-surface refactor-design pass inherit them. Note: this feature carries `[refactor]` tag — user explicitly opted to include it in this pass alongside its sibling chat-UX features so the visual pattern is aligned across all three.)*

- **Canonical optimistic-state visual**: Immediate commit + subtle pending pip. The triggering affordance doesn't disable or shape-shift. A tiny pip / dot indicator appears beside it: `[ Generate quiz ↑ • ]`. On success the pip vanishes (+ result appears wherever it lands). On failure the pip turns into `⚠` — click reveals retry. Feels native, never hijacks the affordance with a loading state.
- **Failure surfacing tier 1 (always)**: Inline at the affordance. The `⚠` indicator + click-to-retry sits where the action was triggered. User sees the failure in context.
- **Failure surfacing tier 2 (escalation)**: If the inline failure goes unattended for ~30s (or the user navigates away from the surface), the activity strip picks it up as a persistent notification. Two-tier so transient quick-recovery failures don't pollute the strip; lingering errors get a second chance to surface.
- **Retry model**: One-click retry from the failed-state UI. The action's dispatch params are captured at click-time so retry doesn't need any user re-input. Single source-of-truth pattern: retry uses the exact same dispatch path as the original click.
- **Auto-retry policy**: Not in v1. All retries are explicit user-driven for now. Revisit if production logs show high transient-error rates that punish the user with manual retry friction.
- **Pattern scope**: Establishes a reusable hook/component pair (working name: `useOptimisticAction` + `<PendingIndicator>` / `<FailedIndicator>`) that every catalogued sync-await surface refactors to. Pattern skill written under `.claude/skills/patterns/optimistic-dispatch.md` once the third refactor lands and the shape is proven.

## Mockups
*Rebuilt 2026-05-24 using the `ux-ui-design` plugin's conventions properly — `.flow-hybrid` chrome (matches the topology: sequential walk + jump-anywhere), links `tokens.css` + `motion.css` + `components.css`, action-card reframed from confusing "Generate quiz items" to the canonical "Save as flashcards" user-initiated commit pattern, motion uses locked tokens with no squash/overshoot (respects the Productive attitude in `motion.css`), and `prefers-reduced-motion` collapses all custom animations.*

- Inherits design system: `.mockups/design-system/{tokens,motion,components}.css`
- Flow · fully interactive at `.mockups/flows/async-chat-interactions/` (also linked from `.mockups/flows/index.html`):
  - `index.html` — flow navigator + canonical-pattern principle box + state-glyph legend + enumerated components-used reference
  - `01-composer-queue.html` — interactive: type, send during streaming, queue grows as `.chat-turn--queued` ghost bubbles, edit/remove per item, Esc or Stop aborts via `.composer__send--stop`
  - `02-question-submit.html` — interactive: BOTH single-select (`.inline-question__indicator--radio`) AND multi-select (`.inline-question__indicator--check` + `select all that apply` badge) in one scenario; each submits to a `.thread-chip`; try `clarify in chat` on the other to see `.thread-chip--dismissed`
  - `03-action-card-pending.html` — interactive: tutor produces 4 practice items; `.action-card` offers to commit them as flashcards; click triggers `.action-pip--pending`; result lands as confirmation card; button never disables
  - `04-failed-retry.html` — interactive: same `.action-card` rigged to fail first time; `.action-pip--failed` clickable opens `.failure-popover` with retry; second attempt succeeds
  - `05-strip-escalation.html` — interactive: dispatch fails; do nothing; after 6s (compressed from production 30s) `.status-strip--active` slides down with the failed item; retry / dismiss from strip
- Components added to `.mockups/design-system/components.css` (refinement mode, additive):
  - `.action-card` + `__body` (+ `__label` / `__title`) + `__action` — canonical in-chat user-initiated affordance
  - `.action-pip` + `--show` + `--pending` / `--success` / `--failed` / `--retrying` modifiers — NO squash/overshoot (locked Productive attitude); only opacity + color transitions; size is constant
  - `.failure-popover` + `__label` / `__reason` / `__actions` — anchored to `.action-card__action`
  - `.status-strip` + `--active` + `__pip` / `__label` / `__text` — mock-side mirror of production `<StatusStrip>`
  - Shared keyframes `chat-pulse`, `chat-fade-in`, `chat-rise-in` — compositor-cheap (opacity + translate only), all wrapped in `@media (prefers-reduced-motion: reduce)` opt-out. Note: streaming text uses `.chat-turn__streaming-tail` (fade-in per new chunk) rather than a blinking cursor — the persistent in-flight signal is the pulsing dot on `.chat-turn__streaming`, not a caret on the body text.
- Pattern skill candidate: `.claude/skills/patterns/optimistic-dispatch.md` — write after the third per-surface refactor lands and the shape is proven (per `Pattern scope` in Design decisions).

## Refactor Overview

The audit (2026-05-24) found **36 sync-await call sites** across the chat-bearing UI, against **1 fire-and-forget** (`client.drafts.events()` streaming subscription). Zero of the canonical `.action-card` / `.action-pip` primitives exist in production code today — they're only in mocks. The single existing `ActivityRegistry` producer is `IndexerOrchestratorImpl`.

The refactor proceeds in seven dependent steps. Step-1 builds the canonical primitives + the shared `useOptimisticAction` hook (everything else uses it). Step-2 generalizes the failure-escalation pattern (from `useFailedEscalation` in `feature-composer-async-behavior`) into a reusable `useActionEscalation`. Steps 3–7 are per-surface refactors against the primitives. Step-8 writes the codified pattern doc once three surfaces have landed and the shape has proven itself.

By priority:
- **HIGH** — assignment-submit (3 files), course-materialize button (course-create-tab-body)
- **MEDIUM** — document-attach per-row, selection-bar capture (notes/cite/flashcards)
- **LOW** — author mutations (prompt edits, lesson updates, gate overrides — less visible to students)

Out-of-scope (handled by sibling features in this epic): composer send (`feature-composer-async-behavior`), structured-question submit (`feature-question-panel-rework`), math render (`feature-math-rendering` in the educational-content epic).

## Refactor Steps

### Step 1: Canonical primitives + `useOptimisticAction` hook
**Priority**: High
**Risk**: Low (additive)
**Files**:
- `packages/ui/src/components/markdown-content.module.css` (or sibling — the in-chat primitives CSS file): `.action-card`, `.action-pip` (+ `--show`/`--pending`/`--success`/`--failed`/`--retrying` modifiers), `.failure-popover` (+ `__label`/`__reason`/`__actions`)
- `packages/ui/src/components/action-card.tsx` (NEW): `<ActionCard>` shell composing `__body` + `__action` slots
- `packages/ui/src/components/action-pip.tsx` (NEW): `<ActionPip state>` indicator
- `packages/ui/src/components/failure-popover.tsx` (NEW): anchored popover for retry / dismiss
- `packages/ui/src/hooks/use-optimistic-action.ts` (NEW): the shared hook
**Story**: `feature-refactor-async-chat-interactions-audit-step-1-canonical-primitives`

```typescript
// useOptimisticAction.ts
export type ActionState = "idle" | "pending" | "success" | "failed" | "retrying";

export interface UseOptimisticActionOpts<TParams> {
  dispatch: (params: TParams) => Promise<void>;
  onSuccess?(): void;
  onError?(err: unknown): void;
  resetSuccessAfterMs?: number;  // default 800ms (pip flashes then vanishes)
}

export interface UseOptimisticActionResult<TParams> {
  state: ActionState;
  errorReason?: string;
  trigger(params: TParams): void;     // captures params at click-time
  retry(): void;                       // re-dispatches with captured params
  dismiss(): void;                     // failed → idle
}

export function useOptimisticAction<TParams>(
  opts: UseOptimisticActionOpts<TParams>,
): UseOptimisticActionResult<TParams>;
```

**Implementation notes**:
- Hook captures the dispatch params on `trigger` into a ref so `retry` replays the same params.
- State machine: `idle → pending → (success | failed)`; `failed → retrying → (success | failed)`.
- `errorReason` extracted via existing project error-message helper.
- Components are dumb presentational — state lives in the hook.
- `<ActionCard>` composes children into `__body` and `__action` slots; styling per the locked mockup at `.mockups/screens/feature-composer-async-behavior/state-failed-retry.html` and `.mockups/flows/async-chat-interactions/03-action-card-pending.html`.
- `<ActionPip>` is just `<span class="action-pip action-pip--<state>" />` — visibility controlled by `--show`.
- `<FailurePopover>` anchors to the trigger affordance and shows retry + dismiss actions.

**Acceptance criteria**:
- [ ] `.action-card`, `.action-pip`, `.failure-popover` CSS in production with token references
- [ ] Three React components shipped with prop interfaces from mockup conventions
- [ ] `useOptimisticAction` hook with documented state machine
- [ ] Hook tests (`__tests__/use-optimistic-action.test.ts`): trigger → pending; success → idle after timeout; failed → state preserved; retry replays captured params
- [ ] Component tests: per state + click handlers
- [ ] All motion via tokens (no hardcoded transitions); respects `prefers-reduced-motion`

**Rollback**: pure-additive — revert the new files.

---

### Step 2: `useActionEscalation` — generalize failure escalation
**Priority**: High
**Risk**: Low (mirrors existing pattern)
**Files**:
- `packages/ui/src/hooks/use-action-escalation.ts` (NEW)
**Story**: `feature-refactor-async-chat-interactions-audit-step-2-action-escalation`

```typescript
export function useActionEscalation(opts: {
  failedActions: ReadonlyArray<{ id: string; label: string; failedAt: number }>;
  activity?: ActivityRegistryClient | null;
  thresholdMs?: number;  // default 30_000
}): void;
```

**Implementation notes**:
- Mirrors `useFailedEscalation` from `feature-composer-async-behavior` (Unit 6), but generalized over any optimistic-action failures, not just pending messages.
- Per-failed-action timer; escalate to activity strip after threshold.
- The composer's `useFailedEscalation` can become a thin wrapper around `useActionEscalation` post-landing (small follow-on); not part of this story.

**Acceptance criteria**:
- [ ] Hook implemented matching the documented signature
- [ ] Tests using `vi.useFakeTimers()` (per slow-test-gating pattern)
- [ ] Threshold timing, retry-cancels-timer, unmount-cleanup, re-failure-reschedules
- [ ] No-op when `activity` is undefined

**Rollback**: pure-additive.

---

### Step 3: Assignment submit refactor (HIGH priority — 3 files)
**Priority**: High
**Risk**: Medium (assignment submit is critical path; needs careful regression coverage)
**Files**:
- `packages/ui/src/components/assignment-card.tsx:71,81`
- `packages/ui/src/components/quiz-tab-body.tsx:127,135`
- `packages/ui/src/components/homework-tab-body.tsx:167,175`
- (and exam-tab-body if structurally identical)
**Story**: `feature-refactor-async-chat-interactions-audit-step-3-assignment-submit-async`

**Current State**: `handleSubmit` awaits `client.sketches.put()` then awaits `client.assignments.recordResponse()` sequentially. UI frozen for the duration.

**Target State**: `handleSubmit` calls `useOptimisticAction.trigger({ sketchData, response })`. The dispatch function chains the two IPC calls in the background. Submit button shows `<ActionPip>` next to it via the hook's state. On failure, `<FailurePopover>` anchors to the submit button with retry.

**Implementation notes**:
- One hook instance per assignment-card / tab-body — each owns its dispatch params + state.
- Preserve any post-submit navigation behavior (e.g., advance to next item) inside `onSuccess` callback.
- Tests: existing assignment-submit tests update to mock the hook; new test verifies pending-pip appears on click + vanishes on settle.

**Acceptance criteria**:
- [ ] All three files refactored to use `useOptimisticAction`
- [ ] Submit button never disables; pip shows in-flight state
- [ ] Sketch + recordResponse run in background
- [ ] Existing functionality preserved (test coverage same)
- [ ] Failure → inline `<FailurePopover>` → retry replays the same dispatch params

**Rollback**: per-file revert (each is independent).

---

### Step 4: Course-materialize confirmation pip
**Priority**: High
**Risk**: Medium (affects course-create flow)
**Files**:
- `packages/ui/src/components/course-create-tab-body.tsx` (lines 135, 215-227)
**Story**: `feature-refactor-async-chat-interactions-audit-step-4-course-materialize-pip`

**Current State**: `setConfirming(true)` text change on the button; minimal feedback until `finalized` event arrives via draft-events stream.

**Target State**: Button uses `useOptimisticAction` against the `course.confirm_draft` dispatch flow. Pip stays in pending state until the `finalized` event arrives via existing draft-events stream → `onSuccess` callback opens the teach session.

**Implementation notes**:
- Wire the success transition from the existing `useEffect` that watches draft-events — when finalized fires, call `actionHook.onSuccess` equivalent (may need a `setSuccess()` method on the hook).
- If the hook doesn't currently expose a way to externally complete (it currently sets success internally on dispatch resolution), extend the hook with an `externalSettle(state: "success" | "failed", reason?: string)` method.

**Acceptance criteria**:
- [ ] Confirm button uses `useOptimisticAction` with external-settle wiring
- [ ] Pending pip shows from click until `finalized` event arrives
- [ ] Success transition opens session in tab (existing behavior)
- [ ] Button doesn't disable
- [ ] Test: simulate finalized event arrival → pip transitions success → session opens

**Rollback**: single-file revert.

---

### Step 5: Document attach per-row pip
**Priority**: Medium
**Risk**: Low
**Files**:
- `packages/ui/src/components/library-document-picker.tsx:118`
**Story**: `feature-refactor-async-chat-interactions-audit-step-5-document-attach-pip`

**Current State**: `await client.documentScopes.attach()` per row. Row blocks until attach completes.

**Target State**: One `useOptimisticAction` per row (or a single shared hook keyed by document id). Pip on the attach button; optimistic update to local attached set immediately.

**Implementation notes**:
- Optimistic update: add doc id to `attachedSet` state on click; if attach fails, remove and show retry.
- Simpler shape: one `useOptimisticAction` per row, scoped to that row's button.

**Acceptance criteria**:
- [ ] Per-row attach uses `useOptimisticAction`
- [ ] Optimistic state shows the doc as attached before dispatch resolves
- [ ] Pip shows on the attach button per row
- [ ] Failure → inline retry on the same row
- [ ] Existing attach behavior preserved on success

**Rollback**: single-file revert.

---

### Step 6: Selection-bar capture (notes / citations / flashcards)
**Priority**: Medium
**Risk**: Low
**Files**:
- `packages/ui/src/components/document-tab-body.tsx:254, 271, 286`
**Story**: `feature-refactor-async-chat-interactions-audit-step-6-selection-bar-async`

**Current State**: Three separate `await` calls in the selection action handlers. Selection bar locks during each.

**Target State**: Each selection action uses `useOptimisticAction`. Bar dismisses immediately on click; pip + toast surfaces settle / failure asynchronously via status strip (per the two-tier failure pattern).

**Implementation notes**:
- The selection bar disappears on click (existing behavior); the pip + escalation happens via `useActionEscalation` for any post-bar failure.
- Three independent hooks (note / cite / flashcard) — each captures its own dispatch params.

**Acceptance criteria**:
- [ ] All three selection actions refactored to use `useOptimisticAction`
- [ ] Selection bar dismisses immediately on click (UI never blocks)
- [ ] Success silently completes; failure surfaces in status strip after threshold
- [ ] Existing capture behavior preserved

**Rollback**: single-file revert.

---

### Step 7: Author mutations sweep (prompt / lesson / gate)
**Priority**: Low
**Risk**: Medium (cluster of unrelated mutations)
**Files**:
- `packages/ui/src/components/prompt-block-stack.tsx` (lines 115, 132, 152, 158, 164)
- `packages/ui/src/components/lesson-editor.tsx` (lines 44, 64, 66)
- `packages/ui/src/components/gate-inspector.tsx` (lines 93, 111, 117, 119)
- `packages/ui/src/components/memory-inspector-tabs.tsx` (lines 32, 51, 74, 81)
- `packages/ui/src/components/tool-call-entry.tsx` (line 90 — restoreAction)
- `packages/ui/src/components/attributed-preview-pane.tsx` (line 32)
**Story**: `feature-refactor-async-chat-interactions-audit-step-7-author-mutations-pip`

**Current State**: Author panel mutations are all sync-await. Editor blocks until mutation completes.

**Target State**: Each mutation uses `useOptimisticAction`. Inline pip on the trigger affordance; failure shows inline retry.

**Implementation notes**:
- Larger surface but mechanical. Group commits per file to keep diffs reviewable.
- Configurator surfaces are less visible to students — accept lower priority but include in the audit completion.
- Verify modal-dismissal semantics: some mutations dismiss the modal on success; preserve that via `onSuccess` callback.

**Acceptance criteria**:
- [ ] All 6 listed files refactored to use `useOptimisticAction`
- [ ] Per-mutation pip on the trigger button
- [ ] Modal-dismissal-on-success preserved where applicable
- [ ] Failure → inline retry
- [ ] Existing author tests pass

**Rollback**: per-file revert.

---

### Step 8: Codify the pattern — `optimistic-dispatch.md` skill
**Priority**: Medium (documentation)
**Risk**: Low (additive doc)
**Files**:
- `.claude/skills/patterns/optimistic-dispatch.md` (NEW)
- `.claude/rules/patterns.md` (index update)
**Story**: `feature-refactor-async-chat-interactions-audit-step-8-pattern-doc`

**Implementation notes**:
- Write after at least 3 per-surface refactors have landed (per the locked design decision) — i.e., after steps 3, 4, 5 are done.
- Document: when to apply, file:line examples from the landed refactors, the state machine, the escalation policy, the retry semantics, the canonical hook signature.
- Index update: add entry to `.claude/rules/patterns.md` under a new "Async dispatch patterns" section.

**Acceptance criteria**:
- [ ] Pattern doc covers signature, when-to-apply, examples, gotchas
- [ ] Patterns index updated
- [ ] At least 3 per-surface refactors referenced as canonical examples

**Rollback**: doc-only revert.

---

## Implementation Order

1. **step-1-canonical-primitives** (deps: `[]`)
2. **step-2-action-escalation** (deps: `[step-1]`)
3. **step-3-assignment-submit-async** (deps: `[step-1, step-2]`) — HIGH
4. **step-4-course-materialize-pip** (deps: `[step-1, step-2]`) — HIGH
5. **step-5-document-attach-pip** (deps: `[step-1, step-2]`) — MED
6. **step-6-selection-bar-async** (deps: `[step-1, step-2]`) — MED
7. **step-7-author-mutations-pip** (deps: `[step-1, step-2]`) — LOW
8. **step-8-pattern-doc** (deps: `[step-3, step-4, step-5]`)

Parallel-friendly after step-1+2 land: steps 3-7 fan out; step-8 waits for 3 surfaces done.

## Risks (cross-step)

- **`useOptimisticAction` hook scope creep**. Easy to over-engineer the state machine. Mitigation: keep the v1 surface minimal (idle / pending / success / failed / retrying); resist queueing or batching features until a surface actually needs them.

- **Coordination with composer feature's `useFailedEscalation`**. Step-2's `useActionEscalation` should subsume the composer's escalation hook. If composer feature lands first, expect a small follow-on cleanup PR; if this lands first, composer feature uses `useActionEscalation` directly. Coordinate via shared file path comments.

- **Per-surface tests need regression coverage**. Each refactored surface's existing tests must continue to pass; ADD a new test asserting "click does NOT lock the affordance." Don't ship a refactor that quietly removes existing assertions.

- **Action-card / failure-popover positioning**. Anchoring the popover to the trigger requires DOM/style coordination. Mitigation: use a small portal helper or a CSS-only anchor (popover API or `position-anchor` if supported in Electron's Chromium version — check first).

- **Author-mutation modal dismissal**. Some mutations currently dismiss the modal on success. Refactor must preserve that via `onSuccess`. Skipping = regression. Mitigation: per-file checklist of modal-dismissal contracts before refactoring.

## Implementation summary + Review (2026-05-25)

**All 8 child stories shipped via 4 consolidated orchestrator waves (per user's consolidation guidance):**

- **Wave 1** (1 agent, commit `e12402aa`): step-1 + step-2 — canonical primitives + escalation hook
- **Wave 2A** (1 agent, commit `01a967f4`): step-3 + step-4 + step-5 — HIGH priority surfaces (assignment-submit + course-materialize + document-attach)
- **Wave 2B** (1 agent, commit `5a7ebe1b`): step-6 + step-7 — MED+LOW surfaces (selection-bar + author mutations sweep)
- **Wave 3** (1 agent): step-8 — pattern doc codification

**Architectural achievements**:
- `useOptimisticAction` + `useActionEscalation` + `<ActionCard>`/`<ActionPip>`/`<FailurePopover>` shipped as production-ready canonical primitives
- 12 sync-await UI surfaces converted to optimistic-dispatch pattern
- `optimistic-dispatch` pattern doc at `.claude/skills/patterns/` codifies the shape for future surfaces
- Two-tier failure pattern (inline → strip after threshold) generalized across all surfaces

**Smart per-surface judgment** documented throughout — modal-owned destructive operations KEPT raw, reactive data fetches NOT converted, hooks-in-loop solved via sub-component extraction. No mechanical over-application of the pattern.

**Verdict**: Approve

**Blockers**: none / **Important**: none / **Nits**: none

**Notes**: All 8 child stories individually reviewed + approved. Feature-level capability check: end-to-end pattern works across 12 surfaces; no more UI-locking sync-awaits in chat-bearing surfaces (modulo intentional kept-raw operations); failures degrade gracefully when activity registry is null. Parent epic `epic-chat-interaction-ux-overhaul` will have all 3 children done after this — epic should advance to review + done + archive.

What's now possible: every UI affordance triggering engine/IPC work follows the optimistic-dispatch pattern. Future surfaces compose against `useOptimisticAction` + primitives + pattern doc. The complete chat-UX async overhaul is shipped — composer never blocks, questions dismiss immediately, assignment submits stay interactive, document attaches optimistically, selection actions surface failures via strip, author mutations show inline pips.
