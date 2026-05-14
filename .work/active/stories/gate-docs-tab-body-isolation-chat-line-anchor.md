---
id: gate-docs-tab-body-isolation-chat-line-anchor
kind: story
stage: done
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

## Implementation

Updated the file:line anchor only. The story cited 175-182, but verification showed the actual block spans lines 176-184 (`{openTabs.map((t) => (` at 176 through the closing `</div>` at 184). The anchor was updated to `chat.tsx:176-184`. The snippet content in the pattern doc (JSX structure, `display: contents | none`, `className={styles.tabBodyMount}`, `<ChatTabBody tab={t} />`) matches the code exactly — no snippet update needed.

## Review (2026-05-14)

Verified `chat.tsx:176-184` against the live file. Line 176 is `{openTabs.map((t) => (` and line 184 is the closing `})}` — the range is exact. The pattern doc snippet matches the code character-for-character. The implementer's correction from the story's stated 175-182 to the actual 176-184 is correct.

**Verdict: Approve.**
