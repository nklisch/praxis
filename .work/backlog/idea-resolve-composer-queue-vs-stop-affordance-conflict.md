---
id: idea-resolve-composer-queue-vs-stop-affordance-conflict
kind: idea
stage: parked
tags: [ui, ux, design-question]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Resolve composer queue-during-streaming vs Stop button affordance conflict

## Brief
Surfaced during `feature-composer-async-behavior-step-7-integration` (commit `afeccb26`). The feature design has an internal tension:

1. **Parent feature intent**: "Composer never disables. Additional messages typed during an in-flight response queue and dispatch in order behind the active turn." (per `epic-chat-interaction-ux-overhaul` foundation)

2. **Step-2 implementation** (per `feature-composer-async-behavior-step-2-stop-button` spec): "Enter-to-send: only fires when `value` non-empty AND `isStreaming === false`. Enter during streaming does nothing (Stop is explicit, never accidental)."

These contradict. With the Send button morphed to Stop during streaming + Enter being a no-op during streaming, there's NO user-reachable affordance to trigger queuing from the composer UI. The queue infrastructure (`usePendingQueue`, `<QueuedMessageBubble>`, etc.) all works at the hook level — it's just unreachable from typing+sending in the composer during streaming.

## Possible resolutions

1. **Add a separate "Queue" affordance** during streaming — alongside Stop, a small "Queue" button or pip that catches click-to-queue (and maybe Shift+Enter). Keeps Stop as primary (most-likely intent during streaming = cancel).

2. **Enter-to-queue during streaming** — relax the step-2 noop. Enter sends-or-queues based on isStreaming. Stop button only fires on explicit button click. Slightly less safe (accidental Enter while tutor streams → queues a message), but matches the foundation's "Composer never blocks" intent more directly.

3. **Send button stays "Send" during streaming, Stop moves elsewhere** — e.g., Stop as a chip on the streaming tutor turn or in the status row. Breaks step-2's "same DOM element morphs" pattern but resolves the conflict cleanly. The Composer becomes purely about composition; Stop becomes about controlling the in-flight tutor turn, semantically separate.

4. **Accept the limitation** — document that composer-during-streaming queuing is reachable only programmatically (e.g., spawn-from-passage flows already use the queue mechanism). The "type during streaming" affordance becomes a future enhancement.

## Recommendation
Option 2 or option 3. Option 2 is the smaller change but introduces accidental-queue risk. Option 3 is structurally cleaner — separates "compose a message" (composer) from "control the in-flight turn" (Stop chip on the streaming turn itself).

## Origin
- Story: `feature-composer-async-behavior-step-7-integration` (commit `afeccb26`)
- Documented in story implementation notes under "Composer queue limitation"
