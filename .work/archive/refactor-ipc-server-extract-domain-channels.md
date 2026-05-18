---
id: refactor-ipc-server-extract-domain-channels
kind: feature
stage: done
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

## Design correction (2026-05-18, refactor-design pass)

Reality is bigger than the original brief estimated. Channel inventory in
current `ipc-server.ts` (post stream-handler refactor):

- **130 `handle()` / `on()` registrations** across **22 unique domains**
- **7 domains already extracted** to their own channel files: `activity`,
  `courseCreate`, `ingest`, `quickCheck`, `recommendations`, `subAgent`,
  `citations`
- **15 domains still inline** in ipc-server.ts: `artifacts`, `assignments`,
  `auth`, `author`, `conceptMaps`, `config`, `documents`, `flashcards`,
  `library`, `lock`, `memory`, `notes`, `packs`, `session`, `shell`,
  `sketches`, `tabs`, `update`

The original feature body's "6 channel blocks" estimate was based on the
discovery scan reading line ranges; the actual unique-domain count is 15
not counting the already-extracted ones.

ipc-server.ts is currently 1996 LoC (already down from 2066 after prior
work). Post-refactor target: ~400-500 LoC — pure orchestration that calls
each `register<Domain>Handlers(services, ...)` function in sequence, plus
the streaming-channel teardown cleanup and shutdown handling.

## Refactor Overview

Three sequential child stories. All edit ipc-server.ts (removing inline
registrations) so they chain via `depends_on` to avoid git conflicts. Each
extraction follows the established pattern from already-extracted channels
(see `activity-channel.ts`, `recommendations-channel.ts`, etc. for the
canonical shape).

### Standard extraction pattern (per domain)

For domain `X`:

1. Create `packages/desktop/electron/main/<X>-channel.ts` exporting
   `register<X>Handlers(services, log)` (or with extra args
   `webContentsGetter, activeAbortControllers` if the domain has streaming
   handlers — most don't).
2. Move every `handle("praxis.<X>.*")` registration from ipc-server.ts
   into the new file, preserving the exact handler bodies and using
   `createIpcHelpers(log)` to get the typed `{ handle, on }` pair.
3. In ipc-server.ts's wiring block, add `register<X>Handlers(services, log)`
   alongside the existing register calls.
4. Confirm the streaming-handler helpers (`registerSubscriberStream`,
   `registerGeneratorStream`) are reused where the domain has streaming
   endpoints (memory.episodic, session.send — these already use the
   helpers inline; just move them with everything else).
5. Preserve removeAllListeners calls in the teardown section of
   ipc-server.ts where they reference the domain's cancel channels.

### Per-step grouping

| Step | Domains | Approx handlers | Story |
|---|---|---|---|
| 1 | `auth`, `shell`, `update`, `lock`, `library`, `documents`, `packs` (7 small/medium) | ~25-35 | `refactor-ipc-server-extract-domain-channels-step-1-small-domains` |
| 2 | `memory`, `notes`, `config`, `sketches`, `tabs`, `conceptMaps`, `assignments`, `flashcards` (8 medium) | ~35-50 | `refactor-ipc-server-extract-domain-channels-step-2-medium-domains` |
| 3 | `artifacts`, `author`, `session` (3 large) | ~45-50 | `refactor-ipc-server-extract-domain-channels-step-3-large-domains` |

Each step extracts its full set of domains into per-domain channel files
and removes the inline registrations from ipc-server.ts. Single commit per
step.

Sequencing: step 2 depends_on step 1; step 3 depends_on step 2.

## Refactor Steps

### Step 1: Extract small/medium domains
**Priority**: High (smallest scope; establishes the pattern at scale)
**Risk**: Low (mechanical extractions; pattern is established)
**Files**: 
- NEW: `packages/desktop/electron/main/{auth,shell,update,lock,library,documents,packs}-channel.ts` (7 new files)
- `packages/desktop/electron/main/ipc-server.ts` (remove inline registrations; add register calls)
**Story**: `refactor-ipc-server-extract-domain-channels-step-1-small-domains`

**Per-domain extraction approach**: same pattern as `activity-channel.ts` 
(reference: post step-1 of stream-handler refactor, commit `e2a46f9`). Each 
new file exports `register<Domain>Handlers(services, log)` taking the 
canonical Services + Logger signature. If a domain has streaming handlers, 
also accept `webContentsGetter` and `activeAbortControllers`.

**Verification per step**:
- `pnpm --filter @praxis/desktop typecheck`
- `pnpm --filter @praxis/desktop test` (especially `*-channel-envelope.test.ts` and `ipc-server.envelope-migration.test.ts`)
- `pnpm biome check packages/desktop/electron/main/`
- Wire format preserved (channel names unchanged; envelope shapes unchanged)

**Acceptance**:
- 7 new channel files created
- `ipc-server.ts` LoC drops by ~150
- All existing IPC tests pass unmodified

**Risk**: Low. Pattern-mirror; tests cover the surface.
**Rollback**: `git revert <commit>` — clean.

---

### Step 2: Extract medium domains
**Priority**: High
**Risk**: Low-Medium (includes `memory` which has streaming handler — already uses helper, just moves)
**Files**: 
- NEW: `packages/desktop/electron/main/{memory,notes,config,sketches,tabs,conceptMaps,assignments,flashcards}-channel.ts` (8 new files)
- `packages/desktop/electron/main/ipc-server.ts`
**Story**: `refactor-ipc-server-extract-domain-channels-step-2-medium-domains`
**Depends on**: `refactor-ipc-server-extract-domain-channels-step-1-small-domains`

Same shape as Step 1. The `memory` channel's streaming endpoint
(`praxis.memory.episodic.start` + `.cancel`) currently uses
`registerGeneratorStream` inline in ipc-server.ts (post stream-handler
step 4) — move it cleanly into `memory-channel.ts`.

**Acceptance**:
- 8 new channel files created
- `ipc-server.ts` LoC drops by ~250 from end-of-step-1
- Memory streaming + envelope tests all pass unmodified

**Risk**: Low-Medium. Memory channel's streaming nature is the only added complexity.
**Rollback**: `git revert <commit>` — clean.

---

### Step 3: Extract large domains
**Priority**: High
**Risk**: Medium (session is hot path; author is the biggest with ~24 handlers)
**Files**: 
- NEW: `packages/desktop/electron/main/{artifacts,author,session}-channel.ts` (3 new files)
- `packages/desktop/electron/main/ipc-server.ts`
**Story**: `refactor-ipc-server-extract-domain-channels-step-3-large-domains`
**Depends on**: `refactor-ipc-server-extract-domain-channels-step-2-medium-domains`

Same shape. After this step ipc-server.ts becomes pure orchestration: 
helper setup (createIpcHelpers, getStudentId), then a sequence of 
`register<Domain>Handlers(services, log)` calls, then the cleanup/shutdown 
handler that removes listeners for cancellable streaming channels.

The `session` channel's `praxis.session.send.start` + `.cancel` streaming 
handlers (currently using `registerGeneratorStream` inline) move cleanly 
into `session-channel.ts`.

**Acceptance**:
- 3 new channel files created
- `ipc-server.ts` LoC drops to **< 500** (target ~400 — orchestration + cleanup only)
- Session streaming + all envelope tests pass unmodified
- All 130 channel registrations now happen via `register<Domain>Handlers` calls

**Risk**: Medium. Session is on the hot path of every tutor turn — verify 
session streaming end-to-end via `ipc-server.cancel.test.ts`, 
`streaming-channel-error-redaction.test.ts`, and the envelope tests.
**Rollback**: `git revert <commit>` — clean per step.

---

## Implementation Order

1. Step 1 (`step-1-small-domains`) — no deps
2. Step 2 (`step-2-medium-domains`) — depends on Step 1
3. Step 3 (`step-3-large-domains`) — depends on Step 2

Each step is a single commit; chain ensures clean ipc-server.ts edits.

## Atomic-step acknowledgments

None. Per-step extraction; each step preserves wire format. Tests at every
step. Each step independently reversible.

## Out-of-scope follow-ups

- **No new envelope-validation wrapping** (that's behavior-changing; covered by `feature-ipc-envelope-validation-coverage` which already landed).
- **No renaming of channels** (wire-format break).
- **No restructuring of `Services` or `ServiceDeps`** — extraction is structural only.
- A potential post-extraction cleanup: many of the inline `handle/on` blocks in the new channel files will share a pattern that could collapse further (e.g., a generic `handleEnvelope`-shaped registration loop driven by a schema map). Out of scope; if the pattern emerges clearly, file a separate refactor.

## Implementation Run Summary

3 sequential child stories implemented and approved. ipc-server.ts
collapsed from **1996 → 183 LoC** (a 91% reduction). All 130+ IPC handlers
now live in per-domain channel files; ipc-server.ts is pure orchestration.

| Step | Commit | Domains | Handlers | ipc-server.ts LoC |
|------|--------|---------|----------|-------------------|
| 1 | `b660850` | auth, shell, update, lock, library, documents, packs (7) | 19 | 1996 → 1811 |
| 2 | `8489e3b` | memory, notes, config, sketches, tabs, conceptMaps, assignments, flashcards (8) | 59 | 1811 → 972 |
| 3 | `dd9f96c` | artifacts, author, session (3) | 44 | 972 → 183 |

**Total**: 18 new channel files, ~122 handlers extracted. (The remaining 7
domains — activity, courseCreate, ingest, quickCheck, recommendations,
subAgent, citations — were pre-extracted before this feature.)

### Cross-cutting deviations

- **`getStudentId` regression** across all extracted channels: ~42 inline
  `brandId<"StudentId">(services.getDefaultStudentId()) as StudentId`
  casts replaced the prior single closure in ipc-server.ts. Parked as
  `idea-share-getstudentid-helper-across-channels` — a future shared
  helper module will consolidate.
- **`previewPrompt` god-function** in author-channel.ts moved verbatim
  (~82 LoC of inline prompt composition). Parked as
  `idea-refactor-previewprompt-god-function` — the composition logic
  belongs in a service method.
- **Local `requireUnlocked` duplication**: both `config-channel.ts` and
  `author-channel.ts` define their own `requireUnlocked()` closure. Could
  consolidate to a shared helper alongside `getStudentId` if a future
  refactor batches them.
- **`registeredChannels` tracking** removed in step 3 since no inline
  handlers remain. Pre-existing per-channel files never used the tracking
  anyway.

### Verification status

- **Typecheck**: pre-existing 3 UI errors only; no new errors in
  electron/main
- **Tests**: 493 desktop main tests pass; critical streaming + cancel +
  envelope tests all preserved
- **Lint (biome)**: clean on all 18 new channel files. Side benefit:
  `lessonAssessments` biome-ignore placement bug in ipc-server.ts was
  fixed during step 3's artifacts extraction.
- **Wire format**: 130+ channel names preserved exactly; envelope shapes
  preserved; cancel semantics preserved; streaming patterns preserved.
- **Memory streaming verified**: step 2 (memory.episodic) — passes
- **Session streaming verified**: step 3 (session.send) — passes

### What's now possible

- Adding a new IPC handler is a single-file change (the domain's channel
  file), not a hunt through 2000 lines of ipc-server.ts.
- Per-channel envelope tests are now cleanly aligned with the channel
  module they cover.
- Future `feature-ipc-envelope-validation-coverage`-style work
  (adding/updating per-channel validation) lands in a focused 30-line file.
- The `stream-handler.ts` helper landed earlier (commit `e2a46f9`) is now
  the canonical streaming pattern across all extracted channels —
  activity, memory, session all use it.

## Review (2026-05-18)

**Verdict**: Approve (aggregate)

**Blockers**: none
**Important**: none
**Nits**: see child story reviews. Both follow-ups (getStudentId helper,
previewPrompt refactor) parked to backlog.

**Aggregate lens findings**:
- **Design alignment**: the design correction during refactor-design
  honestly updated the brief's "6 channel blocks" estimate to the actual
  "15 domains remaining". The 3-step grouping (small/medium/large) was
  the right shape; serializing via depends_on chain kept ipc-server.ts
  edits clean.
- **Foundation-doc alignment**: `docs/ARCHITECTURE.md` describes the IPC
  transport layer at a high level; doesn't pin specific file layouts.
  The `.claude/skills/patterns/per-domain-channel-module.md` pattern doc
  is now satisfied by every IPC channel, with no inline-domain holdouts
  in ipc-server.ts.
- **Breaking changes**: none. Every channel name and envelope shape
  preserved. Hot-path session.send streaming verified.
- **Capability completeness**: the IPC layer is now structurally clean.
  ipc-server.ts is orchestration only; per-domain channels own their
  handlers; streaming endpoints adopt the canonical `stream-handler.ts`
  helper.

**Notes**: This is the biggest single delivery in this autopilot run
(measured by LoC delta). ipc-server.ts dropped from the largest source
file in the workspace to a thin coordinator. The 3-step sequential plan
de-risked the size; each step landed cleanly with full test verification.
