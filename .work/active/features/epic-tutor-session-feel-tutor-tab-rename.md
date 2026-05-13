---
id: epic-tutor-session-feel-tutor-tab-rename
kind: feature
stage: drafting
tags: [ui, chat, tutor-ux]
parent: epic-tutor-session-feel
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Tutor tab rename — teaching-shaped term for the session surface

## Brief

The chat tab is a tutoring session, but it's labeled "Chat" — a name borrowed
from generic LLM products. The label is rendered from a server-side
`TabSummary.title` (`packages/ui/src/components/tab-strip.tsx:48`) populated
when the tab is opened
(`packages/ui/src/lib/open-session-in-tab.ts:24-26`). The per-mode SSOT
`ModeMeta` (`packages/ui/src/components/mode-meta.ts:10-79`) already names
modes for the in-session header (e.g., bootstrap → "course design"), but the
tab title doesn't use that data path consistently.

This feature picks a teaching-shaped name for the tab (candidates from the
park: Tutor / Teacher / Lesson / Session — final choice at feature-design
time, and may vary by mode), and updates the tab-title flow so the tab
label matches the mode's identity from `ModeMeta`. Out of scope: changing
the `chat` mode-id (it's a DB key; only UI strings move). The in-session
`<ModeHeader>` already renders correctly from `ModeMeta`; this feature
brings the tab label into the same SSOT.

## Epic context

- Parent epic: `epic-tutor-session-feel`
- Position in epic: independent UI rename — wave 1, parallelizable with the
  three other children. Smallest feature in the epic.

## Foundation references

- `docs/ARCHITECTURE.md:343` — "Chat — primary interaction. Streamed model
  messages plus selected tool I/O." This feature touches the surface name,
  not the surface behavior.

## Anchors

- Tab rendering — `packages/ui/src/components/tab-strip.tsx:48`
  (renders `tab.title` from `TabSummary`)
- Tab creation — `packages/ui/src/lib/open-session-in-tab.ts:24-26`
  (`client.tabs.open()` sets the initial title)
- Mode SSOT — `packages/ui/src/components/mode-meta.ts:10-79`
- In-session header (already renders from ModeMeta) —
  `packages/ui/src/components/mode-header.tsx:90-106`
- Tab-body dispatcher — `packages/ui/src/components/chat-tab-body.tsx:355-370`
- Server-side tab persistence — `tabs` table (SPEC.md:20)

## Design notes for feature-design

- Name choice (resolved): **use per-mode names from `ModeMeta`** as the
  tab title — bootstrap → "Course design", teach → "Tutor", quiz →
  "Quiz", homework → "Homework", exam → "Exam", study-skills →
  "Study skills". Reuses an existing SSOT; aligns the tab title with the
  in-session header; preserves mode distinction in the tab strip. If any
  current `ModeMeta` entry doesn't have a teaching-shaped name yet,
  update it in this feature.
- Backfill: existing rows in the `tabs` table have stale titles like
  "Chat". Pick at feature-design — migration that rewrites titles from
  the corresponding mode-id, or lazy refresh (re-derive title on load
  if it's stale). Migration is cleaner; lazy is Praxis's usual style.
- Mode-id changes: NONE. Only the human-facing string moves.
