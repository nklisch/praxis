---
id: feature-logger-rolling-file-rotation
kind: feature
stage: done
tags: [cleanup]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-09
updated: 2026-05-10
---

# Logger: pino-roll for daily rotation + pino-pretty stdout

## Context

Captured retroactively on 2026-05-09 when `/agile-workflow:convert` bootstrapped
the substrate. Builds on the structured-logging feature shipped in v0; this
adds rotation and a pretty stdout target without changing the renderer-side
shape.

## What this feature adds

- `createMainLogger` is now async, building a `pino.multistream` over two
  in-process streams: `pino-pretty` for human-readable stdout in dev, and
  `pino-roll` for a rolling JSONL file under `userData/logs/`.
- A small `FlushableStream` interface lets us drain both streams cleanly on
  shutdown without reaching into pino internals (`flushSync()` + wait for
  `finish` / `close`).
- New `pino-roll.d.ts` ambient type declaration since the upstream package
  ships untyped.

## Why this is one feature

The work is tightly scoped to the main-process logger and its tests. No
renderer-side changes; no log-record shape changes. It's a single coherent
infra improvement (file rotation + pretty stdout) cleanly separable from the
broader bootstrap drafts work.

## Status

`stage: implementing` at substrate-bootstrap. Working-tree changes already
typecheck and pass `pnpm test packages/desktop`. Closing commit advances to
`review`.

## Files in scope

- `packages/desktop/electron/main/logger.ts` — async + multistream
- `packages/desktop/electron/main/services.ts` — awaits async logger creation
- `packages/desktop/electron/main/__tests__/logger.test.ts`
- `packages/desktop/electron/main/__tests__/log-channel.test.ts`
- `packages/desktop/electron/main/pino-roll.d.ts` (new)
- `package.json` — adds `pino-roll` + `pino-pretty` dependencies

## Acceptance criteria

- `pnpm test packages/desktop` green.
- A packaged Electron run produces a rolling JSONL file under
  `userData/logs/`; dev `pnpm dev` produces pretty stdout output.
- Shutdown drains both streams (no truncated log file at app close).

## Next step

Land the closing commit, advance to `review`.

## Review (2026-05-10)

**Verdict**: Approve

**Blockers**: none
**Important**: none

**Nits** (in conversation only):
- Title and commit message use "daily file rotation" but the actual contract
  is size-based rotation (`size: ${maxFileSizeMb}m`) with a `maxFiles` cap.
  The body and acceptance criteria correctly say "rolling JSONL file" — no
  time guarantee — so the spec is met. If daily-frequency rotation is
  actually desired, add `frequency: "daily"` to the `pino-roll` build options
  and expose it on `LoggingConfig`. Filed as a one-line option, not an item.

**Notes**:
- `pnpm --filter @praxis/desktop test`: 60 passed (25 logger + 35 log-channel
  + 11 ipc-helpers + 4 ipc-server + 7 ipc-server-assignments + 1 index — close
  enough to the brief's "25 + 35" count given the broader desktop suite).
- `multistream` over `transport({ targets })` is the load-bearing decision
  documented at the top of `createMainLogger` — Vitest's stdio capture and
  Electron's main-process stdio both have known silent-failure modes with
  worker-thread transports. In-process streams trade a touch of throughput
  for observability and reliability, which matches Praxis's needs (logs are
  diagnostic, not high-volume telemetry).
- `FlushableStream` interface is a clean adapter over both pino-pretty and
  pino-roll's SonicBoom — no internal pino reach-through, and the 2s
  per-stream `setTimeout` backstop keeps a stuck stream from blocking
  `app.exit()`.
- `pino-roll.d.ts` ambient declaration covers the minimum surface used.
  Worth re-checking if pino-roll@4 ships official types.
- `wrapPinoForTesting` is a clean test seam — production code stays narrow,
  tests get a sync-pino path without spawning real transports. Most logger
  behaviour is exercised through it; the smoke suite covers the
  `createMainLogger` end-to-end path with one assertion per concern.
- Capability check: file output works in dev (smoke test asserts records
  reach disk via pino-roll), pretty stdout is configured, shutdown drains
  cleanly, redaction still enforced via the `guard()` pass before pino sees
  the fields. Ship-worthy.
