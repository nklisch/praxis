---
id: epic-backend-fills-for-redesign-ui-completion-bundle-create-course-cta
kind: story
stage: implementing
tags: [ui]
parent: epic-backend-fills-for-redesign-ui-completion-bundle
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Library "+ Create a course" CTA

## Scope

Add a direct create-from-scratch button to the library Workbench so a
new user has a cold-start entry point that isn't "Use this pack."

## Implementation steps

1. Locate the library/Workbench route component
   (`packages/ui/src/routes/library.tsx` or equivalent).
2. Add a "+ Create a course" button styled per the locked discovery
   mock (`.mockups/screens/.../-discovery-surfaces/option-4.html`).
3. On click, invoke the existing course-create entry point — call
   `praxisClient.bootstrap.startExploration` (or whatever the renamed
   equivalent is once `idea-rename-bootstrap-and-explorer` lands) to
   open a new course-create session.
4. Use the `session-tab-open-flow` pattern to open the new session
   in a tab.
5. Tests: `library.test.tsx` covering the CTA + spawn flow with a
   fake client.
6. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] "+ Create a course" button visible in the library.
- [ ] Click opens a course-create session and navigates to its tab.
- [ ] All quality checks green.

## Out of scope

- Renaming the underlying tool / mode id — tracked separately at
  `.work/backlog/idea-rename-bootstrap-and-explorer.md`.
