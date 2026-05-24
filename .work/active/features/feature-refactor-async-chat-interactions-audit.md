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
