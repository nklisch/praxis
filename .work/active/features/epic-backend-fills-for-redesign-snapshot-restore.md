---
id: epic-backend-fills-for-redesign-snapshot-restore
kind: feature
stage: drafting
tags: []
parent: epic-backend-fills-for-redesign
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Artifact snapshot / restore infrastructure

## Brief

The re-mocked drafter and configurator chat surfaces show every
agent-driven tool call landing with a **`↶ revert`** affordance — click
once, the artifact restores to its pre-call state. The architecture
was honestly re-framed away from pre-execution staging (Keep/Tweak/Revert)
toward **direct-call-with-undo**: tools execute immediately, but every
mutation is snapshot-backed and reversible.

This feature adds a **generic snapshot/restore layer** for artifact
mutations. Snapshot is captured before each agent-driven mutation
(course, gate, lesson, prompt, memory edits — anything the
configurator or drafter parent agents touch via authoring tools).
Restore rolls the artifact back to a named snapshot id. Generic enough
to work across all artifact tables; lightweight enough that snapshots
don't bloat storage.

What this feature does **not** cover: the chat-side UI rendering of
the ↶ revert button (that's the drafter-configurator-chat feature);
non-agent-driven mutations (manual edits from configure forms can
opt-in but aren't required to snapshot).

## Epic context

- Parent epic: `epic-backend-fills-for-redesign`
- Position in epic: **foundation feature** — `drafter-configurator-chat`
  depends on this for the ↶ revert affordance. Lands first.
- UI co-ships with: none directly; consumed via
  `drafter-configurator-chat`.

## Foundation references

- `docs/ARCHITECTURE.md` § "Artifact lifecycle" — where mutations
  happen today; this feature wraps the agent-driven mutations
- `docs/ARCHITECTURE.md` § "Tool dispatch architecture" — current
  flow `agent → registry.dispatch → handler → mutate` becomes
  `agent → registry.dispatch → snapshot → handler → mutate`
- `packages/tools/src/authoring/` — the four authoring tool families
  that need snapshot wrapping (course / gate / lesson / prompt)
- `.mockups/flows/course-create-entry/03-explorer-running.html` and
  `04-draft-ready.html` — re-mocked surfaces showing the ↶ revert
  affordance on every tool entry

<!-- The design pass will define the snapshot table schema, the
mutation-wrapping mechanism (decorator vs middleware in
registry.dispatch), the snapshot retention policy, and the restore
API surface. -->
