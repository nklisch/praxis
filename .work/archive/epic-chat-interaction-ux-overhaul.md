---
id: epic-chat-interaction-ux-overhaul
kind: epic
stage: done
tags: [ui, ux]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-25
---

# Chat-interaction UX overhaul: never block waiting on the chat round-trip

## Brief
The current chat-interaction surfaces (composer, structured-question card, quick-check card, ad-hoc "ready to materialize"-style buttons) all gate the UI on the tutor's in-flight round-trip — locking sends, greying cards, freezing buttons until the model finishes. This contradicts the project's standing "UI never blocks" principle (`docs/UX.md` cross-cutting interaction patterns) and turns a conversational tutor into a strict request/response gate. The epic reshapes every in-chat affordance so the UI updates optimistically on click, queues subsequent work behind in-flight turns, exposes cancel where appropriate, and surfaces failures asynchronously rather than freezing.

## Decomposition
Pre-decomposed at scope time (the cluster-confirmation gate served as the epic-design decomposition). Three child features:

1. **`feature-composer-async-behavior`** — composer-specific: send stays active during in-flight turns (queue), send transforms into cancel during in-flight, AbortSignal wired to the running engine turn. Smallest scope, well-bounded.
2. **`feature-question-panel-rework`** — the structured-question / quick-check card cluster: paged display when multiple questions are in flight, dismiss-on-submit (no greyed-out wait through the round-trip), free-form answer fallback, explicit cancel-to-clarify-in-chat escape hatch, tool description discouraging "tell me in chat" as a structured option. Three child stories under this feature, one of which is a bug fix.
3. **`feature-refactor-async-chat-interactions-audit`** — `[refactor]`-tagged cross-cutting sweep: catalogue every UI surface that interacts with the chat / engine layer, classify sync-await vs fire-and-forget, refactor the sync ones to the uniform async pattern. Catches everything outside the two specific surfaces above (the "ready to materialize" button and any others).

Children declared independent (no `depends_on` between them) — each feature can be designed and shipped on its own cadence. The audit feature will likely surface follow-on items that depend on the composer/question features being done first; that's resolved at feature-design time, not at scope.

## Foundation-doc roll-forward
`docs/UX.md` rolled forward as part of this scope commit:
- Composer description (teach modality body): explicitly says the composer never locks during in-flight turns, queues messages, and exposes a cancel control.
- Quick-check "Locked state" → "Resolved state": dismisses to historical message immediately on submit, no greyed-out wait through the round-trip; tutor's next message follows asynchronously.
- Quick-check "Multiple in-flight checks": paged display (one at a time with `next`/`prev`/`n of m`) instead of stacked.
- Structured question cards: same dismiss-on-submit + paged display; adds free-form answer field, `clarify in chat` cancel control, and the tool-description rule against "tell me in chat" as a structured option.
- Cross-cutting interaction patterns: new "Chat round-trips never gate user input" principle extending the existing "UI never blocks" principle to in-conversation interactions, not just background streams.

The rolled-forward UX.md is the locked direction for epic-design / feature-design. Specific UI patterns (queue visualization, cancel iconography, paged surface chrome) are feature-design calls.

## Source ideas (absorbed)
- `idea-composer-queue-and-cancel` → `feature-composer-async-behavior`
- `idea-async-chat-interactions-audit` → `feature-refactor-async-chat-interactions-audit`
- `idea-questions-tabbed-display` → child story under `feature-question-panel-rework`
- `idea-user-question-no-dismiss-on-submit` → child story under `feature-question-panel-rework` (bug)
- `idea-question-free-answer-and-cancel-path` → child story under `feature-question-panel-rework`

## Design-system decisions (locked 2026-05-24)

These cut across the three child features and are pinned at the epic level so each feature's design pass inherits them.

- **No streaming cursor.** The blinking-caret pattern (`▍`) was removed from the chat-turn body. The persistent "in-flight" signal lives on the speaker line as `.chat-turn__streaming` (pulsing dot + label). The text body itself carries no perpetual animation. Rationale: terminal-style chrome competes with the editorial voice of Studio Quiet; locked Productive motion attitude in `motion.css` rejects perpetual body-text motion.
- **Streaming feel: per-chunk fade-in.** Each new chunk of arriving text wraps in `.chat-turn__streaming-tail`; the span fades opacity 0 → 1 over `--dur-ambient` (480ms) using `--ease-standard`. Once settled the wrapper can be unwrapped (or just left — opacity 1 is visually neutral). Reads as someone "thinking and writing", per `docs/UX.md` § "Streaming with intercept and easing".
- **Streaming pace target: ~120ms / word chunk.** The production streaming hook's ring-buffer release schedule should target a ~120ms cadence releasing word-sized chunks (matched against the gentle 480ms fade so chunks visibly settle between releases). A/B explored in `.mockups/design-system/streaming.html` across 7 pace × 7 fade-style combinations on 2026-05-24; this combination chosen as the standing direction.
- **Unified chat surface across contexts.** Every chat-bearing surface (teach, course-create, configure, future sidebar tutor) wraps content in `.chat-surface` + `--wide` / `--medium` / `--narrow` modifier. Components inside (`.chat-turn`, `.composer`, `.inline-question`, `.action-card`, `.status-strip`) adapt via `@container` queries against the surface — zero per-context overrides. Reference: `.mockups/screens/feature-composer-async-behavior/responsive-showcase.html` and `.mockups/screens/feature-question-panel-rework/responsive-showcase.html`.
- **In-chat optimistic-dispatch pattern (canonical).** Any in-chat affordance that triggers engine work uses `.action-card` + `.action-pip` (states: pending / success / failed / retrying). Failure surfacing is two-tier: inline at the affordance first, escalating to `.status-strip` after ~30s unattended. Retry uses the same dispatch params (captured at click-time). No squash/overshoot on pip transitions — locked Productive motion attitude. See `.mockups/flows/async-chat-interactions/index.html`.

## Standing design-system artifacts

- `.mockups/design-system/components.css` § Tier-2 chat-surface — every chat primitive, single source of truth
- `.mockups/design-system/streaming.html` — interactive standardized showcase of the streaming pattern (with the chosen direction marked at top)
- `.mockups/design-system/components.html` § Chat surface — every chat component in every state, rendered with motion live

## Implementation summary + Review (2026-05-25)

**All 3 child features shipped to done:**

1. `feature-composer-async-behavior` (7 stories) — Composer Send↔Stop morph + queue failure-state in `usePendingQueue` + `<QueuedMessageBubble>` + send-error wiring + `useFailedEscalation` hook + per-tab-body integration + examLockdown gate. 1 follow-up parked (`idea-resolve-composer-queue-vs-stop-affordance-conflict` — Enter-during-streaming-as-noop tension).

2. `feature-question-panel-rework` (3 stories) — `<ThreadChip>` (dismiss-on-submit) + `<InlineQuestionSet>` paged chassis + free-form textarea + clarify-in-chat cancel + tool-description guardrail rejecting 7 chat-deflection patterns. 1 follow-up parked (`idea-wire-inline-question-set-in-chat-tab-body` — N>1 detection routing deferred).

3. `feature-refactor-async-chat-interactions-audit` (8 stories) — `.action-card`/`.action-pip`/`.failure-popover` canonical primitives + `useOptimisticAction` hook + `useActionEscalation` hook + 12 surfaces converted to optimistic dispatch (assignment-submit, course-materialize, document-attach, selection-bar, author mutations) + `optimistic-dispatch` pattern doc codified.

**Epic-level lenses** (per review skill Phase 5):

- **Design alignment**: realized decomposition matches the epic brief — composer + question-card + cross-cutting audit. The audit feature shipped the foundational primitives that the composer + question-card features could have used (but those features ran in parallel and built their own escalation hooks). Documented follow-up: `useFailedEscalation` (composer) can become a thin wrapper over `useActionEscalation` (audit) — small cleanup, non-blocking.

- **Foundation-doc alignment**: `docs/UX.md` rolled forward as planned in the scope commit — "Chat round-trips never gate user input" principle now enforced across every catalogued surface.

- **Breaking changes**: `disabled` prop removed from `<Composer>`; existing callers updated in-tree. Optimistic-dispatch primitives are additive.

- **Capability completeness end-to-end**: 12+ UI surfaces no longer block on chat / IPC round-trips. Composer never disables during streaming. Questions dismiss to chips immediately on submit. Assignment submits stay interactive with pip feedback. Document attaches optimistically. Selection actions surface failures via strip after threshold. Author mutations show inline pips. The "UI never blocks" principle is now structurally enforced via the optimistic-dispatch pattern.

**Verdict**: Approve

**Blockers**: none
**Important**: 3 follow-ups parked across child features (all in backlog):
- `idea-resolve-composer-queue-vs-stop-affordance-conflict` (composer)
- `idea-wire-inline-question-set-in-chat-tab-body` (question-panel)
- (implicit) `useFailedEscalation` → `useActionEscalation` cleanup (composer ↔ audit hook unification)

**Nits**: none

**Notes**: Epic delivered as briefed. 18 child stories shipped across 3 features. The optimistic-dispatch pattern is now codified at `.claude/skills/patterns/optimistic-dispatch.md` and the index updated — future agents working on async-dispatch surfaces have a clean reference.

What's now possible: the chat-interaction UX overhaul is complete. Every catalogued UI surface that triggers chat / IPC work follows the optimistic-dispatch pattern. The "UI never blocks" principle is structurally enforced, not just documented. The pattern can be applied to any future surface via `useOptimisticAction` + `<ActionPip>` + `useActionEscalation`.

**No release_binding** + **parent: null** → epic archives on advance per Phase 8.
