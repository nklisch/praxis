---
id: gate-patterns-inconsistency-require-unlocked-duplication
kind: story
stage: done
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: patterns
created: 2026-05-24
updated: 2026-05-25
---

# `requireUnlocked` helper is duplicated literally across 7 author/config channels

## Existing pattern

`ipc-envelope-handler` — mutating / validating / trust-boundary IPC
channels use `wrapEnvelope(channel, log, withSchema(zod, fn))` so the
wire format is `{ ok, value | error: { code, message, requestId } }`.

## Nature of divergence

Every author-* channel module + config-channel defines an identical
private `requireUnlocked()` helper:

```ts
const requireUnlocked = async (): Promise<void> => {
  const unlocked = await services.lock.isUnlocked();
  if (!unlocked) {
    throw new Error(
      "Locked: configure surface requires unlock. Call praxis.lock.unlock first.",
    );
  }
};
```

Sites:

- `packages/desktop/electron/main/author-course-channel.ts:17`
- `packages/desktop/electron/main/author-lesson-channel.ts:18`
- `packages/desktop/electron/main/author-gate-channel.ts:19`
- `packages/desktop/electron/main/author-memory-channel.ts:13`
- `packages/desktop/electron/main/author-prompt-channel.ts:25`
- `packages/desktop/electron/main/author-configurator-channel.ts:16`
- `packages/desktop/electron/main/config-channel.ts`

Every envelope handler in those files opens with `await requireUnlocked();`
before delegating to the service.

## Required action

Two clean extraction paths — either works:

- **Option A (lighter touch)**: extract `requireUnlocked(services)` into
  `ipc-helpers.ts`; channels import and call it from the top of each
  envelope handler.
- **Option B (structural)**: extend `handleEnvelope` (or `wrapEnvelope`)
  with a `lockGated: true` option that calls `services.lock.isUnlocked()`
  before invoking the user function. Then per-handler boilerplate
  disappears entirely and the gate becomes uniformly testable.

Option B reduces more code but requires reviewing each call site to
confirm the gate is always at the top (no conditional / mid-handler
unlocks). Option A is mechanical.

## Scope

7 files, ~50 lines of duplicated code (helper + boilerplate per
handler). Pure refactor; no IPC contract change. One PR; recommend
Option B if author surface stays uniformly lock-gated.

## Provenance

Surfaced by the v0.1.4 patterns gate rerun (2026-05-24) while sweeping
the IPC channel modules for emergent shapes.

## Implementation notes (2026-05-25)

Chose Option A. `requireUnlocked` extracted to `packages/desktop/electron/main/ipc-helpers.ts`
with a structural services parameter to avoid importing the concrete `Services` type:

```ts
export const requireUnlocked = async (services: {
  lock: { isUnlocked(): Promise<boolean> };
}): Promise<void> => {
  const unlocked = await services.lock.isUnlocked();
  if (!unlocked) {
    throw new Error(
      "Locked: configure surface requires unlock. Call praxis.lock.unlock first.",
    );
  }
};
```

Error message preserved verbatim from all 7 originals. Call sites updated from
`await requireUnlocked()` to `await requireUnlocked(services)`.

Files changed:
- `packages/desktop/electron/main/ipc-helpers.ts` — added `requireUnlocked` export
- `packages/desktop/electron/main/author-course-channel.ts` — import + 2 call sites
- `packages/desktop/electron/main/author-lesson-channel.ts` — import + 3 call sites
- `packages/desktop/electron/main/author-gate-channel.ts` — import + 4 call sites
- `packages/desktop/electron/main/author-memory-channel.ts` — import + 4 call sites
- `packages/desktop/electron/main/author-prompt-channel.ts` — import + 8 call sites
- `packages/desktop/electron/main/author-configurator-channel.ts` — import + 2 call sites
- `packages/desktop/electron/main/config-channel.ts` — import + 3 call sites

## Review (2026-05-25)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Error string preserved verbatim ("Locked: configure surface requires unlock. Call praxis.lock.unlock first.") — clients pattern-matching on that message remain unbroken. Structural services parameter `{ lock: { isUnlocked(): Promise<boolean> } }` avoids importing the concrete `Services` type, keeping `ipc-helpers.ts` independent. All 7 channels (6 author-* + config) updated to `await requireUnlocked(services)`. Option B (lockGated wrapper in `handleEnvelope`) appropriately deferred — 1 trust-gate type doesn't justify the structural change yet. Co-located with `handleEnvelope` in the natural module. 5399 tests pass.
