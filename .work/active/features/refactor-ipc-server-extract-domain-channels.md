---
id: refactor-ipc-server-extract-domain-channels
kind: feature
stage: drafting
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-18
updated: 2026-05-18
---

# Refactor: extract domain channels out of ipc-server.ts

## Brief

`packages/desktop/electron/main/ipc-server.ts` is **2066 lines** — by far
the largest source file in the workspace. It mixes 8+ independent domain
channels (session.send, config, artifacts, memory, assignments, gates,
explorers/drafter, courses) plus Zod schema definitions, AbortController
stream lifecycle, envelope wrapping, and per-channel boilerplate in a
single module.

Several domain channels have already been factored out cleanly
(`activity-channel.ts`, `quick-check-channel.ts`, `course-create-drafts-channel.ts`,
`ingest-channel.ts`, `subagent-channel.ts`, `recommendations-channel.ts`,
`citations-channel.ts`) and the pattern is well-established (see
`per-domain-channel-module` pattern at `.claude/skills/patterns/per-domain-channel-module.md`).
This refactor finishes the job for the remaining domains still living inline.

This is **pure refactor** — every channel name, payload shape, and envelope
behavior must be preserved exactly. Tests should pass without modification
(the IPC test harness pattern at `.claude/skills/patterns/electron-ipc-test-harness.md`
exercises handlers via the captured `Map`, which is independent of the
defining file).

## Surface area (initial inventory — discovery scan)

Channels still defined inside `ipc-server.ts` (line ranges approximate, verify
during design):

- `praxis.session.send` (start/cancel) — lines 195-242
- `praxis.memory.episodic` (start/cancel) — lines 615-667
- `praxis.gates.compute` (start/cancel) — lines 1545-1695
- `praxis.config.*` — lines 308-..., `previewPrompt` at 851-933
- `praxis.artifacts.*` — multi-handler block
- `praxis.assignments.*` — multi-handler block
- `praxis.explorers.*` (now `drafter`?) — verify post-rename
- `praxis.courses.*` — multi-handler block

Also inline in ipc-server.ts:
- Shared Zod schemas — `courseIdSchema`, `assignmentInputSchema`,
  `sessionStartSchema`, `SpawnFromAssignmentSchema`, etc.
- Repeated `brandId<"StudentId">(services.getDefaultStudentId()) as StudentId`
  casts (~40 occurrences). See `refactor-extract-default-student-id-helper`.
- Repeated streaming-handler boilerplate (AbortController + push +
  try/catch/finally). See `refactor-stream-handler-template`.

## Why a feature (not a story)

- Multi-channel, multi-file extraction with ordering decisions
- Each extracted channel becomes its own `<domain>-channel.ts` module
- Some channels share Zod schemas → decide whether schemas move to a
  shared `validation-schemas.ts` or co-locate with the consuming channel
- Order matters: the streaming-handler template (see
  `refactor-stream-handler-template`) should land first so each new
  channel module can adopt it on extraction

## Discovery findings to design against

- ipc-server.ts still owns ~6 large channel blocks inline despite the
  `per-domain-channel-module` pattern being established
- The streaming-handler pattern (AbortController + fanout + cleanup +
  envelope) is duplicated 8 times across both inline and already-extracted
  channels — extract the template first, then adopt during the split
- Several Zod schemas (`*IdSchema`, `*InputSchema`) are inlined and could
  consolidate
- `previewPrompt` handler at lines 851-933 is an 82-line god-function that
  composes prompts inline — should move with the config channel and
  ideally delegate to a service method

## Out of scope

- Renaming any channel (wire-level change). Channel names stay as-is.
- Adding new validation where none exists (see
  `feature-ipc-envelope-validation-coverage` — separate, behavior-changing).
- Restructuring the `services: Services` bag itself.

## Acceptance Criteria (feature-wide)

- [ ] `pnpm build` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm test` passes (including all `*-channel-envelope.test.ts` files)
- [ ] `wc -l packages/desktop/electron/main/ipc-server.ts` < 600 (target:
      orchestration + delegation only)
- [ ] Every previously-inline channel has its own
      `packages/desktop/electron/main/<domain>-channel.ts` exporting a
      `register*Handlers(services, [, webContentsGetter,
      activeAbortControllers], log)` per pattern
- [ ] Zero wire-format change — channel names, payload shapes, envelope
      shape preserved (verified by existing envelope tests passing
      unmodified)

## Risk

**Low** — pattern is established, tests exercise channels via the captured
handler map (not the defining file), and extractions are mechanical once
the streaming-handler template is in place. Risk surface is per-channel
ordering and avoiding double-registration of handlers during the partial
refactor.

## Rollback

`git revert <commit>` per extracted channel is clean; each extraction is
self-contained.
