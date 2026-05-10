---
id: feature-logger-rolling-file-rotation
kind: feature
stage: implementing
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
