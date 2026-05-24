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

## Design decisions

*(captured 2026-05-24 via `feature-design --only-questions`. These lock in directional choices so the full design pass inherits them.)*

- **Enforcement: hard reject with descriptive error**. Over-cap calls fail via Zod validation; the failure returns a `tool_result` whose error message is written for the agent to learn from ("Choice text too long for teach mode — keep choices to ~10 words; longer reasoning belongs in the preceding tutor turn"). Same model as every other Zod-validated tool in the project. Most reliable: the agent CAN'T accidentally overshoot. No silent soft-warn path; no dev-reports double-track (the rejection IS the signal).

- **Tool scope: shared schema with per-tool override**. `@praxis/curriculum` mode definitions carry ONE `questionConstraints?: { promptMaxWords, choiceMaxWords, choiceCount, multiSelectCap }` shape. Each question-emitting tool (`ask_student_question`, the quick-check variant, the drafter's question tool, any future ones) reads this shape by default. A tool can override specific caps in its own Zod schema where there's a tool-specific reason — e.g., a long-form drafter authoring tool that legitimately needs looser choice caps for review questions. Single source of truth at the mode layer; tool-specific exceptions handled at the tool layer.

- **Per-mode default values: locked now, but in a single-file constant for easy tuning**. Adopt the proposed table as authoritative starting values:

  | Mode | Prompt max | Choice max | Count | Multi cap |
  |---|---|---|---|---|
  | teach (quick-check) | 30 words | 10 words | 4 | 4 |
  | homework / quiz / exam | 60 words | 25 words | 5 | 6 |
  | course-create / configure | 50 words | 15 words | 5 | 6 |
  | study-skills | 40 words | 12 words | 4 | 4 |

  Values live in a single constant in `@praxis/curriculum` (e.g., `DEFAULT_QUESTION_CONSTRAINTS_BY_MODE` in a single file) so future tuning is a one-file developer edit, not a per-mode-file hunt. NOT user-configurable via UI — these are agent-behavior dials, not student settings. If production usage surfaces friction, the constant gets updated in a follow-up release.

- **Prompt fragment shape: one unified question-tool fragment with all guidance**. A single fragment composed into every mode's system prompt. Interpolates the per-mode caps inline + carries ALL the cross-cutting markup conventions from the epic's agent-contract section: LaTeX math wrapping (from sibling `feature-math-rendering`), citation tool usage, definition markup via `[[def:term]]`, callout admonitions, concept refs via `concept:slug`, figures via `::: figure :::` directive. Agent reads ONE coherent "how to write questions and educational content" reference each turn. Maintenance: one fragment file, one source of truth — sibling features contribute their content via PRs to that same file rather than fragmenting into separate per-concern fragments.

## Cross-feature coordination

The shared mode-config + the unified prompt fragment mean this feature touches surfaces that sibling features ALSO want to touch:

- `@praxis/curriculum` mode shape: this feature adds `questionConstraints?`; `feature-content-renderer-pipeline` adds `renderToggles?`. Both extensions are additive; coordinate file changes at design-pass time.
- Unified prompt fragment: this feature creates it; `feature-math-rendering` contributes the LaTeX section; `feature-content-renderer-pipeline` contributes the markup convention sections. Design-pass coordination via shared fragment file.
