---
id: gate-docs-ux-tutor-workspace-nav-label
kind: story
stage: drafting
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
