---
id: gate-docs-changelog-v0-1-1-entry
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.1
gate_origin: docs
created: 2026-05-12
updated: 2026-05-12
---

# CHANGELOG.md has no v0.1.1 entry yet

## Drift category
changelog-gap

## Location
- Doc: `CHANGELOG.md:8` (current top entry is `## v0.1.0 — 2026-05-10`)
- Code: n/a (release-bundling step)

## Current doc text
> "## v0.1.0 — 2026-05-10"

## Reality
Release `v0.1.1` is at `stage: quality-gate` per `.work/active/release-v0.1.1.md`; 48 items are bound for shipping. CHANGELOG has no entry for it.

## Required edit
Add a `## v0.1.1 — 2026-05-12` section above the existing `v0.1.0` entry, summarizing the bootstrap-readiness epic, v1 security hardening, PPTX/DOCX ingestion, agent-transparency UX, prompt-customization layers, onboarding completion, editorial polish, and root-tsconfig typecheck coverage. (Phase 5.5 of `/agile-workflow:release-deploy` will draft this entry; the story tracks completion.)
