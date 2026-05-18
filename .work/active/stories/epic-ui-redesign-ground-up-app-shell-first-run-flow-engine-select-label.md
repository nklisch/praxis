---
id: epic-ui-redesign-ground-up-app-shell-first-run-flow-engine-select-label
kind: story
stage: done
tags: [ui, a11y]
parent: epic-ui-redesign-ground-up-app-shell
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-18
updated: 2026-05-18
---

# Onboarding engine step: restore accessible label association for select/input

## Scope

The first-run-flow rebuild (`epic-ui-redesign-ground-up-app-shell-first-run-flow`)
changed the engine-picker fields from `<label>` wrappers to `<div>` + `<span>`
in order to adopt the `.fieldLabel` mono kicker style. This broke the programmatic
label association: the engine `<select>` and API key `<input>` now have no
`<label>` or `aria-labelledby` pointing at their visible label text.

Screen readers that rely on `<label for>` or wrapping `<label>` will not announce
"Engine" / "API key" when the field is focused.

## Fix

Two options:

1. **`htmlFor` + `id`**: Add `id="engine-select"` to the `<select>`, update
   the `<span>` to `<label htmlFor="engine-select" className={styles.fieldLabel}>`.
   Repeat for API key. This is the simplest fix.

2. **`aria-labelledby`**: Add `id` to each `<span>` and `aria-labelledby` to the
   corresponding `<select>` / `<input>`.

Option 1 is preferred (native semantics). The `.fieldLabel` CSS class can be
applied to a `<label>` element without any visual change.

## Files

- `packages/ui/src/components/onboarding-flow.tsx` — `EngineStep` function
  (lines ~202–280 in the post-redesign state)
- `packages/ui/src/components/onboarding-flow.module.css` — `.fieldLabel` style
  (no change needed — `label` inherits the same style)

## Acceptance criteria

- [x] Engine `<select>` is associated with its visible label via native `<label>`.
- [x] API key `<input>` is associated with its visible label via native `<label>`.
- [x] Visual appearance unchanged.
- [x] `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation notes

Chose option 1 (`htmlFor` + `id`) as the story preferred:

- `<span className={styles.fieldLabel}>Engine</span>` → `<label htmlFor="onboarding-engine-select" className={styles.fieldLabel}>Engine</label>`; `id="onboarding-engine-select"` added to the `<select>`.
- Same pattern for the API key field: `id="onboarding-api-key-input"` on the `<input>`, `htmlFor="onboarding-api-key-input"` on the label.
- No CSS change needed — `label` inherits `.fieldLabel` styles identically to `span`.

Three regression tests added to `onboarding-flow.test.tsx` in a new `EngineStep — accessible label association` describe block:
1. Engine select has an accessible name via `<label>` (uses `screen.getByLabelText("Engine")`).
2. API key input has an accessible name via `<label>` (uses `screen.getByLabelText("API key")`).
3. API key field is absent for the `claude-code` engine (existing conditional render still correct).

`@praxis/ui` typechecks clean; lint clean on changed files; all 19 tests pass.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Minimal, correct fix. `<span>` → `<label htmlFor>` is the right native-semantics approach; ids are suitably namespaced (`onboarding-engine-select`, `onboarding-api-key-input`) to avoid collisions. Three `getByLabelText` regression tests are the ideal guard — they fail the moment the association breaks again. Conditional-render test (third test) is a good bonus. No behavioral, visual, or structural changes beyond the accessibility fix.
