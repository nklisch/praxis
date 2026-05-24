---
id: idea-inline-question-density-layout-and-schema-caps
created: 2026-05-24
tags: [ui, design-system, tool-schema, refactor]
---

The 2026-05-24 question-panel mockup responsive showcase used a deliberately dense multi-select question (70-word prompt + 5 choices ranging 9-33 words, math notation throughout) to stress-test the layout. It surfaced three coupled problems that this idea consolidates for future scoping. The first (flex bug) was fixed inline during the same review; the rest need design work.

## 1. Layout bug (fixed 2026-05-24)

`.inline-question__choice` used `display: flex` with the indicator and label as children. Choice content with multiple inline elements (`<em>`, `<sup>`, plain text nodes between them — typical for math-heavy questions) caused each inline element to become its own flex item, breaking text into narrow vertical columns instead of flowing as normal inline text.

**Fix landed**: changed `.inline-question__choice` to `display: block` with absolutely-positioned indicator in the left padding zone. Text now flows as normal block content, regardless of how many inline children it contains. Also bumped `.inline-question__choices` gap from `--space-1` to `--space-2` and choice padding to `--space-3` for breathing room; line-height upgraded from `--line-height-base` to `--line-height-loose` for readability of dense content.

No further work needed on this specific bug; remediation is in `.mockups/design-system/components.css` `.inline-question__choice` definition.

## 2. Density still feels crowded — design problem

Even with the layout bug fixed, a dense 70-word + 5-multi-line-choice question is visually overwhelming. The card grows past 700px tall at narrow widths; reading and processing the question takes serious effort. The student has to hold the prompt context in mind while parsing 5 dense choices, each of which is its own multi-line paragraph.

Possible design moves to explore at feature-design time:

- **Typographic differentiation**: the prompt is currently same body weight as choices. Could be larger / lighter, with choices smaller / denser. Makes the "this is the question" vs "these are answers" hierarchy more pronounced.
- **Choice numbering**: prepend "A·" / "B·" / "C·" markers in a quiet mono so the eye can pick out individual choices in a wall of text.
- **Progressive disclosure for long choices**: very long choices (>20 words) could collapse to a one-line summary with "expand for full text" — but this fights the "all choices visible at once" principle. Probably wrong; reject.
- **Math rendering via KaTeX**: in production the math will render properly (not the ad-hoc `<em>` styling used in mocks). May help legibility considerably; revisit after Phase 13's editorial math pass interacts with this surface.
- **Indent / nested layout for long choices**: each choice gets a small left-margin chevron and the body text indented, creating clearer "block" boundaries. Could feel heavy.
- **Choice grouping**: when 5 choices, render in two columns (where horizontal space allows) so the visual scan is shorter. Risk: breaks the "answer is a vertical list" expectation.

## 3. Tool-schema constraints (input to `feature-question-panel-rework`)

The `ask_student_question` (and equivalent quick-check) Zod schemas should enforce length caps so the agent learns the constraints by reading them, not by post-hoc UX awkwardness:

- **Prompt max ~50 words / ~300 chars**. Beyond this, the tutor should issue an explanatory chat turn before the question card, not stuff context into the prompt itself.
- **Per-choice max ~15 words / ~80 chars**. Choices longer than this read like they should be paragraphs, not options — surface the long content in the chat turn, keep choices crisp.
- **Choice count cap: 5**. Miller's 7±2 with the lower edge for active discrimination.
- **Multi-select hard cap: 6 choices**. Beyond that, single-select with a refining follow-up is the right shape — multi-select fatigue is real.

Schema errors should be descriptive (not "max length exceeded" but "Choice text too long — keep choices to ~15 words and put longer reasoning in the preceding chat turn") so they teach the constraint.

## Scoping path

This is a mix:
- (1) is **done** — no work needed.
- (2) is **design exploration** for `feature-question-panel-rework`'s upcoming design pass; recommend adding a Design Decision capturing the typographic-differentiation direction once explored.
- (3) is **implementation work** for `feature-question-panel-rework` — the schema caps belong in the same package as the tool definitions (`@praxis/tools/src/...`). Could be a child story of `feature-question-panel-rework` named `story-question-tool-schema-caps`, or could be its own follow-on feature if the work expands beyond the schema (e.g., needs adapter changes in `@praxis/tools/src/runtime/`).

When promoted via `/agile-workflow:scope`, recommend:
- Fold (2) and (3) into `feature-question-panel-rework` as additional design decisions / child stories rather than spawning a new feature. They're the same surface; scoping them separately just creates orchestration overhead.

## Source

Mockup review on 2026-05-24 (responsive-showcase of dense multi-select question). User feedback: "the questions look pretty bad in this case, not sure what we should do — it's not just the overflow, it's crowded and hard to process."
