---
id: gate-docs-changelog-missing
kind: story
stage: review
tags: [documentation]
parent: feature-release-v0.1.0-doc-findings
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# CHANGELOG.md does not exist in the repository

## Drift category
changelog-gap

## Location
- Doc: `CHANGELOG.md` (absent)
- Code: n/a — gap finding

## Current doc text
> File does not exist.

## Reality
There is no `CHANGELOG.md` at the repo root, in `docs/`, or anywhere
else under the project. The previous release `v0` (containing 18
features including all of Phases 1-16, the activity-rail chunk, the
language-sandbox-registry chunk, and Claude auth) shipped without an
entry. The v0.1.0 entry will land via release-deploy Phase 5.5, but the
gap for the prior v0 release is a finding now.

## Required edit
Create `/home/nathan/dev/praxis/CHANGELOG.md` with a Keep-a-Changelog-style
header and a backfilled `## v0` section enumerating the items bound to
`.work/releases/v0/` (foundation, engine layer, UI shell, verification
tools, textbook RAG, course bootstrap, adaptive memory, multi-mode
assessment, gates/progress map, knowledge-graph canonical pack,
configure-mode authoring, workspace notes/flashcards, editorial
foundation, tabs and library, sketch/concept maps, bootstrap explorer,
item types + quick checks, activity-rail, language sandbox registry,
Claude auth). The release-deploy Phase 5.5 step will then prepend the
v0.1.0 section.

## Implementation notes
Created `CHANGELOG.md` at the repo root with Keep-a-Changelog header and
a `v0 — 2026-05-09 (retro-release)` section. All 23 items in
`.work/releases/v0/` are enumerated across four thematic groups:
Foundation and engines, Content and curriculum, UI shell and editorial.
The file is left ready for release-deploy Phase 5.5 to prepend the
v0.1.0 section above the v0 block. No v0.1.0 section was added here.
