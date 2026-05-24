---
id: feature-refactor-author-channel-per-domain-split
kind: feature
stage: drafting
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-23
updated: 2026-05-23
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

## Next
Per-feature design via `/agile-workflow:refactor-design feature-refactor-author-channel-per-domain-split`
to enumerate the exact handler-to-module assignment, file paths, and migration order.
