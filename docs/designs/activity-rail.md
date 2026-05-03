# Design: Activity rail — ambient progress for long-running work

## Overview

Replace the blocking `IngestionProgress` modal with a single ambient progress surface — the **activity rail** — anchored to the bottom of the app chrome. While work is happening (a textbook is being read, the explorer is mapping concepts, math tools are warming up), the rail shows one editorial line per activity. While nothing is happening, the rail is invisible and the chrome reserves no space.

This delivers what `docs/UX.md` already promised but didn't implement: *"All long-running operations stream progress via the transport. The UI never blocks on a long operation."* (UX.md:580)

### Editorial constraints carried forward

Per `docs/VISION.md` and `docs/UX.md`:

- **No notification bells, badges, dopamine-tap surfaces.** The rail is *informational presence*, not an attention-grabber. No red dot, no "1 new" counter, no chime. (VISION.md:63, UX.md:38, UX.md:293)
- **Editorial typography.** Italic display serif body, optional uppercase mono kicker, ornament glyphs (`°`) instead of icons. Same typographic language as the Library and the chat workspace.
- **Quiet on idle.** The rail is hidden when there's nothing to show — no "Activity (0)" placeholder, no permanent footer that just says "ready". (UX.md:38, "anti-notification.")
- **Friendly, non-technical labels.** `reading sullivan algebra & trigonometry` — not `IngestionTask#127`. `preparing math tools` — not `Pyodide.preload pending`. Producers craft the label; the rail just renders.

### What ships

- `ActivityRegistry` server-side service that producers report to.
- IPC streaming channel `praxis.activity.events.*` so the renderer subscribes.
- `useActivity` renderer hook + `<ActivityRail>` component, slotted into the root layout once.
- Producer integrations for **all** long-running work the user picked: ingestion, bootstrap explorer, indexer runs, Pyodide preload, embeddings preload.
- The blocking `IngestionProgress` modal is deleted.
- `before-quit` aborts every running activity cleanly — no zombie streams, no resume.

### What's out of scope

- Persistent activity history across launches. On exit, in-flight items are cancelled and the rail is empty on next boot.
- Per-activity cancel UX from the rail (clicking an item to abort). The rail is read-only for now; cancelling ingestion still requires whatever the producer's own affordance is (today: just navigating away of the picker — the underlying IPC abort already wires up).
- Multi-user / multi-student activity scoping. The single-student v1 model means activity is per-process; no scoping needed.

---

## Architecture

```
PRODUCERS (in-process callers — services that do long-running work)
  IngestionService.ingest()              ─┐
  BootstrapServiceImpl.runExploration()  ─┤
  IndexerOrchestratorImpl                ─┼──► ActivityRegistry.start(...)
  PyodideHost.preload()  (via boot)      ─┤      .update(patch)
  WorkerEmbeddingService.preload() (boot) ─┘      .finish(status)

REGISTRY (in @praxis/core/services)
  ActivityRegistry      — stores items, emits change events,
                           applies linger / quiet-period rules

IPC (in @praxis/desktop/electron/main)
  praxis.activity.events.start  — invoke (with streamId)
  praxis.activity.events.events.<streamId>  — push
  praxis.activity.events.cancel — signal

CLIENT (in @praxis/client)
  ActivityClient.events()  — AsyncIterable<ActivityEvent>

RENDERER (in @praxis/ui)
  useActivity()            — subscribes on mount; React state
  <ActivityRail>           — renders the bottom rail; slotted into rootRoute
                             once. Empty list → returns null (no chrome).
```

### Item lifecycle

```
   [hidden/quiet]                                     [hidden/dismissed]
        │                                                    ▲
        │ producer calls start()                             │ linger expires OR user dismisses
        │                                                    │
        ▼                                                    │
    "running" ──── update(...) ────┬─── finish("done")     ──┤
        │                          │                         │
        │ shutdown / signal abort  │                         │
        │                          └─── finish("failed",e) ──┤
        ▼                                                    │
    [removed]                                                │
                                                             │
                                        [done linger 4s] ────┘
                                        [failed linger 10s, dismissable] ─┘
```

- `quietPeriodMs` — if a producer sets it (e.g., indexers at 800ms), the item is hidden until either `quietPeriodMs` elapses while still `running`, OR it stays hidden permanently if it finishes before that. Quick work never blips.
- `lingerMs` — once `done`, item stays in the rendered list this long, then is removed. Default 4000ms. Failed items use `failedLingerMs` (default 10000ms) and offer a dismiss affordance.
- Reduced-motion (`prefers-reduced-motion`) — slide/fade is replaced with instant show/hide.

---

## Implementation Units

### Unit 1: Activity types

**File**: `packages/core/src/types/activity.ts` (new)

```typescript
import type { Timestamp } from "./common.js";

/**
 * One thing the system is doing, surfaced to the user via the activity rail.
 * Items have an editorial label written by the producer (e.g., "reading
 * sullivan algebra & trigonometry"); the rail does not synthesize copy.
 */
export interface ActivityItem {
  /** Stable id chosen by the producer; later updates target this id. */
  readonly id: string;
  /** Editorial-friendly user-facing string. Lowercase by convention. */
  label: string;
  /** Optional secondary line (e.g., "page 12 of 248"). */
  detail?: string;
  /** Optional progress; rendered as a hairline bar when present. */
  progress?: { value: number; total: number };
  status: "running" | "done" | "failed";
  startedAt: Timestamp;
  endedAt?: Timestamp;
  errorMessage?: string;
  /**
   * If set, the item stays HIDDEN from consumers (the rail) until it has
   * been `running` for this many ms. If finish() is called before then,
   * the item is removed without ever being rendered. Used by indexers
   * (default 800ms) so quick post-turn work doesn't blip the rail.
   */
  quietPeriodMs?: number;
  /**
   * How long to keep showing the item after `finish("done")` before
   * removing it. Producer can override; defaults applied by registry.
   */
  lingerMs?: number;
  /**
   * How long to keep showing the item after `finish("failed", ...)`
   * before removing it. Failed items also offer a dismiss affordance
   * regardless of this value.
   */
  failedLingerMs?: number;
}

/**
 * Discriminated event shape streamed from server to renderer. Rendererswap their
 * local Map<id, ActivityItem> by `kind`. `snapshot` is sent first when a
 * client subscribes so it sees the current state without having to wait
 * for the next change.
 */
export type ActivityEvent =
  | { kind: "snapshot"; items: readonly ActivityItem[] }
  | { kind: "added"; item: ActivityItem }
  | { kind: "updated"; item: ActivityItem }
  | { kind: "removed"; id: string };

export interface ActivityStartInput {
  /** Optional stable id; if omitted, the registry assigns a uuid v7. */
  id?: string;
  label: string;
  detail?: string;
  progress?: { value: number; total: number };
  quietPeriodMs?: number;
  lingerMs?: number;
  failedLingerMs?: number;
}

export interface ActivityUpdatePatch {
  label?: string;
  detail?: string;
  progress?: { value: number; total: number };
}

/**
 * Returned by `start()`. Producers hold this and report progress on it.
 * Cheap to throw away if the producer doesn't need to update — the
 * registry still tracks the item by its id.
 */
export interface ActivityHandle {
  readonly id: string;
  update(patch: ActivityUpdatePatch): void;
  finish(status: "done" | "failed", err?: { message: string }): void;
}

/**
 * Server-side port consumed by every long-running producer. Not transport-
 * coupled — `ActivityRegistryImpl` owns the in-memory store; the IPC layer
 * subscribes to this and forwards events to the renderer.
 */
export interface ActivityRegistry {
  start(input: ActivityStartInput): ActivityHandle;
  /** Snapshot of currently-visible items (post quietPeriod, pre-linger-expire). */
  list(): readonly ActivityItem[];
  /** Subscribe to add/update/remove. Returns an unsubscribe fn. */
  subscribe(listener: ActivityListener): () => void;
  /**
   * Drop a `done` or `failed` item early. No-op if id isn't visible or is
   * still `running`. The rail's per-item dismiss affordance calls this via
   * a thin IPC pass-through.
   */
  dismiss(id: string): void;
  /**
   * Mark all running items as `failed` with reason "shut down", clear the
   * registry, and notify subscribers. Called from `before-quit`. Producers
   * are responsible for stopping their own work via their own AbortSignals
   * — the registry doesn't own cancellation, only display.
   */
  shutdown(): void;
}

export type ActivityListener = (event: ActivityEvent) => void;
```

**File**: `packages/core/src/types/index.ts` (modify — add re-exports)

```typescript
// Append to the existing barrel
export type {
  ActivityEvent,
  ActivityHandle,
  ActivityItem,
  ActivityListener,
  ActivityRegistry,
  ActivityStartInput,
  ActivityUpdatePatch,
} from "./activity.js";
```

**Implementation Notes**:
- Discriminator field is `kind` (per the project's `discriminated-union-dispatch` pattern — `kind` for stored / transmitted shapes, `type` for streamed engine events).
- `ActivityItem.id` is `string`, not branded. There's no FK relationship to other entities; ids are produced fresh by callers or by the registry.
- `ActivityRegistry` is in `@praxis/core/types` because both server (registry impl) and renderer (via type-only client) need the shape. The runtime impl lives in services.

**Acceptance Criteria**:
- [ ] All five types exported from `@praxis/core/types`.
- [ ] No runtime code in `activity.ts` — types only.
- [ ] `import type { ActivityRegistry } from "@praxis/core/types"` resolves.

---

### Unit 2: `ActivityRegistryImpl`

**File**: `packages/core/src/services/activity-registry.ts` (new)

```typescript
import { v7 as uuidv7 } from "uuid";
import type {
  ActivityEvent,
  ActivityHandle,
  ActivityItem,
  ActivityListener,
  ActivityRegistry,
  ActivityStartInput,
  ActivityUpdatePatch,
  Logger,
  Timestamp,
} from "../types/index.js";

const DEFAULT_LINGER_MS = 4_000;
const DEFAULT_FAILED_LINGER_MS = 10_000;

export interface ActivityRegistryDeps {
  log: Logger;
  /** Wall-clock now provider (testable seam). */
  now?: () => number;
  /** setTimeout-shaped scheduler (testable seam). */
  setTimeout?: typeof globalThis.setTimeout;
  /** clearTimeout-shaped (testable seam). */
  clearTimeout?: typeof globalThis.clearTimeout;
}

export class ActivityRegistryImpl implements ActivityRegistry {
  private readonly items = new Map<string, ActivityItem>();
  private readonly listeners = new Set<ActivityListener>();
  /** Items in `running` whose `quietPeriodMs` has not yet elapsed. Hidden from emitters. */
  private readonly hidden = new Set<string>();
  /** Pending timers for quiet-period reveal + linger removal, by item id. */
  private readonly timers = new Map<string, NodeJS.Timeout>();

  private readonly now: () => number;
  private readonly setTimer: typeof globalThis.setTimeout;
  private readonly clearTimer: typeof globalThis.clearTimeout;

  constructor(private readonly deps: ActivityRegistryDeps) {
    this.now = deps.now ?? Date.now;
    this.setTimer = deps.setTimeout ?? globalThis.setTimeout;
    this.clearTimer = deps.clearTimeout ?? globalThis.clearTimeout;
  }

  start(input: ActivityStartInput): ActivityHandle {
    const id = input.id ?? uuidv7();
    if (this.items.has(id)) {
      // Stable-id collision — treat as a no-op update of label / detail.
      // Producers occasionally re-call start with the same id during
      // retries; clobbering the existing item would lose history.
      this.deps.log.debug("activity.start.collision", { id });
      this.update(id, { label: input.label, detail: input.detail, progress: input.progress });
      return this.makeHandle(id);
    }

    const startedAt = this.now() as Timestamp;
    const item: ActivityItem = {
      id,
      label: input.label,
      ...(input.detail !== undefined && { detail: input.detail }),
      ...(input.progress !== undefined && { progress: input.progress }),
      status: "running",
      startedAt,
      ...(input.quietPeriodMs !== undefined && { quietPeriodMs: input.quietPeriodMs }),
      ...(input.lingerMs !== undefined && { lingerMs: input.lingerMs }),
      ...(input.failedLingerMs !== undefined && { failedLingerMs: input.failedLingerMs }),
    };
    this.items.set(id, item);

    if (input.quietPeriodMs !== undefined && input.quietPeriodMs > 0) {
      this.hidden.add(id);
      const t = this.setTimer(() => {
        this.timers.delete(id);
        if (this.hidden.delete(id)) {
          // Reveal — emit `added` only now.
          const cur = this.items.get(id);
          if (cur) this.emit({ kind: "added", item: cur });
        }
      }, input.quietPeriodMs);
      t.unref?.();
      this.timers.set(id, t);
    } else {
      this.emit({ kind: "added", item });
    }

    return this.makeHandle(id);
  }

  list(): readonly ActivityItem[] {
    const out: ActivityItem[] = [];
    for (const [id, item] of this.items) {
      if (this.hidden.has(id)) continue;
      out.push(item);
    }
    return out;
  }

  subscribe(listener: ActivityListener): () => void {
    listener({ kind: "snapshot", items: this.list() });
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dismiss(id: string): void {
    const item = this.items.get(id);
    if (!item || item.status === "running") return;
    this.removeNow(id);
  }

  shutdown(): void {
    // Mark all running items as failed with a generic reason. Emit the
    // updates so the renderer (if still connected) sees the transition,
    // then clear and stop emitting. The actual cancellation of producer
    // work happens elsewhere — the registry just clears its display.
    for (const [id, item] of this.items) {
      if (item.status === "running") {
        const next: ActivityItem = {
          ...item,
          status: "failed",
          endedAt: this.now() as Timestamp,
          errorMessage: "shut down",
        };
        this.items.set(id, next);
        if (!this.hidden.has(id)) this.emit({ kind: "updated", item: next });
      }
    }
    for (const t of this.timers.values()) this.clearTimer(t);
    this.timers.clear();
    this.hidden.clear();
    this.items.clear();
    // Final snapshot so subscribers know the rail is empty.
    this.emit({ kind: "snapshot", items: [] });
    // After this, listeners may still exist but won't receive further events
    // (no producer can reach us — buildServices will discard the registry).
    this.listeners.clear();
  }

  // ── Internal ──────────────────────────────────────────────────────────────

  private makeHandle(id: string): ActivityHandle {
    return {
      id,
      update: (patch) => this.update(id, patch),
      finish: (status, err) => this.finish(id, status, err),
    };
  }

  private update(id: string, patch: ActivityUpdatePatch): void {
    const cur = this.items.get(id);
    if (!cur || cur.status !== "running") return;
    const next: ActivityItem = {
      ...cur,
      ...(patch.label !== undefined && { label: patch.label }),
      ...(patch.detail !== undefined && { detail: patch.detail }),
      ...(patch.progress !== undefined && { progress: patch.progress }),
    };
    this.items.set(id, next);
    if (!this.hidden.has(id)) this.emit({ kind: "updated", item: next });
  }

  private finish(id: string, status: "done" | "failed", err?: { message: string }): void {
    const cur = this.items.get(id);
    if (!cur || cur.status !== "running") return;

    if (this.hidden.has(id)) {
      // Finished before quietPeriod expired — never visible. Just drop.
      this.hidden.delete(id);
      const t = this.timers.get(id);
      if (t) {
        this.clearTimer(t);
        this.timers.delete(id);
      }
      this.items.delete(id);
      return;
    }

    const endedAt = this.now() as Timestamp;
    const next: ActivityItem = {
      ...cur,
      status,
      endedAt,
      ...(err?.message !== undefined && { errorMessage: err.message }),
    };
    this.items.set(id, next);
    this.emit({ kind: "updated", item: next });

    const lingerMs =
      status === "done"
        ? (cur.lingerMs ?? DEFAULT_LINGER_MS)
        : (cur.failedLingerMs ?? DEFAULT_FAILED_LINGER_MS);
    const t = this.setTimer(() => {
      this.timers.delete(id);
      if (this.items.get(id) === next) this.removeNow(id);
    }, lingerMs);
    t.unref?.();
    this.timers.set(id, t);
  }

  private removeNow(id: string): void {
    const t = this.timers.get(id);
    if (t) {
      this.clearTimer(t);
      this.timers.delete(id);
    }
    if (this.items.delete(id)) this.emit({ kind: "removed", id });
  }

  private emit(event: ActivityEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        this.deps.log.warn("activity.listener_threw", { err: String(err) });
      }
    }
  }
}
```

**Implementation Notes**:
- All timers `.unref()` so they don't keep the process alive (critical for Electron main).
- `subscribe` synchronously delivers a `snapshot` event immediately, before returning. Late subscribers see current state without waiting.
- Stable-id collision policy: the second `start({ id })` for the same id is treated as an `update`. This is defensive — producers shouldn't actually do this, but during retry logic (e.g., re-running explorer after failure) it's nicer than silently overwriting `startedAt`.
- `dismiss` no-ops on `running` items. Producers control when something stops; the rail is read-only for in-flight work.
- `shutdown` is best-effort — it tries to deliver final events, but if the renderer's already gone the listeners just no-op.

**Acceptance Criteria**:
- [ ] `start({ label: "x" })` → `list()` returns one item. Subscriber sees `snapshot` then `added`.
- [ ] `handle.update({ detail: "y" })` → subscriber sees `updated`.
- [ ] `handle.finish("done")` → subscriber sees `updated` (status:done), then `removed` after `DEFAULT_LINGER_MS`.
- [ ] `quietPeriodMs: 100` + `finish` within 50ms → no `added` event ever fires.
- [ ] `quietPeriodMs: 100` + still running at 100ms → `added` fires at 100ms.
- [ ] Timer mocking via `setTimeout`/`clearTimeout` deps overrides works.
- [ ] `shutdown` marks running items as failed, sends final snapshot, clears state.

---

### Unit 3: `ServiceDeps` wiring

**File**: `packages/core/src/services/types.ts` (modify)

```typescript
// Add to ServiceDeps:
export interface ServiceDeps {
  // existing fields...
  /**
   * Activity registry that long-running services report progress to.
   * Surfaced to the renderer via the activity-rail IPC channel.
   */
  activity: ActivityRegistry;
}
```

**File**: `packages/desktop/electron/main/services.ts` (modify)

```typescript
// Construct the registry early (before any producer wires it).
const activityService = new ActivityRegistryImpl({ db: undefined, log });

// Pass through ServiceDeps:
const deps: ServiceDeps = {
  // existing fields...
  activity: activityService,
};

// Producers receive it via their existing dep arguments — see Units 8-12.

// Add to Services return for shutdown chain:
return {
  // existing fields...
  activity: activityService, // ← exposed for shutdown
};
```

**File**: `packages/core/src/services/index.ts` (modify — add re-export)

```typescript
export { ActivityRegistryImpl, type ActivityRegistryDeps } from "./activity-registry.js";
```

**Acceptance Criteria**:
- [ ] `services.activity` exists in the Services interface and is an instance of `ActivityRegistryImpl`.
- [ ] Other services that need activity reporting (ingestion, bootstrap, indexers) accept it via their existing deps argument (each adds an `activity: ActivityRegistry` field — covered in Units 8-12).

---

### Unit 4: IPC streaming channel

**File**: `packages/desktop/electron/main/activity-channel.ts` (new — mirrors `ingest-channel.ts`)

```typescript
import type { IpcStreamMessage } from "@praxis/client";
import type { ActivityEvent, Logger } from "@praxis/core/types";
import { serializeError } from "@praxis/core/types";
import { createIpcHelpers } from "./ipc-helpers.js";
import type { Services } from "./services.js";

/**
 * Streams activity events from `services.activity` to the renderer.
 *
 * Channel naming matches the project's streaming convention:
 *   praxis.activity.events.start (invoke with streamId) — kicks off subscription
 *   praxis.activity.events.events.<streamId> (push)    — IpcStreamMessage<ActivityEvent>
 *   praxis.activity.events.cancel (on)                 — unsubscribes
 *
 * Also provides a single non-streaming endpoint:
 *   praxis.activity.dismiss (invoke) — drops a done/failed item early
 */
export function registerActivityHandlers(
  services: Services,
  webContentsGetter: () => Electron.WebContents | null,
  activeAbortControllers: Map<string, AbortController>,
  log: Logger,
): void {
  const { handle, on } = createIpcHelpers(log);

  handle("praxis.activity.dismiss", async (_event, id: string) => {
    services.activity.dismiss(id);
  });

  handle("praxis.activity.events.start", async (_event, streamId: string) => {
    const streamLog = log.child({ component: "activity.events", streamId });
    const controller = new AbortController();
    activeAbortControllers.set(streamId, controller);
    const eventsChannel = `praxis.activity.events.events.${streamId}`;

    const push = (msg: IpcStreamMessage<ActivityEvent>) => {
      const wc = webContentsGetter();
      if (!wc || wc.isDestroyed()) return;
      wc.send(eventsChannel, msg);
    };

    streamLog.info("activity.subscribe");
    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = services.activity.subscribe((event) => {
        if (controller.signal.aborted) return;
        push({ kind: "event", payload: event });
      });

      // Hold open until cancelled. We piggy-back on AbortController for that.
      await new Promise<void>((resolve) => {
        controller.signal.addEventListener("abort", () => resolve(), { once: true });
      });

      push({ kind: "done" });
      streamLog.info("activity.unsubscribe");
    } catch (err) {
      streamLog.error("activity.error", { err: serializeError(err) });
      push({ kind: "error", error: err instanceof Error ? err.message : String(err) });
    } finally {
      unsubscribe?.();
      activeAbortControllers.delete(streamId);
    }
  });

  on("praxis.activity.events.cancel", (_event, streamId: string) => {
    activeAbortControllers.get(streamId)?.abort();
    activeAbortControllers.delete(streamId);
  });
}
```

**File**: `packages/desktop/electron/main/ipc-server.ts` (modify)

Add `registerActivityHandlers(services, webContentsGetter, activeAbortControllers, log);` alongside the other channel registrations. Add `praxis.activity.events.cancel` to the cleanup `removeAllListeners` block.

**Implementation Notes**:
- Subscribe-and-hold pattern: the handler subscribes once, holds the connection open via an AbortController-gated promise, and unsubscribes on cancel. Avoids polling.
- The renderer's first event will always be a `snapshot` (delivered synchronously by `subscribe` in the registry).
- No `studentId` filtering — single-student v1.

**Acceptance Criteria**:
- [ ] Renderer can subscribe, see initial `snapshot`, then receive subsequent `added/updated/removed` events.
- [ ] Cancel via `praxis.activity.events.cancel` cleanly unsubscribes.
- [ ] `praxis.activity.dismiss` removes a done/failed item from the rail across all subscribers.

---

### Unit 5: Client-side `ActivityClient`

**File**: `packages/client/src/services/activity-client.ts` (new — mirrors `ingest-client.ts` / `memory-client.ts` streaming pattern)

```typescript
import type { ActivityClient as ActivityClientPort, ActivityEvent } from "@praxis/core/types";
import type { ClientTransport } from "../transport/types.js";

const C = {
  streamBase: "praxis.activity.events",
  dismiss: "praxis.activity.dismiss",
} as const;

/**
 * Typed renderer-side client for the activity rail. `events()` opens a
 * persistent stream and returns each `ActivityEvent` as it arrives. The
 * server delivers a `snapshot` first.
 */
export class ActivityClient implements ActivityClientPort {
  constructor(private readonly transport: ClientTransport) {}

  events(): AsyncIterable<ActivityEvent> {
    return this.transport.stream<ActivityEvent>(C.streamBase, undefined);
  }

  dismiss(id: string): Promise<void> {
    return this.transport.invoke<void>(C.dismiss, id);
  }
}
```

**File**: `packages/core/src/types/client.ts` (modify)

```typescript
// Add the port:
export interface ActivityClient {
  events(): AsyncIterable<ActivityEvent>;
  dismiss(id: string): Promise<void>;
}

// Add to PraxisClient:
export interface PraxisClient {
  // existing fields...
  activity: ActivityClient;
}
```

**File**: `packages/client/src/client.ts` (modify)

```typescript
import { ActivityClient } from "./services/activity-client.js";
// ...
return {
  // existing fields...
  activity: new ActivityClient(transport),
};
```

**File**: `packages/ui/src/__tests__/helpers/fake-client.ts` (modify — add stub)

Append `activity: {} as PraxisClient["activity"],` to the `makeFakeClient` defaults.

**Acceptance Criteria**:
- [ ] `client.activity.events()` is `AsyncIterable<ActivityEvent>`.
- [ ] First event yielded is `{ kind: "snapshot", items: [...] }`.
- [ ] `client.activity.dismiss(id)` resolves to void.
- [ ] All existing UI tests using `makeFakeClient` continue to pass.

---

### Unit 6: `useActivity` hook

**File**: `packages/ui/src/hooks/use-activity.ts` (new)

```typescript
import type { ActivityItem } from "@praxis/core/types";
import { useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";

export interface UseActivityResult {
  items: readonly ActivityItem[];
  dismiss: (id: string) => void;
}

/**
 * Subscribe to the activity stream for the lifetime of the component.
 * Returns a stable list of currently-visible items + a dismiss callback.
 *
 * Mount once at the root of the renderer (in <ActivityRail/>). Multiple
 * consumers are safe but waste IPC overhead — the rail is the only
 * intended consumer.
 */
export function useActivity(): UseActivityResult {
  const client = usePraxisClient();
  const [items, setItems] = useState<readonly ActivityItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    const local = new Map<string, ActivityItem>();

    (async () => {
      try {
        for await (const event of client.activity.events()) {
          if (cancelled) break;
          switch (event.kind) {
            case "snapshot":
              local.clear();
              for (const it of event.items) local.set(it.id, it);
              break;
            case "added":
            case "updated":
              local.set(event.item.id, event.item);
              break;
            case "removed":
              local.delete(event.id);
              break;
          }
          setItems(Array.from(local.values()));
        }
      } catch {
        // stream errored — fall to empty until next mount
        if (!cancelled) setItems([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [client]);

  const dismiss = (id: string) => {
    void client.activity.dismiss(id);
  };

  return { items, dismiss };
}
```

**Implementation Notes**:
- The `for await` loop runs for the component lifetime. Cancellation via the `cancelled` flag is sufficient — the underlying transport's `stream()` already handles unsub on the IPC side when the `events` channel is no longer subscribed.
- A new mount triggers a fresh subscription; the server sends a `snapshot` first, so there's no flash-of-stale-state.

**Acceptance Criteria**:
- [ ] Mounting renders empty `items` initially, then populates from the snapshot.
- [ ] Subsequent `added`/`updated`/`removed` events update `items`.
- [ ] Unmount cleanly stops the loop.
- [ ] Test with `makeFakeClient` overriding `activity.events` to yield scripted events asserts exactly the right item set after each step.

---

### Unit 7: `<ActivityRail>` component + CSS

**File**: `packages/ui/src/components/activity-rail.tsx` (new)

```typescript
import type { ActivityItem } from "@praxis/core/types";
import { useActivity } from "../hooks/use-activity.js";
import styles from "./activity-rail.module.css";

/**
 * Ambient progress surface — a thin rail anchored to the bottom of the
 * app chrome. Renders one editorial line per visible activity. Returns
 * `null` when there is nothing to show, reserving no chrome space.
 *
 * Slotted ONCE in the root layout (router.tsx's rootRoute component).
 * Do not render in route bodies; the rail spans every route.
 */
export function ActivityRail() {
  const { items, dismiss } = useActivity();
  if (items.length === 0) return null;

  return (
    <aside className={styles.rail} aria-label="Activity">
      <ul className={styles.list}>
        {items.map((item) => (
          <ActivityRow key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </ul>
    </aside>
  );
}

interface ActivityRowProps {
  item: ActivityItem;
  onDismiss: (id: string) => void;
}

function ActivityRow({ item, onDismiss }: ActivityRowProps) {
  const cls = [
    styles.row,
    item.status === "done" && styles.rowDone,
    item.status === "failed" && styles.rowFailed,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li className={cls}>
      <span className={styles.glyph} aria-hidden="true">
        {item.status === "failed" ? "⌖" : item.status === "done" ? "·" : "°"}
      </span>
      <span className={styles.label}>{item.label}</span>
      {item.detail && <span className={styles.detail}>{item.detail}</span>}
      {item.progress && item.progress.total > 0 && (
        <span
          className={styles.bar}
          style={{
            // hairline progress bar (no numeric percent — anti-numeric per VISION)
            ["--praxis-activity-progress" as string]: `${
              (item.progress.value / item.progress.total) * 100
            }%`,
          }}
          aria-hidden="true"
        />
      )}
      {item.status === "failed" && (
        <button
          type="button"
          className={styles.dismiss}
          onClick={() => onDismiss(item.id)}
          aria-label={`Dismiss ${item.label}`}
        >
          ×
        </button>
      )}
    </li>
  );
}
```

**File**: `packages/ui/src/components/activity-rail.module.css` (new)

```css
/* Editorial bottom rail. Hidden when items list is empty (component returns null).
 * Italic display serif body, mono kicker, ornament glyph. No icons, no badges. */

.rail {
  composes: editorial from global;          /* inherit base editorial type */
  position: sticky;                         /* sticks to bottom of layout */
  bottom: 0;
  width: 100%;
  background: var(--praxis-rail-bg, rgba(252, 250, 247, 0.92));
  backdrop-filter: blur(6px);
  border-top: 1px solid var(--praxis-rail-border, rgba(0, 0, 0, 0.06));
  padding: 0.5rem 1.25rem;
  z-index: 50;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.row {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.85rem;
  font-style: italic;
  color: var(--praxis-rail-fg, rgba(0, 0, 0, 0.62));
  animation: praxis-rail-in 220ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .row {
    animation: none;
  }
}

.rowDone {
  color: var(--praxis-rail-fg-done, rgba(0, 0, 0, 0.42));
}

.rowFailed {
  color: var(--praxis-rail-fg-failed, rgba(120, 30, 30, 0.78));
}

.glyph {
  font-family: var(--praxis-mono);
  font-style: normal;
  font-size: 0.9em;
  color: var(--praxis-rail-glyph, rgba(0, 0, 0, 0.45));
  width: 1ch;
  flex-shrink: 0;
}

.label {
  flex-shrink: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.detail {
  font-size: 0.78rem;
  color: var(--praxis-rail-fg-detail, rgba(0, 0, 0, 0.42));
  flex-shrink: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar {
  position: relative;
  height: 1px;
  flex: 0 1 8rem;
  background: var(--praxis-rail-bar-track, rgba(0, 0, 0, 0.08));
}

.bar::after {
  content: "";
  position: absolute;
  inset: 0 auto 0 0;
  width: var(--praxis-activity-progress, 0%);
  background: var(--praxis-rail-bar-fill, rgba(0, 0, 0, 0.32));
  transition: width 240ms ease-out;
}

@media (prefers-reduced-motion: reduce) {
  .bar::after {
    transition: none;
  }
}

.dismiss {
  margin-left: auto;
  background: transparent;
  border: none;
  color: inherit;
  font-family: var(--praxis-mono);
  cursor: pointer;
  padding: 0 0.25rem;
}

@keyframes praxis-rail-in {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**File**: `packages/ui/src/router.tsx` (modify — slot the rail into root layout)

```typescript
import { ActivityRail } from "./components/activity-rail.js";
// ...
const rootRoute = createRootRoute({
  component: () => (
    <div className={styles.layout}>
      <Nav />
      <main className={styles.main}>
        <Outlet />
      </main>
      <ActivityRail />
    </div>
  ),
});
```

**File**: `packages/ui/src/router.module.css` (modify)

Make `.layout` a column flex (or grid with rows `auto 1fr auto`) so `<Nav>` is at top, main grows, and `<ActivityRail>` pins to bottom. The current layout shape determines the precise change — implementer reads existing CSS and adapts.

**Implementation Notes**:
- The rail uses `composes: editorial from global` per the `editorial-ui-primitives` pattern.
- Glyph choice: `°` for running (degree sign — quiet ornament, not an alarm), `·` for done (middle dot — fade-out vibe), `⌖` for failed (a typographic mark — quieter than `!` or `✕`).
- No numeric percent on the bar — the project explicitly rejects "engagement metrics shown to the student" (UX.md:59); a hairline progress fill is enough.
- `prefers-reduced-motion` respected on entry animation and progress-bar transition (UX.md:597).
- Accessibility: `aria-label="Activity"` on the `<aside>`, `aria-hidden` on decorative glyph, dismiss button has `aria-label`. Screen reader gets the activity content as a list.

**Acceptance Criteria**:
- [ ] Empty items → component returns `null`; no DOM, no chrome reservation.
- [ ] One running item → rail shows one row with `°` glyph, italic label.
- [ ] One done item → rail shows the row with `·` glyph and faded color.
- [ ] One failed item → rail shows the row with `⌖` glyph, hairline-warning color, dismiss button visible.
- [ ] `prefers-reduced-motion: reduce` → no entry animation, no transitions.
- [ ] Multiple items render top-down in insertion order.

---

### Unit 8: Producer — ingestion

**Files**:
- `packages/core/src/ingestion/service.ts` (modify — accept `activity` in deps, report progress)
- `packages/desktop/electron/main/services.ts` (modify — pass `activity` to `IngestionService`)
- `packages/ui/src/components/add-document-button.tsx` (modify — drop `<IngestionProgress>`)
- `packages/ui/src/hooks/use-ingestion.ts` (modify — drop the `events` accumulation since the rail covers it)
- `packages/ui/src/components/ingestion-progress.tsx` (DELETE)
- `packages/ui/src/components/ingestion-progress.module.css` (DELETE)

```typescript
// packages/core/src/ingestion/service.ts — diff sketch

export interface IngestionServiceDeps {
  // existing fields...
  activity: ActivityRegistry;
}

export class IngestionService {
  // ...
  async *ingest(req: IngestionRequest, signal?: AbortSignal): AsyncIterable<IngestionEvent> {
    const documentId = uuidv7();
    const prettyName = friendlyDocumentLabel(req.filename);
    const handle = this.deps.activity.start({
      label: `reading ${prettyName}`,
      // No quietPeriodMs — ingestion is always slow enough to show.
    });
    yield { type: "start", documentId, filename: req.filename };

    try {
      // ... existing pipeline, with handle.update calls at each step:
      //   parsing  → handle.update({ detail: "reading text" })
      //   parsed   → handle.update({ label: `indexing ${prettyName}` })
      //   indexing → handle.update({ progress: { value: chunksProcessed, total: totalChunks } })
      //   done     → handle.finish("done")
      //   error    → handle.finish("failed", { message: ... })

      // The detail/label transitions and progress updates live IN the existing
      // event-emit points; just sprinkle handle.update() calls alongside the
      // existing yields. See implementation notes for the exact mapping.
    } catch (err) {
      handle.finish("failed", { message: err instanceof Error ? err.message : String(err) });
      throw err;
    }
  }
}

function friendlyDocumentLabel(filename: string): string {
  // Strip extension, replace dashes/underscores with spaces, lowercase.
  return filename
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .toLowerCase();
}
```

**Mapping of `IngestionEvent.type` → activity update**:

| Event | label | detail | progress | finish? |
|---|---|---|---|---|
| `start` | `reading {pretty}` | (none) | (none) | — |
| `ingestor_selected` | (no change) | `using {ingestorLabel}` | (none) | — |
| `parsing` | (no change) | `{lastEvent.message}` (e.g. "reading text") | (none) | — |
| `vision_page` | (no change) | `vision page {page} of {totalPages}` | `{value: page, total: totalPages}` | — |
| `parsed` | `indexing {pretty}` | (clear detail) | (clear progress) | — |
| `indexing` | (no change) | (none) | `{value: chunksProcessed, total: totalChunks}` | — |
| `done` | (no change) | (clear) | (clear) | `done` |
| `error` | (no change) | (none) | (none) | `failed` with `error.message` |

`use-ingestion.ts`: drop the `events: IngestionEvent[]` and `chunksProcessed/totalChunks` fields from the state shape — the rail is the visible-progress surface now. Keep `status: "ingesting" | "done" | "error"` for the button's disabled state. The hook becomes much smaller.

`add-document-button.tsx`: delete the `<IngestionProgress>` import + render. The button still shows itself; the rail handles progress. The button's `disabled` prop still uses `state.status === "ingesting"` etc.

**Acceptance Criteria**:
- [ ] During ingestion of a 100-chunk document, the activity rail shows one row that progresses through `reading X` → `indexing X` with a visible hairline bar.
- [ ] On done, the row lingers ~4 seconds with `·` glyph, then disappears.
- [ ] On error, the row shows `⌖` glyph and the error message, persists ~10 seconds (or until dismissed).
- [ ] No `<IngestionProgress>` modal is rendered anywhere — the file no longer exists.
- [ ] The "Add document" button is no longer disabled by an in-flight ingestion in another component (button still tracks its own click → ingestion lifecycle, but the user is no longer blocked from navigating).

---

### Unit 9: Producer — bootstrap explorer

**File**: `packages/core/src/services/bootstrap-service.ts` (modify)

Add `activity: ActivityRegistry` to `BootstrapServiceDeps`. In `runExploration()`, wrap the call to `runConceptExplorer`:

```typescript
async runExploration(input: RunExplorationInput): Promise<RunConceptExplorerResult> {
  const handle = this.deps.activity.start({
    label: `exploring ${input.courseTitle.toLowerCase()}`,
    detail: "reading materials",
    // Bootstrap explorer is always slow (30-90s). No quietPeriodMs needed.
  });
  try {
    const result = await runConceptExplorer({
      // existing args...
      onProgress: (phase) => {
        // phase: "reading" | "shaping" | "finalizing"
        const detail =
          phase === "reading" ? "reading materials"
            : phase === "shaping" ? "shaping the course"
            : "finalizing";
        handle.update({ detail });
      },
    });
    handle.finish(result.ok ? "done" : "failed", {
      message: result.ok ? "" : `${result.reason ?? "explorer error"}`,
    });
    return result;
  } catch (err) {
    handle.finish("failed", { message: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
```

`runConceptExplorer` (in `@praxis/curriculum/bootstrap/explorer.ts`) needs a new optional `onProgress` callback. The explorer's loop already tracks tool calls — fire the callback at coarse phases:

- `"reading"` while `document.outline` / `document.list_sections` / `document.read_pages` / `retrieve_from_textbook` calls dominate
- `"shaping"` once `course.draft_init` has been called (all subsequent draft mutations are the shape phase)
- `"finalizing"` at `course.draft_finalize`

**Acceptance Criteria**:
- [ ] Calling `bootstrap.runExploration({ courseTitle: "Algebra (Sullivan)" })` makes the rail show `° exploring algebra (sullivan)` immediately.
- [ ] As the explorer hits each phase, the `detail` updates: "reading materials" → "shaping the course" → "finalizing".
- [ ] On success, item finishes as `done` and lingers; on failure, as `failed`.

---

### Unit 10: Producer — indexers

**File**: `packages/core/src/services/indexers/orchestrator.ts` (modify)

Add `activity: ActivityRegistry` to `IndexerOrchestratorDeps`. Wrap the body of `runScope`:

```typescript
private async runScope(...): Promise<void> {
  // existing setup...
  const handle = this.deps.activity.start({
    label: schedule === "post-turn" ? "thinking" : "wrapping up",
    // Quiet — most runs finish in <800ms and shouldn't blip the rail.
    quietPeriodMs: 800,
  });
  try {
    // existing indexer dispatch loop
    handle.finish("done");
  } catch (err) {
    handle.finish("failed", { message: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}
```

**Implementation Notes**:
- `quietPeriodMs: 800` — most post-turn indexer runs finish in <500ms. This means the rail almost never shows a blip for them. Only when an indexer (e.g., misconception) takes seconds does it appear, with the editorial label `thinking`.
- `wrapping up` for `runAtSessionEnd` because it tends to take longer (misconception extraction with full session context) and runs at session boundaries — appropriate to show.

**Acceptance Criteria**:
- [ ] A `runScope` that completes in <800ms produces no rail item.
- [ ] A `runScope` that takes 2 seconds shows `° thinking` from t=800ms onward.
- [ ] Failures show as `⌖ thinking` with the error message.

---

### Unit 11: Producer — Pyodide preload

**File**: `packages/desktop/electron/main/index.ts` (modify the existing `bootstrap()`)

```typescript
const pyodideHandle = services.activity.start({
  label: "preparing math tools",
});
services.pyodide
  .preload()
  .then(() => pyodideHandle.finish("done"))
  .catch((err: unknown) => {
    pyodideHandle.finish("failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    bootLog.warn("bootstrap.pyodide_preload_failed", { err: serializeError(err) });
  });
```

Same shape for `services.embeddings.preload()` — see Unit 12.

**Acceptance Criteria**:
- [ ] App boot shows `° preparing math tools` while Pyodide is loading; clears once loaded.
- [ ] If preload fails, item appears as `⌖ preparing math tools` with the error.

---

### Unit 12: Producer — embeddings preload

**File**: `packages/desktop/electron/main/index.ts` (modify)

```typescript
const embedHandle = services.activity.start({
  label: "preparing search",
});
services.embeddings
  .preload()
  .then(() => embedHandle.finish("done"))
  .catch((err: unknown) => {
    embedHandle.finish("failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    bootLog.warn("bootstrap.embeddings_preload_failed", { err: serializeError(err) });
  });
```

**Acceptance Criteria**:
- [ ] App boot shows `° preparing search` while embeddings worker is initializing; clears when ready.

---

### Unit 13: `before-quit` shutdown wiring

**File**: `packages/desktop/electron/main/index.ts` (modify the existing `before-quit` chain)

```typescript
app.on("before-quit", async (event) => {
  if (shuttingDown || !services) return;
  shuttingDown = true;
  event.preventDefault();
  try {
    // 1. Stop accepting new work — close sessions.
    await services.session.shutdown();
    // 2. Cancel any in-flight ingestion / activity producers via their
    //    own AbortControllers. The activity registry's shutdown is purely
    //    a display reset; producers' work-cancellation happens via the
    //    activeAbortControllers map already maintained by ipc-server.
    for (const controller of activeAbortControllers.values()) controller.abort();
    activeAbortControllers.clear();
    // 3. Clear activity display.
    services.activity.shutdown();
    // 4. Tear down forked Node-mode workers.
    for (const [name, worker] of Object.entries(services.workers)) {
      await worker.shutdown().catch((err) => log?.warn("worker.shutdown_failed", { name, err: serializeError(err) }));
    }
  } finally {
    await log?.shutdown();
    app.exit(0);
  }
});
```

`activeAbortControllers` is the existing map in `ipc-server.ts` that tracks streaming-IPC abort controllers (already used by ingestion and memory.episodic). This step wasn't done before — Phase 16's worker shutdown landed without aborting these. We do it now while we're already touching the chain.

**Implementation Notes**:
- This requires `activeAbortControllers` to be importable / accessible from `index.ts`. The cleanest way: expose it as part of `Services` (e.g., `services.activeAbortControllers: Map<string, AbortController>`) populated by `registerIpcHandlers`. Or: create the map in `index.ts` and pass it down.

**Acceptance Criteria**:
- [ ] Closing the app while ingestion is in-flight cancels the ingestion server-side (no orphan IngestionService.ingest() generators running after `app.exit(0)`).
- [ ] On next launch the activity rail is empty — no resumed/zombie items.

---

### Unit 14: Tests

**File**: `packages/core/src/services/__tests__/activity-registry.test.ts` (new)

Cover with fake timers (`vi.useFakeTimers()`):

- Empty registry: `list()` is `[]`. Subscriber gets `snapshot:[]` and nothing else.
- `start({ label: "x" })` → subscriber sees `snapshot, added`. `list()` has the item.
- `update` → subscriber sees `updated`.
- `finish("done")` → subscriber sees `updated` (status:done), then `removed` after 4s.
- `finish("failed", { message })` → 10s linger, dismiss available.
- `quietPeriodMs: 100`, `finish` at 50ms → no `added`, no `updated`, no `removed` ever fires (item invisible, just removed silently).
- `quietPeriodMs: 100`, still running at 100ms → `added` fires at exactly 100ms.
- `dismiss(id)` on running item → no-op.
- `dismiss(id)` on done item → immediate removal (subscriber sees `removed`).
- Same id collision: second `start({ id: "x" })` updates label/detail rather than creating a new item.
- `shutdown()` → all running items emit `updated` to `failed`, then `snapshot:[]`, listeners cleared.

**File**: `packages/ui/src/__tests__/use-activity.test.tsx` (new)

- Mount with empty stream → `items: []`.
- Stream yields `snapshot` with two items → `items.length === 2`.
- Stream yields `added`/`updated`/`removed` → state matches expectations.
- Unmount stops the loop without throwing.

**File**: `packages/ui/src/__tests__/activity-rail.test.tsx` (new)

- Empty items → component renders `null` (no `<aside>`).
- One running item → renders one `<li>` with the `°` glyph and italic label.
- One done item → renders with `·` glyph.
- One failed item → renders with `⌖` glyph + dismiss button. Click → `dismiss` callback called with id.
- `prefers-reduced-motion: reduce` matched → entry animation class is absent (verify via computed style or applied class).

**File**: `packages/desktop/electron/main/__tests__/activity-channel.test.ts` (new — integration-style)

If the project already has IPC handler tests, follow that pattern. Otherwise covered by the e2e flow.

**Modify** `packages/core/src/ingestion/__tests__/service.test.ts` (or wherever ingestion is unit-tested):
- Inject a mock `ActivityRegistry`. Verify `start`, `update`, `finish("done")` are called in order with expected labels/details.

**Acceptance Criteria**:
- [ ] All four new test files pass.
- [ ] Ingestion service test verifies activity calls.
- [ ] No test relies on `<IngestionProgress>` (file no longer exists).

---

### Unit 15: Cleanup + documentation

- Delete `packages/ui/src/components/ingestion-progress.tsx` and `.module.css`.
- Delete the `events: IngestionEvent[]` and `chunksProcessed`/`totalChunks` fields from `IngestionState` in `use-ingestion.ts` (the rail covers this UI now).
- Update `.claude/skills/patterns/` if any pattern referenced `IngestionProgress` directly (none expected, but check `editorial-ui-primitives.md` and `use-resource-hook.md`).
- Add a one-line note to `CLAUDE.md` Stack summary listing `ActivityRail` as a cross-cutting UI primitive (alongside RouteHeader, EmptyState).

**Acceptance Criteria**:
- [ ] `git grep IngestionProgress packages/` returns zero matches.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` clean.

---

## Implementation Order

Each step ends with `pnpm typecheck && pnpm lint && pnpm test` green.

1. **Unit 1** — types in `@praxis/core/types`. Pure type additions.
2. **Unit 2** — `ActivityRegistryImpl` + tests (Unit 14 first half).
3. **Unit 3** — `ServiceDeps` wiring. `services.activity` exists; nothing produces yet.
4. **Unit 4** — IPC channel handler.
5. **Unit 5** — `ActivityClient` + `PraxisClient.activity` field. `makeFakeClient` updated.
6. **Unit 6** — `useActivity` hook + test.
7. **Unit 7** — `<ActivityRail>` + CSS + slot in `router.tsx` + test. **At this checkpoint the rail exists in the chrome but has nothing to display.**
8. **Unit 8** — Ingestion producer + delete `IngestionProgress` modal. **First user-visible activity flows here.**
9. **Unit 13** — `before-quit` shutdown wiring (touched while we're in `index.ts`).
10. **Unit 11 + Unit 12** — Pyodide and embeddings preload producers (boot-time activity).
11. **Unit 9** — Bootstrap explorer producer (requires `runConceptExplorer.onProgress` plumbing).
12. **Unit 10** — Indexer producer (quiet period guards).
13. **Unit 15** — Cleanup pass; pattern docs; CLAUDE.md note.

---

## Testing

### Unit tests

Per Unit 14. Summary:

| File | Coverage |
|---|---|
| `packages/core/src/services/__tests__/activity-registry.test.ts` | Registry: lifecycle, quietPeriod, linger, shutdown, dismiss, id collision. |
| `packages/ui/src/__tests__/use-activity.test.tsx` | Hook: snapshot, add/update/remove dispatch, unmount cleanup. |
| `packages/ui/src/__tests__/activity-rail.test.tsx` | Component: empty render, glyph by status, dismiss button on failed, reduced-motion. |
| `packages/core/src/ingestion/__tests__/service.test.ts` (extend) | Mock `ActivityRegistry`; assert `start/update/finish` calls match each ingestion phase. |

### Manual smoke

In `pnpm dev`:

1. Cold boot — see `° preparing math tools` and `° preparing search` appear; both clear within ~5-15 seconds.
2. From the Library, ingest a small PDF (~50 chunks). The rail shows `° reading filename` with details and a hairline progress bar; the user can navigate routes during ingestion (rail stays visible). On done, item lingers ~4s then disappears.
3. Start a bootstrap session, ask for a course from a textbook. Rail shows `° exploring course-title` with detail transitions. Clears on done.
4. Have a regular teach turn. Rail does NOT blip for the post-turn indexer run (quietPeriod blocks it).
5. End a session. Rail shows `° wrapping up` for the session-end indexer run if it takes >800ms.
6. Force an ingestion error (corrupt file). Rail shows `⌖ reading filename` with the error in detail; dismiss button works.
7. Quit the app while an ingestion is in flight. Re-launch — rail is empty.

### A11y check

- Keyboard: tab through to the dismiss button on a failed item; press Enter to dismiss.
- Screen reader: VoiceOver / NVDA reads the `<aside aria-label="Activity">` as a landmark, then the list of activity rows in order.
- Reduced motion: in OS prefs set `Reduce motion`; reload — entry animation absent, progress bar transitions absent.

---

## Verification Checklist

```bash
# from repo root
pnpm install                                                # no new deps for this design
pnpm typecheck
pnpm lint
pnpm test
pnpm vitest run packages/core/src/services/__tests__/activity-registry.test.ts
pnpm vitest run packages/ui/src/__tests__/use-activity.test.tsx
pnpm vitest run packages/ui/src/__tests__/activity-rail.test.tsx

# Confirm the modal is gone
git grep IngestionProgress packages/                        # zero matches
test -f packages/ui/src/components/ingestion-progress.tsx && echo FAIL || echo OK
test -f packages/ui/src/components/ingestion-progress.module.css && echo FAIL || echo OK

# Confirm the rail is wired in the root layout
grep -q "ActivityRail" packages/ui/src/router.tsx && echo OK || echo FAIL

# Confirm IPC channels registered
grep -q "praxis.activity.events" packages/desktop/electron/main/activity-channel.ts && echo OK || echo FAIL
grep -q "registerActivityHandlers" packages/desktop/electron/main/ipc-server.ts && echo OK || echo FAIL
```

**Done when**:
- [ ] All commands above pass.
- [ ] Manual smoke #1-7 all behave as described.
- [ ] `pnpm dev` boots and ingestion never blocks the user with a modal.
- [ ] No new dependencies (everything reuses existing IPC + UI primitives + uuid).
- [ ] No notification badges, no alarm colors, no numeric-percent labels anywhere.
