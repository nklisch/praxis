---
id: epic-course-create-readiness-unified-landing-bypass-reroute
kind: story
stage: implementing
tags: [ui, navigation, course-authoring]
parent: epic-course-create-readiness-unified-landing
depends_on: [epic-course-create-readiness-unified-landing-source-picker]
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-23
---

# Bypass routes reroute pass

## Brief

Per the parent feature's design decision, reroute cold-start course-create
entry points through `/course-create` instead of starting sessions
directly. Resume paths (where re-picking source material would be
pointless mid-flight) stay direct.

## Scope

Per the routing matrix in the parent feature body:

| File:Line | Caller | New behavior |
|---|---|---|
| `packages/ui/src/routes/courses.tsx:20` | `handleNewCourse` | `navigate({ to: "/course-create" })` |
| `packages/ui/src/routes/courses.tsx:29` | `handleResumeDraft` | **unchanged** (resume is direct) |
| `packages/ui/src/routes/library.tsx:79` | `handleUsePack` | `navigate({ to: "/course-create", search: { pack: packId } })` |
| `packages/ui/src/routes/library.tsx:130` | `resume_draft` rec | **unchanged** (resume is direct) |

(Onboarding's `onboarding-flow.tsx:341` is handled in the sibling story
`epic-course-create-readiness-unified-landing-onboarding-slim`.)

## Acceptance Criteria

- [ ] `handleNewCourse` navigates to `/course-create` instead of starting
  a session directly.
- [ ] `handleUsePack` navigates to `/course-create?pack=<id>` using the
  URL contract established in the source-picker story.
- [ ] Resume paths unchanged (`handleResumeDraft`, `resume_draft` rec
  both still start sessions directly).
- [ ] No `openSessionInTab({ ..., modeId: "course-create" })` calls
  remain in the rerouted paths (search the codebase to confirm).
- [ ] UI tests cover: cold-start paths route through landing; resume
  paths don't.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation Notes

- The source-picker story landed the URL contract (`?pack=<id>`). Use it
  here.
- `navigate({ to: "/course-create", search: { pack: packId } })` is the
  TanStack Router shape; confirm by reading the source-picker
  implementation.
- For `handleNewCourse` (no pack pre-selection), just navigate to
  `/course-create` with no search params.

## Out of scope

- Source-picker UI changes (separate story).
- Onboarding refactor (separate story).
- /packs route removal (separate story).
