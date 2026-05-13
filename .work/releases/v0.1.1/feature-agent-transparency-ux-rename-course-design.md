---
id: feature-agent-transparency-ux-rename-course-design
kind: story
stage: done
tags: [ui, content]
parent: feature-agent-transparency-ux
depends_on: []
release_binding: v0.1.1
gate_origin: null
created: 2026-05-11
updated: 2026-05-12
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

## Implementation notes

### Files touched

- `packages/curriculum/src/modes/bootstrap.ts` — `label` and `description` updated; `id: "bootstrap"` unchanged.
- `packages/ui/src/components/mode-meta.ts` — `bootstrap` entry `name` changed to `"course design"`.
- `packages/ui/src/components/new-tab-picker.tsx` — radio label now renders `getModeMeta(mode).name`; `getModeMeta` import added.
- `packages/ui/src/lib/copy.ts` — `empty.libraryCoursesEmpty` and `onboarding.courseFromSyllabusBody` updated.
- `packages/ui/src/components/bootstrap-tab-body.tsx` — JSDoc comments, `aria-label`, and `title` on the budget input updated.
- `packages/tools/src/labels/index.ts` — `course.start_exploration` `present` updated; `past` added.

### Tests updated

- `packages/ui/src/__tests__/new-tab-picker.test.tsx` — radio name assertion for bootstrap mode updated from `"bootstrap"` to `"course design"`.
- No other tests asserted on the renamed strings (onboarding flow uses `COPY.*` keys; library/chat/courses tests use `modeId: "bootstrap"` as a code value, not a display string).

### Verification

- `pnpm typecheck` — passed (all 10 packages clean).
- `pnpm test` — 301 files passed, 2 skipped; 2651 tests passed, 21 skipped.
- Lint pre-existing failures in `packages/claude-cli-sdk/` and `packages/client/` test files; none in touched files.

## Review (2026-05-12)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- Diff at commit `5b0ccdb`: clean string rename across 7 files. No internal identifier renamed (`modeId: "bootstrap"`, `course.start_exploration` tool name, `useBootstrapBudget`, `BootstrapTabBody`, `@praxis/curriculum/bootstrap` all untouched).
- Tests-side: `new-tab-picker.test.tsx` updated to expect "course design" instead of "bootstrap". Verified no residual student-facing string assertions in other UI test files (remaining `Bootstrap`/`useBootstrap*` hits are internal identifiers, kept by design).
- Tool label update for `course.start_exploration` includes the new `past: "Read your materials"`, matching the editorial voice for the past-tense interstitial line.

Approved and advancing to done.
