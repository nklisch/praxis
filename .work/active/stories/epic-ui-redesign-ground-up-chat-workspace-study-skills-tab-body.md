---
id: epic-ui-redesign-ground-up-chat-workspace-study-skills-tab-body
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

# Study-skills tab body — structured reflection + technique rail

## Scope

Rewrite `StudySkillsTabBody` per the locked `mode-study-skills.html`
mock: structured reflection prompts from the pedagogy pack; right
rail shows active technique + observed patterns + review queue.

## Implementation steps

1. Edit `packages/ui/src/components/study-skills-tab-body.{tsx,module.css}`.
2. Render pedagogy-pack reflection prompts in the center column.
3. Right rail with three sections (technique / patterns / queue),
   reading from the existing study-skills service.
4. Tests covering rail render + prompt sequence.
5. Quality checks green.

## Acceptance criteria

- [ ] Study-skills tab body matches the locked mock.
- [ ] Right rail surfaces all three sections.
- [ ] All quality checks green.
