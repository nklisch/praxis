---
id: gate-patterns-v0-1-2
kind: story
stage: done
tags: [patterns]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: patterns
created: 2026-05-14
updated: 2026-05-14
---

# Patterns extracted for v0.1.2

## New patterns codified

- `ipc-envelope-handler` — Mutating / validating / trust-boundary IPC channels wrap with `wrapEnvelope(channel, log, withSchema(zod, fn))`. Wire format is `{ ok, value | error: { code, message, requestId } }`; clients peel with `unwrapEnvelope` and catch `IpcError` carrying `.code` + `.requestId`. Same UUIDv7 `requestId` joins renderer-visible failures to main-side log rows.
- `per-domain-channel-module` — Cohesive IPC domains (activity, subagent, bootstrap-drafts, quick-check, document-scopes, ingest) each live in `<domain>-channel.ts` exporting `registerXxxHandlers(services, [, webContentsGetter, activeAbortControllers], log)`. `createIpcHelpers(log)` is the single seam for uniform timing + `serializeErrorRedacted` error logging. `ipc-server.ts` is the composition root that wires each module in turn.
- `resizable-side-panel-hook` — Side panels with drag-to-resize + per-device persisted width compose `useResizableWidth({ storageKey: "praxis.panel.<id>.width", defaultWidth, minWidth, maxWidth, side })` with `<ResizeHandle side="..." {...handleProps} />`. The hook owns pointer / keyboard / localStorage; consumers control where the gutter renders in the DOM. Three call sites: chat-documents sidebar, quiz sidekick, homework sidekick.
- `electron-ipc-test-harness` — IPC channel tests stub `electron` at the module boundary so `ipcMain.handle/on` capture handlers into a local `Map`; `registerIpcHandlers` is imported *after* the mock (Vitest hoisting); tests invoke `handlers.get("praxis.x.y")?.({}, ...args)` directly with a minimal fake `Services` bag. No Electron runtime, full IPC-seam coverage.

## Inconsistencies flagged

- `gate-patterns-migrate-mutating-ipc-channels-to-envelope` — most `ipc-server.ts` mutating channels (~56 of 67 invoke handlers) still throw raw Error across the trust boundary. The new `ipc-envelope-handler` pattern shipped on `praxis.config.*`, `praxis.lock.*`, `praxis.update.checkLatest`, `praxis.shell.openExternal` but `praxis.author.*`, `praxis.session.*`, `praxis.tabs.*`, `praxis.notes.*`, `praxis.flashcards.*`, `praxis.bootstrap.*` etc. need the rollout completed. (Refactor story at `stage: drafting`.) Note: this overlaps with the gate-security finding `gate-security-ipc-helpers-rethrow-redactor-gap`.
- `gate-patterns-share-vitest-spy-logger-factory` — `Logger` fake is reproduced verbatim across 4+ IPC channel-test files (`ipc-server.first-run-update.test.ts:39`, `ipc-server.cancel.test.ts:46`, `ipc-server.author.lock.test.ts:44`, `log-channel.test.ts:23`); `shared-test-fake-factories` says this warrants a `tests/helpers/mocks.ts` entry. `recordingLogger` exists but doesn't expose `vi.fn()` spies these tests want for assertions; needs a `makeSpyLogger()` factory. (Refactor story at `stage: drafting`.)

## Pattern files written

- `.claude/skills/patterns/ipc-envelope-handler.md`
- `.claude/skills/patterns/per-domain-channel-module.md`
- `.claude/skills/patterns/resizable-side-panel-hook.md`
- `.claude/skills/patterns/electron-ipc-test-harness.md`
- `.claude/rules/patterns.md` (index updated; 4 new entries)
- `.claude/skills/patterns/SKILL.md` (4 new available-patterns entries)

## Verified-clean

- No new patterns proposed for the prompt-block trio (`prompt-block`, `prompt-block-stack`, `fragment-block`) — only one call site (the configure prompt tab); pattern requires 3+ uses.
- No new patterns proposed for `course-context.ts` / `in-course-behavior.ts` fragment composition — captured under the existing `mode-prompt-fragment-composition` pattern (see `gate-docs-mode-prompt-fragment-in-course-behavior` for the doc update).
- `TabsContext` (lifted state) doesn't warrant a new pattern — it's covered by `context-hook-pair` (see `gate-docs-context-hook-pair-tabs-now-shared` for the doc update removing the "tabs" exclusion).
