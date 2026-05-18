---
id: epic-ui-redesign-ground-up-discovery-surfaces-course-create-entry-path
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-discovery-surfaces
depends_on: [epic-ui-redesign-ground-up-design-system-token-swap]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Course-create entry path — 5-step flow

## Scope

Multi-page entry path per the locked
`.mockups/flows/course-create-entry/`: library CTA → upload screen
→ drafting page (with steering chat) → draft-ready page → materialize
handoff.

## Implementation steps

1. Library CTA — already added by sibling
   `epic-backend-fills-for-redesign-ui-completion-bundle-create-course-cta`;
   this story consumes the existing button.

2. Upload screen — new route component for document upload step;
   wires to existing `documents.ingest` IPC.

3. Drafting page — mounts the course-create tab body (delegated to
   `epic-backend-fills-for-redesign-drafter-configurator-chat-course-create-tab-body`);
   this story handles the route shell.

4. Draft-ready page — shows full assessment-plan (consumes the
   `lesson-assessment-pills` sibling story output) and a "Materialize
   course" CTA.

5. Materialize handoff — call `bootstrap.confirmDraft`, open the
   first session tab via `session-tab-open-flow`.

6. Tests cover each route transition.

7. Quality checks green.

## Acceptance criteria

- [ ] Each step renders per the locked mock.
- [ ] Materialize handoff opens the first session tab.
- [ ] All quality checks green.
