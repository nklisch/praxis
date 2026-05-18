---
id: refactor-rename-bootstrap-and-explorer
kind: feature
stage: drafting
tags: [refactor, naming, curriculum, tools]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-18
---

# Refactor: rename bootstrap + explorer to course-create + drafter

## Brief

Internal CS jargon ("bootstrap", "explorer") has been bleeding through to
student- and configurator-facing UI surfaces. UI mocks have been retrofitted
to use **"Create a course"** (replacing "bootstrap") and to **drop the named
agent entirely** — framing the work ("Praxis is drafting", "the draft is
taking shape") instead of personifying an internal agent ("the explorer is
exploring"). Backend code, tool names, mode ids, prompt files, and foundation
docs need to be aligned with the new naming so the UI surface stays
consistent and future refactors don't reintroduce the bleed.

This is a cross-package rename — not a behavioral change. The architecture
stays the same; the labels change. Foundation docs (CURRICULUM.md,
ARCHITECTURE.md, SPEC.md, VISION.md) get rolled forward in place during
the refactor, never with "previously named bootstrap" prose. Tool name
changes are a wire-level break, so this needs a careful sweep — handlers,
schemas, tests, MCP bridge bindings, and any episodic events that reference
the old names.

## Surface area (initial sweep)

- **Mode id** `bootstrap` → `course_create` (or reconsider whether this is a
  session mode at all — it may be better modeled as an authoring action)
- **Agent class** `Explorer` / `ExplorerAgent` → `Drafter`, or remove the
  named agent abstraction entirely if it's a thin wrapper
- **Tool** `course.start_exploration` → `course.start_drafting`; consider
  whether `course.draft_*` tool family already matches the new naming
- **Prompt files** `bootstrap/explorer-prompt.ts` → `course-create/drafter-prompt.ts`
- **Service / type names** any `Bootstrap*` / `Explorer*` symbols in
  `@praxis/core`, `@praxis/tools`, `@praxis/curriculum`
- **Foundation docs** sections in `docs/CURRICULUM.md`, `docs/ARCHITECTURE.md`,
  `docs/SPEC.md`, `docs/VISION.md`, `docs/UX.md` that describe the bootstrap
  explorer flow
- **Tests** any test fixture / describe-block name that uses old terms
- **UI** any remaining lingering UI strings (mocks are already updated; this
  is the safety net to catch real-component drift)

The refactor design phase will produce the exact file list, before/after
mapping per file, risk and rollback per step, and child stories per logical
step.

## Out of scope

- Changing what the drafter does. This is rename-only.
- Changing the UI mocks. They already use the new naming.
- Removing the bootstrap mode if it's still architecturally distinct — this
  refactor renames; reconsidering the mode-vs-action question is a separate
  scope.

## Why a feature (not a story)

- Cross-package surface area (curriculum, tools, core/services, engines via
  prompt files, ui, docs)
- Tool name change is a wire-level concern (MCP bridge, schemas, episodic
  records that reference the tool name)
- Mode id change cascades through pedagogy packs, gates, prompt fragment
  composition, and any persisted session rows that store `mode_id`
- Foundation docs need careful in-place rolling; not a single-pass sed

## Next

`/agile-workflow:refactor-design` reads this feature, produces a step-by-step
plan written into the body of this file, spawns child stories at
`.work/active/stories/refactor-rename-bootstrap-and-explorer-*.md`, and
advances `stage: drafting` → `stage: implementing`.
