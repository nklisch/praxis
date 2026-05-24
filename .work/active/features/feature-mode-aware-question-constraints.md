---
id: feature-mode-aware-question-constraints
kind: feature
stage: drafting
tags: [content, tool-schema, agent-prompt, cross-package]
parent: epic-educational-content-rendering
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Mode-aware question-tool constraints + agent prompt fragment

## Brief

Cross-package work spanning `@praxis/curriculum` (mode definitions) and `@praxis/tools` (tool dispatch + validation) plus the agent-prompt-fragment plumbing that introduces the question tool to the agent each turn. The `ask_student_question` (and quick-check) Zod schemas become dynamic per mode — different modes carry different question density tolerances, and the agent reads the constraints for whichever mode it's in via system prompt fragment interpolation.

Proposed per-mode defaults (refine at design time):

| Mode | Prompt max | Choice max | Count | Multi cap |
|---|---|---|---|---|
| teach (quick-check) | 30 words | 10 words | 4 | 4 |
| homework / quiz / exam | 60 words | 25 words | 5 | 6 |
| course-create / configure | 50 words | 15 words | 5 | 6 |
| study-skills | 40 words | 12 words | 4 | 4 |

Implementation has three pieces: (1) `@praxis/curriculum` mode definition shape gets `questionConstraints?: { promptMaxWords, choiceMaxWords, choiceCount, multiSelectCap }`; (2) `@praxis/tools` `ask_student_question` handler reads active mode from `ToolContext`, validates against the resolved caps, returns descriptive errors that teach the constraint ("Choice text too long for teach mode — keep choices to ~10 words; longer reasoning belongs in the preceding tutor turn"); (3) the mode prompt fragment interpolates the per-mode caps AND the math-wrapping instruction from the sibling math-rendering feature — one fragment, two pieces of agent guidance, delivered together for whichever mode is active.

In scope: schema validation, mode-config schema change, the unified question-tool prompt fragment. Out of scope: the question chassis visual itself (lives in `feature-question-panel-rework` which depends on this feature for its design pass); the math-rendering pipeline (sibling feature); the broader content-renderer pipeline (sibling feature).

## Epic context

- Parent epic: `epic-educational-content-rendering`
- Position in epic: **agent-side companion** to the renderer features. The renderer features (`feature-content-renderer-pipeline`, `feature-math-rendering`) handle the UI side of educational content; this feature handles the AGENT side — telling the agent what shape its output should take so the renderer gets sensible input.

## Cross-epic dependency

This feature is a hard `depends_on` for `feature-question-panel-rework` (sibling epic `epic-chat-interaction-ux-overhaul`). The question chassis design pass needs the per-mode caps locked in before it can finalize layout, paging chrome, and selected-state typography against realistic content limits.

## Mockups

- Inherits design system: `.mockups/design-system/{tokens,motion,components}.css`
- Proposed treatments (renderer side, for reference): `.mockups/design-system/content-types.html` § Math (LaTeX-wrapping instruction the fragment will carry), § Callouts (admonition syntax the fragment will teach), § Citations (tool-call convention the fragment will document).
- Question chassis surfaces this feeds: `.mockups/screens/feature-question-panel-rework/responsive-showcase.html` (the dense stress-test that surfaced the need for caps) and `.mockups/screens/feature-question-panel-rework/state-single.html` / `state-multi-select.html` / `state-paged.html` (the chassis that will consume the caps).

## Foundation references

- `docs/ARCHITECTURE.md` § `@praxis/curriculum`, `@praxis/tools` — the two packages this feature touches.
- `.claude/rules/patterns.md` § `mode-prompt-fragment-composition` — the existing pattern this feature extends. Fragment composition by id+position; this feature adds one new fragment that interpolates per-mode constraint values.
- Epic body § "Agent contract — markup conventions + parser strategy" — full mapping of what the unified prompt fragment teaches (the agent-side surface this feature owns).
