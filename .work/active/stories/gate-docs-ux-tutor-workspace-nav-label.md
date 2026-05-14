---
id: gate-docs-ux-tutor-workspace-nav-label
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

# UX.md menu tree calls the chat-workspace nav entry "Chat workspace"; the app-chrome label is now "Tutor"

## Drift category
foundation-doc-assertion

## Location
- Doc: `docs/UX.md:22,176-178`
- Code: `packages/ui/src/components/nav.tsx:35,64`

## Current doc text
> Line 22: ▸ Chat workspace (tabs)
> Line 176: ## Student surface — Chat workspace
> Line 178: Every session lives inside the chat workspace. It has a tab strip at the top…

## Reality
The nav entry in the top bar is labeled "Tutor"
(`packages/ui/src/components/nav.tsx:64`); the route path stays
`/chat` for deep-link compatibility. Individual tab titles come from
`Mode.displayName` (`packages/core/src/services/tabs-service.ts:34`),
e.g. "teach · new chat", "course design · new course".

## Required edit
Rename "Chat workspace" → "Tutor workspace" in the menu tree (line 22)
and the section header (line 176). In the first sentence of the
section, name the route (`/chat`) and clarify that the nav label is
"Tutor" and each tab's title comes from `Mode.displayName`. Keep
"chat tab body" / "chat thread" usage internally consistent — those
phrases describe the *thread surface*, not the menu label.

## Implementation

Updated `docs/UX.md` in three places:
- Line 22 menu tree: `▸ Chat workspace (tabs)` → `▸ Tutor workspace (tabs)`
- Line 176 section header: `## Student surface — Chat workspace` → `## Student surface — Tutor workspace`
- Line 178 opening sentence: expanded to name the `/chat` route, the "Tutor" nav label, and that tab titles derive from `Mode.displayName`

"chat tab body" and "chat thread" references within the section were left untouched — those describe the thread surface inside a tab, not the top-level nav label.

## Review

Approved.

**Correctness**: All three required sites updated correctly.
- Line 22 menu tree: `▸ Tutor workspace (tabs)` — matches nav.tsx:64 "Tutor".
- Line 176 section header: `## Student surface — Tutor workspace` — renamed.
- Line 178 opening sentence: names the `/chat` route, the "Tutor" nav label, and `Mode.displayName` as the source of tab titles. Example tab titles ("teach · algebra fractions", "course design · new course") are plausible and representative.

**Nav source-of-truth cross-check**: `packages/ui/src/components/nav.tsx:64` renders `Tutor` as the link text for the `/chat` route — doc and code agree.

**Preserved terminology**: "chat tab body" and "chat thread" usage inside the Tutor workspace section was correctly left alone; those describe the thread surface within a tab, not the nav label. Two remaining lowercase "chat workspace" occurrences (lines 171, 648) are descriptive noun phrases in cross-cutting prose — not nav-label assertions — and are outside the story's declared scope; they are acceptable as-is.

**Foundation-doc alignment**: No historical asides introduced. The doc describes the current state cleanly.
