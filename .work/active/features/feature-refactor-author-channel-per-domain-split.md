---
id: feature-refactor-author-channel-per-domain-split
kind: feature
stage: done
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-24
---

# Split `author-channel.ts` per the per-domain-channel-module pattern

## Brief
`packages/desktop/electron/main/author-channel.ts` is 537 lines holding 27 IPC handler
registrations across six distinct sub-domains:
- Course ops
- Lesson ops
- Gate ops
- Prompt customization
- Memory ops
- Configurator actions

This violates the `per-domain-channel-module` pattern (see
`.claude/skills/patterns/per-domain-channel-module.md`), which says each cohesive IPC
domain lives in its own `<domain>-channel.ts` exporting
`registerXxxHandlers(services, ..., log)`, wired into `ipc-server.ts` as a single call.

Every other major IPC surface in the codebase follows this pattern. `author-channel.ts`
is the outlier and is large enough that the cost of the violation is visible.

## Refactor target
Split into per-sub-domain channel modules under
`packages/desktop/electron/main/author/` (or similar):
- `author-course-channel.ts` — `registerAuthorCourseHandlers(services, ..., log)`
- `author-lesson-channel.ts` — `registerAuthorLessonHandlers(services, ..., log)`
- `author-gate-channel.ts` — `registerAuthorGateHandlers(services, ..., log)`
- `author-prompt-channel.ts` — `registerAuthorPromptHandlers(services, ..., log)`
- `author-memory-channel.ts` — `registerAuthorMemoryHandlers(services, ..., log)`
- `author-configurator-channel.ts` — `registerAuthorConfiguratorHandlers(services, ..., log)`

`ipc-server.ts` wires each register-function as one call. Channel naming
(`praxis.author.<sub>.<action>`) stays identical so client-side consumers don't change.

## Constraints
- Channel names on the wire must not change — client `unwrapEnvelope` callers stay
  identical.
- Envelope semantics (`handleEnvelope` / `wrapEnvelope` per `ipc-envelope-handler`
  pattern) and `getStudentId(services)` server-resolution stay identical.
- The split affects only the file organization of the registrations, not the handler
  bodies themselves.

## Discovery evidence
- File length: 537 lines (verified)
- Handler count: 27 IPC handlers in one `registerAuthorHandlers()` function
- Pattern violation: `per-domain-channel-module` (28 other channel files follow it)

## Refactor Overview

**Actual handler count**: 25 (the brief stated 27; actual file has 25 `handle(...)` registrations).

Split `author-channel.ts` into 6 sub-domain modules under `packages/desktop/electron/main/`:
- `author-course-channel.ts` — 2 handlers
- `author-lesson-channel.ts` — 3 handlers
- `author-gate-channel.ts` — 4 handlers
- `author-prompt-channel.ts` — 10 handlers (largest; cohesive via 2 shared schemas)
- `author-memory-channel.ts` — 4 handlers
- `author-configurator-channel.ts` — 2 handlers

All 6 modules take `(services: Services, log: Logger)` — no streaming channels exist in author-channel, so no `webContentsGetter` or `activeAbortControllers` needed.

`requireUnlocked()` is a local function inside each module (not exported — it's an internal guard calling `services.lock.isUnlocked()`).

## Handler-to-Module Assignment

| Channel | Module |
|---|---|
| `praxis.author.updateCourse` | author-course-channel.ts |
| `praxis.author.getCourseSummary` | author-course-channel.ts |
| `praxis.author.createLesson` | author-lesson-channel.ts |
| `praxis.author.updateLesson` | author-lesson-channel.ts |
| `praxis.author.deleteLesson` | author-lesson-channel.ts |
| `praxis.author.createGate` | author-gate-channel.ts |
| `praxis.author.updateGate` | author-gate-channel.ts |
| `praxis.author.deleteGate` | author-gate-channel.ts |
| `praxis.author.overrideGate` | author-gate-channel.ts |
| `praxis.author.customizePrompt` | author-prompt-channel.ts |
| `praxis.author.listFragmentOverrides` | author-prompt-channel.ts |
| `praxis.author.clearFragmentOverride` | author-prompt-channel.ts |
| `praxis.author.setStyleSliders` | author-prompt-channel.ts |
| `praxis.author.setGlobalPrompt` | author-prompt-channel.ts |
| `praxis.author.getGlobalPrompt` | author-prompt-channel.ts |
| `praxis.author.setModeAppend` | author-prompt-channel.ts |
| `praxis.author.getModeAppend` | author-prompt-channel.ts |
| `praxis.author.previewPrompt` | author-prompt-channel.ts |
| `praxis.author.previewPromptWithAttribution` | author-prompt-channel.ts |
| `praxis.author.resetConcept` | author-memory-channel.ts |
| `praxis.author.clearMisconception` | author-memory-channel.ts |
| `praxis.author.exportMemory` | author-memory-channel.ts |
| `praxis.author.deleteAllMemory` | author-memory-channel.ts |
| `praxis.author.listConfiguratorActions` | author-configurator-channel.ts |
| `praxis.author.restoreAction` | author-configurator-channel.ts |

## Refactor Steps

### Step 1: Extract author-course-channel.ts
- **File**: `feature-refactor-author-channel-per-domain-split-step-1-course.md`
- **Priority**: High | **Risk**: Low
- **Handlers**: `updateCourse`, `getCourseSummary`
- Exports `registerAuthorCourseHandlers(services, log)`.

### Step 2: Extract author-lesson-channel.ts
- **File**: `feature-refactor-author-channel-per-domain-split-step-2-lesson.md`
- **Priority**: High | **Risk**: Low
- **Handlers**: `createLesson`, `updateLesson`, `deleteLesson`
- Exports `registerAuthorLessonHandlers(services, log)`.

### Step 3: Extract author-gate-channel.ts
- **File**: `feature-refactor-author-channel-per-domain-split-step-3-gate.md`
- **Priority**: High | **Risk**: Low
- **Handlers**: `createGate`, `updateGate`, `deleteGate`, `overrideGate`
- Exports `registerAuthorGateHandlers(services, log)`.

### Step 4: Extract author-prompt-channel.ts
- **File**: `feature-refactor-author-channel-per-domain-split-step-4-prompt.md`
- **Priority**: High | **Risk**: Low
- **Handlers**: `customizePrompt`, `listFragmentOverrides`, `clearFragmentOverride`, `setStyleSliders`, `setGlobalPrompt`, `getGlobalPrompt`, `setModeAppend`, `getModeAppend`, `previewPrompt`, `previewPromptWithAttribution`
- Moves `modeIdSchema` and `previewPromptSchema` into this module (both were only used by this group).
- Exports `registerAuthorPromptHandlers(services, log)`.

### Step 5: Extract author-memory-channel.ts
- **File**: `feature-refactor-author-channel-per-domain-split-step-5-memory.md`
- **Priority**: High | **Risk**: Low
- **Handlers**: `resetConcept`, `clearMisconception`, `exportMemory`, `deleteAllMemory`
- Needs `getStudentId` import (3 of 4 handlers resolve studentId server-side).
- Exports `registerAuthorMemoryHandlers(services, log)`.

### Step 6: Extract author-configurator-channel.ts
- **File**: `feature-refactor-author-channel-per-domain-split-step-6-configurator.md`
- **Priority**: High | **Risk**: Low
- **Handlers**: `listConfiguratorActions`, `restoreAction`
- Exports `registerAuthorConfiguratorHandlers(services, log)`.

### Step 7: Wire ipc-server.ts and delete author-channel.ts
- **File**: `feature-refactor-author-channel-per-domain-split-step-7-wire-and-delete.md`
- **Priority**: High | **Risk**: Medium (composition root change)
- **Depends on**: steps 1–6 all merged
- Replaces the single `registerAuthorHandlers(services, log)` call with 6 calls to the new modules.
- Deletes `author-channel.ts`.

## Implementation Order

Steps 1–6 have no dependencies on each other (each extracts a disjoint set of handlers from `author-channel.ts`). They can be implemented in parallel or in any order. Step 7 depends on all of 1–6.

```
Step 1 (course)      ─┐
Step 2 (lesson)      ─┤
Step 3 (gate)        ─┼──→ Step 7 (wire + delete)
Step 4 (prompt)      ─┤
Step 5 (memory)      ─┤
Step 6 (configurator)─┘
```

## Notes on original handler count discrepancy
The feature brief said 27 handlers; actual count is 25. The doc comment at the top of `author-channel.ts` lists 25 channels (counting correctly), but the summary in `.work/active/features/` said 27. The split is planned against the actual 25.

## Implementation summary

All 7 child stories advanced to `done` in this autopilot run:
- Step 1 (course): `author-course-channel.ts`, 2 handlers, commit `68b25a7` → review `ce8e28b`
- Step 2 (lesson): `author-lesson-channel.ts`, 3 handlers, commit `0f5cfd4` → review `ce8e28b`
- Step 3 (gate): `author-gate-channel.ts`, 4 handlers, commit `cb9cc51` → review `ce8e28b`
- Step 4 (prompt): `author-prompt-channel.ts`, 10 handlers + 2 shared schemas, commit `21cdfca` → review `9f51f3c`
- Step 5 (memory): `author-memory-channel.ts`, 4 handlers (3 with `getStudentId`), commit `44f214e` → review `9f51f3c`
- Step 6 (configurator): `author-configurator-channel.ts`, 2 handlers, commit `2046ec7` → review `9f51f3c`
- Step 7 (wire + delete): ipc-server.ts updated + author-channel.ts deleted (537 lines removed), commit `2aca454` → review `58e12f1`

**Final state**: `author-channel.ts` gone. 25 `praxis.author.*` channels served by 6 per-domain modules following the `per-domain-channel-module` pattern. 520 desktop tests pass; full workspace 4769 tests pass; typecheck clean.

**No deviations** from the design — actual handler count was 25 (design corrected the brief's 27 during Phase 1). All other steps executed as planned.

## Review

**Verdict: done**

Reviewed 2026-05-24.

Checks:
- All 7 child stories at `stage: done` (steps 1–7).
- `author-channel.ts` deleted — file does not exist.
- 6 new per-domain modules present: `author-course-channel.ts`, `author-lesson-channel.ts`, `author-gate-channel.ts`, `author-prompt-channel.ts`, `author-memory-channel.ts`, `author-configurator-channel.ts`.
- Desktop test suite: 34 files / 520 tests — all pass.

Implementation matches the design exactly. No deviations, no blockers.
