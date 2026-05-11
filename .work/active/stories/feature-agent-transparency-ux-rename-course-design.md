---
id: feature-agent-transparency-ux-rename-course-design
kind: story
stage: implementing
tags: [ui, content]
parent: feature-agent-transparency-ux
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-11
updated: 2026-05-11
---

# Rename "bootstrap" / "explore" to "course design" / "reading your materials"

## Scope

Implements Unit 6 of `feature-agent-transparency-ux`. Pure UI-string change.
Internal identifiers (`modeId: "bootstrap"`, tool name `course.start_exploration`,
package paths, hook names, component names) stay — they're DB keys and code
identifiers.

Independent of other stories; can run in parallel with stream-pacing and
subagent-channel. If the sub-agent block (story `…-subagent-ui`) lands first,
its `initialLabel` already reads from `getToolLabel(...)` so the rename here
flows through automatically.

## Files to touch

- `packages/curriculum/src/modes/bootstrap.ts` — `label: "Design a course"` (was "Bootstrap a course"); update `description` to "Conversational mode for designing a new course from your materials."
- `packages/ui/src/components/mode-meta.ts` — `bootstrap` entry's `name: "course design"` (was `"bootstrap"`). `deck`, `ornament`, `tint` unchanged.
- `packages/ui/src/components/new-tab-picker.tsx` — replace `<span>{mode}</span>` (line ~101) with `<span>{getModeMeta(mode).name}</span>`; add the import.
- `packages/ui/src/lib/copy.ts`:
  - `empty.libraryCoursesEmpty`: `"No courses in progress. Import a pack to begin, or design one from your materials."` (was "...start a bootstrap session.")
  - `onboarding.courseFromSyllabusBody`: `"Drop in a syllabus or textbook outline and we'll design a course together from it."` (was "...we'll explore it together to draft a course.")
- `packages/ui/src/components/bootstrap-tab-body.tsx`:
  - Top JSDoc comment: replace "explore agent" with "course-design sub-agent" wherever it appears.
  - Budget input `aria-label`: `"Course-design budget"` (was `"Explore agent tool-call budget"`).
  - Budget input `title`: `"Tool-call budget for the course-design sub-agent (5–200 steps)."` (was "...for the explore agent...").
- `packages/tools/src/labels/index.ts`:
  - `course.start_exploration`: `present: "Reading your materials"` (was `"Exploring your sources"`); add `past: "Read your materials"`.

### Test updates
- `packages/ui/src/__tests__/new-tab-picker.test.tsx` — if it asserts on the rendered radio label text, expect `"course design"` instead of `"bootstrap"`. Tests that use `modeId: "bootstrap"` as the form value remain unchanged.
- `packages/ui/src/__tests__/library-route.test.tsx`, `onboarding-flow.test.tsx`, `courses-route.test.tsx`, `chat-route.test.tsx` — search for and update any `getByText("Bootstrap…")` or copy-string assertions that match the renamed strings.

## Acceptance Criteria

- [ ] Mode picker shows "course design" (not "bootstrap") for the bootstrap mode entry.
- [ ] Opening a session in that mode shows mode header: "¶ course design · shaping a new course together".
- [ ] Library empty-state copy reads "...or design one from your materials." (no "bootstrap session").
- [ ] Onboarding "From your own syllabus" body reads "...we'll design a course together from it." (no "explore it together").
- [ ] Tool interstitial for `course.start_exploration` reads "Reading your materials" in-flight and "Read your materials" past-tense.
- [ ] Bootstrap tab body's budget tooltip and aria-label no longer say "Explore agent".
- [ ] `pnpm lint && pnpm typecheck && pnpm test` all pass — string-assertion test updates applied.
- [ ] No internal identifier renamed: `modeId: "bootstrap"` still in the mode definition; tool name `course.start_exploration` unchanged; package path `@praxis/curriculum/bootstrap` unchanged; hook name `useBootstrapBudget` unchanged.

## Non-goals

- Renaming the mode id itself (DB migration; not worth the cost for a UI string change).
- Renaming `course.start_exploration` (engine/SDK contract; not worth breaking).
- Touching SPEC.md / VISION.md / ARCHITECTURE.md references to "bootstrap" — those are architectural terms, kept internal.

## References

- Design: `.work/active/features/feature-agent-transparency-ux.md` (Unit 6)
- COPY module SSOT: `packages/ui/src/lib/copy.ts`
- Tool labels SSOT: `packages/tools/src/labels/index.ts`

<!-- Implementation Notes accumulate here as work progresses. -->
