---
id: idea-component-library-codify-and-sharpen
created: 2026-05-19
tags: []
---

Unify the UI by codifying our existing component layer into a proper
design-system contract, then sharpening it to express the locked Studio
Quiet voice more deliberately. Today we have ~200 components in
`packages/ui/src/components/` plus editorial primitives (Modal,
RouteHeader, EmptyState, LoadingState, ErrorMessage, the
`composes: editorial from global` CSS utility) and a strongly-adopted
token layer (~3192 `var()` references), but the editorial primitives
are only used in ~47 of those files, ~262 raw color/spacing values
still drift, and `.mockups/design-system/components.{html,css}` doesn't
exist yet — so mocks can't link a shared contract and migration drift
goes unflagged. The work is two-fold and runs as a single arc: (1)
**codify** — audit current shared patterns, refine the editorial set,
extend with the missing common slots (button, input/field, card, tabs,
badge, dropdown) drawn from the most-used patterns already in code, and
produce `components.css` + `components.html` as the showcase contract
every mock links; (2) **sharpen** — during codification, push the
Studio Quiet voice (italics, editorial composition, restrained brick
accent) more deliberately so the resulting primitives feel more
distinctive than today's average. Migration backlog falls out
automatically: the ~150 files not using editorial primitives plus the
262 raw values become a tracked sweep. Decide later whether to scope
as one epic with codify/sharpen/migrate features, or split per-area.
