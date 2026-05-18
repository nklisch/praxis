---
id: epic-ui-redesign-ground-up-chat-workspace-homework-tab-body
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-chat-workspace
depends_on: [epic-ui-redesign-ground-up-chat-workspace-chat-shell-refined-bubbles]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Homework tab body — paginated batch + save/skip/flag

## Scope

Rewrite `HomeworkTabBody` per the locked `mode-homework.html` mock:
paginated multi-item batch, per-item save state with skip/flag,
agent clarifies item meaning only (no solutions), work-area with
typed/show-work/sketch tabs, final submit gates the whole set,
feedback delayed until submission.

## Implementation steps

1. Edit `packages/ui/src/components/homework-tab-body.{tsx,module.css}`.
2. Paginate items; persist per-item state in session storage.
3. Work-area tab strip: typed / show-work / sketch.
4. Final submit button gates feedback.
5. Tests covering pagination, save/skip/flag, submit gating.
6. Quality checks green.

## Acceptance criteria

- [ ] Homework tab body matches the locked mock.
- [ ] Per-item save/skip/flag persists.
- [ ] Feedback delayed until final submission.
- [ ] All quality checks green.
