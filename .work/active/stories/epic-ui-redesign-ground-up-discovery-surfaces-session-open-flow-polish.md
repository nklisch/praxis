---
id: epic-ui-redesign-ground-up-discovery-surfaces-session-open-flow-polish
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-discovery-surfaces
depends_on: [epic-ui-redesign-ground-up-design-system-token-swap]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Session-open flow polish — animation, banner, scroll restoration

## Scope

Polish the session-open flow:
- Tab-slide-in animation on open.
- "Resumed" banner on resume after pause.
- Scroll restoration to last-read position on resume.

## Implementation steps

1. Edit the tab-strip + chat-tab-body to animate the new tab in
   (CSS transition on width / opacity).
2. New `<ResumedBanner>` component shown briefly when a session is
   re-opened (decays after ~3s).
3. Persist last-read scroll position per session id; restore on
   open.
4. Tests cover banner timing + scroll restoration.
5. Quality checks green.

## Acceptance criteria

- [ ] New tabs animate in.
- [ ] Resume shows the banner; fades.
- [ ] Scroll restores to last-read.
- [ ] All quality checks green.
