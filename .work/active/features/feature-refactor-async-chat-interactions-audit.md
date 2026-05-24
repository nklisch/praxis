---
id: feature-refactor-async-chat-interactions-audit
kind: feature
stage: drafting
tags: [ui, refactor]
parent: epic-chat-interaction-ux-overhaul
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
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
  - Shared keyframes `chat-pulse`, `chat-blink`, `chat-rise-in` — compositor-cheap (opacity + translate only), all wrapped in `@media (prefers-reduced-motion: reduce)` opt-out
- Pattern skill candidate: `.claude/skills/patterns/optimistic-dispatch.md` — write after the third per-surface refactor lands and the shape is proven (per `Pattern scope` in Design decisions).
