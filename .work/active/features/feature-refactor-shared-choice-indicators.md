---
id: feature-refactor-shared-choice-indicators
kind: feature
stage: drafting
tags: [refactor, ui, design-system]
parent: epic-educational-content-rendering
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Refactor: extract shared choice-indicator primitive across in-chat and tab-body surfaces

## Brief

`[refactor]`-tagged. Visual-language alignment: extract the choice-indicator pattern that currently lives as `.inline-question__indicator--radio` and `.inline-question__indicator--check` (chat-inline questions) to a more universal primitive that `.assignment-item-card` (tab-body quiz / homework / exam items in `packages/ui/src/components/{quiz,homework,exam}-tab-body.tsx`) ALSO composes against. Plus add `--multi-select` mode support to `.assignment-item-card` so multi-select assignment items get the same checkbox indicator + `select all that apply` kicker badge as their chat-inline counterparts.

Likely shape: rename / extract to `.choice-indicator--radio` / `.choice-indicator--check` (or a similarly universal name — `feature-design` picks the final name); update `.inline-question__choice` and `.assignment-item-card__options` to compose against the shared primitive; rewrite production assignment-item-card React components to use the new mode + the shared indicator. Match selected-state visuals across surfaces (accent-muted background, accent indicator border, accent fill — already true of `.inline-question__choice--selected`; assignment items should match). Resolved-state typography stays per-surface (`.thread-chip` for chat-inline; `.assignment-item-card__answered-mark` for graded — different correctness semantics, same visual language family).

The mockup-side primitive extraction is purely additive to `components.css`; the production-code rewrite of the tab-body assignment items is the larger surface. Behavior preserved — same answers, same grading, same correctness feedback. Only the visual primitive that backs the choice indicators changes.

## Epic context

- Parent epic: `epic-educational-content-rendering`
- Position in epic: **independent refactor** — does not depend on the renderer pipeline or the math-rendering or the question-tool-constraints features. The shared indicator primitive already exists in `components.css` as `.inline-question__indicator--radio` / `--check`; this feature renames + extends + rewrites production consumers. Can land in any order relative to the other three features in this epic.

## Cross-epic dependency

Soft adjacency with `feature-question-panel-rework` (sibling epic `epic-chat-interaction-ux-overhaul`). Both touch the `.inline-question` component family. If `feature-question-panel-rework` lands first, this feature updates its design-pass-resulting code to the renamed primitive. If this feature lands first, `feature-question-panel-rework` adopts the renamed primitive from the start. Coordination at design-pass time, not a hard `depends_on`.

## Mockups

- Inherits design system: `.mockups/design-system/{tokens,motion,components}.css`
- Current indicator primitive (chat-inline): `.mockups/design-system/components.html` § Chat surface — the `.inline-question` demos show `.inline-question__indicator--radio` / `--check` in action.
- Existing assignment-item-card primitive (tab-body): `.mockups/design-system/components.html` (existing Tier-2 widget, currently no shared indicator).
- Question chassis context (chat-inline side that the refactor aligns to): `.mockups/screens/feature-question-panel-rework/state-single.html` (radio), `state-multi-select.html` (check), `state-paged.html` (mixed).

## Foundation references

- `docs/ARCHITECTURE.md` § `@praxis/ui` — package owns both the assignment-item-card production component and the chat-inline question chassis.
- `.claude/rules/patterns.md` — no existing pattern covers this specifically; this refactor is the input to whether a new pattern "shared-form-primitive-across-surfaces" emerges.
