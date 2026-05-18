---
id: epic-ui-redesign-ground-up-app-shell-first-run-flow-engine-select-label
kind: story
stage: implementing
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

- [ ] Engine `<select>` is associated with its visible label via native `<label>`.
- [ ] API key `<input>` is associated with its visible label via native `<label>`.
- [ ] Visual appearance unchanged.
- [ ] `pnpm typecheck && pnpm lint && pnpm test` green.
