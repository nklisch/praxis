---
id: gate-docs-architecture-claude-cli-sdk-package
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.0
gate_origin: docs
created: 2026-05-10
updated: 2026-05-10
---

# ARCHITECTURE.md package table omits `@praxis/claude-cli-sdk`

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/ARCHITECTURE.md:47-59`
- Code: `packages/claude-cli-sdk/`

## Current doc text
> The package table lists 9 packages: `@praxis/core`, `@praxis/client`,
> `@praxis/engines`, `@praxis/memory`, `@praxis/artifacts`,
> `@praxis/tools`, `@praxis/curriculum`, `@praxis/ui`, `@praxis/desktop`,
> plus the deferred `praxis-ingest` row.

## Reality
A 10th workspace package, `@praxis/claude-cli-sdk` (forked in-tree from
`@nklisch/claude-cli-sdk`), exists in `packages/claude-cli-sdk/`. CLAUDE.md
(line 60) and README.md (line 143) both list it; the
claude-cli-sdk-refactor feature treats it as a first-class workspace
package. ARCHITECTURE.md is the only foundation doc that omits it.

## Required edit
Add a row to the ARCHITECTURE.md package table for `@praxis/claude-cli-sdk`
describing it as the in-tree TypeScript wrapper around the Claude Code
CLI subprocess (consumed by `@praxis/engines`'s Claude Code adapter),
matching the wording in CLAUDE.md.
