---
id: fix-ripples-panel-color-error-legacy-token
stage: implementing
created: 2026-05-17
tags: [ui, bug]
---

`packages/ui/src/components/ripples-panel.module.css` line 100 uses the legacy
`--color-error` token (`color: var(--color-error, #ef4444)`) which was renamed to
`--color-danger` in the `epic-ui-redesign-ground-up-design-system-token-swap`
migration. The file was added in commit `7b10e69` (after the token-swap landed),
so it was never subject to the rename pass.

Fix: change `var(--color-error, #ef4444)` → `var(--color-danger, #a32721)` (the
Studio Quiet danger value). Also update the fallback literal from the old
red-400 (`#ef4444`) to the Studio Quiet `--color-danger` value (`#a32721`).

Acceptance: `grep -r '\-\-color-error' packages/ui/src/` returns zero hits.
