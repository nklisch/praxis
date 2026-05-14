---
id: gate-docs-tab-body-isolation-chat-line-anchor
kind: story
stage: implementing
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: docs
created: 2026-05-14
updated: 2026-05-14
---

# `tab-body-isolation` pattern's "mounting pattern" example cites `chat.tsx:106-110`; the block is now at `chat.tsx:175-182`

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/tab-body-isolation.md:19`
- Code: `packages/ui/src/routes/chat.tsx:175-182`

## Current doc text
> **File**: `packages/ui/src/routes/chat.tsx:106-110`

## Reality
The `openTabs.map(...)` block that mounts every tab body with
`display: contents | none` now lives at `chat.tsx:175-182` after the
tabs-context lift and chat.tsx restructuring. Snippet content matches
the doc.

## Required edit
Update the file:line anchor to
`packages/ui/src/routes/chat.tsx:175-182`.
