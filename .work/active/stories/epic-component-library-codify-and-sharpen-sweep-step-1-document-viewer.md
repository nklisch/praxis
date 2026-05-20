---
id: epic-component-library-codify-and-sharpen-sweep-step-1-document-viewer
kind: story
stage: implementing
tags: [refactor]
parent: epic-component-library-codify-and-sharpen-sweep
depends_on: []
release_binding: null
gate_origin: refactor-design
created: 2026-05-20
updated: 2026-05-20
---

# Step 1 — Proof slice: adopt the contract in `components/document-viewer/`

## Brief

Apply the locked design-system contract (`.mockups/design-system/components.css`,
`tokens.css`, `motion.css`) to the five document-viewer CSS modules. This
is the proof slice — its job is to lock in the per-token translation
table the other five area sweeps will reuse.

## Files in scope

- `packages/ui/src/components/document-viewer/fallback-renderer.module.css`
- `packages/ui/src/components/document-viewer/html-renderer.module.css`
- `packages/ui/src/components/document-viewer/markdown-renderer.module.css`
- `packages/ui/src/components/document-viewer/pdf-renderer.module.css`
- `packages/ui/src/components/document-viewer/structured-renderer.module.css`

## Current state

Verified 2026-05-20:

- 0/5 files declare `composes: ... editorial from global`
- 1 `rgb()`/`rgba()` literal
- 5 raw `Npx` values in `padding`/`margin`/`gap`
- 0 bare-`ms` transitions
- 0 `cubic-bezier(...)` literals

## Target state

- Every container that renders editorial body text composes the
  `editorial` utility (`composes: editorial from global;`)
- Every color value is `var(--color-*)`
- Every spacing value is `var(--space-*)`
- Where the surface prints metadata above a heading: use
  `.editorial-kicker`
- Where the surface separates sections: use `.section-rule`

## Implementation notes

This slice locks the **token translation table** the other five sweeps
will reuse. Capture it in the "Translation table" section below as work
proceeds. Common substitutions to expect:

- `4px → var(--space-1)`, `8px → var(--space-2)`, `12px → var(--space-3)`,
  `16px → var(--space-4)`, `24px → var(--space-6)`, `32px → var(--space-8)`,
  `48px → var(--space-12)`, `64px → var(--space-16)`
- `rgba(0, 0, 0, 0.05)` family → `color-mix(in srgb, var(--color-text-primary) 5%, transparent)`
- Hairline borders stay as `1px solid var(--color-border)` (no spacing
  token applies; matches the contract's primitives)
- Focus outlines stay as `2px solid var(--color-accent)` (matches `.btn`,
  `.input`, etc. in `components.css`)

If a needed value doesn't have a token, **pause and refine `tokens.css`
in-place** — that's an expected contract-refinement loop, not a
violation. Document the addition in this story's body.

## Acceptance criteria

- [ ] `pnpm build && pnpm typecheck && pnpm test` green
- [ ] `grep -rnE '\b(rgb|rgba)\(' --include='*.module.css' packages/ui/src/components/document-viewer | wc -l` returns `0`
- [ ] `grep -rnE '\b(padding|margin|gap)[^:]*:\s*[^v;]*[0-9]+px' --include='*.module.css' packages/ui/src/components/document-viewer | grep -v 'var(--' | wc -l` returns `0`
- [ ] Token translation table captured in this story body for downstream slices
- [ ] All editorial-body containers in scope compose `editorial from global`

## Translation table

Populated as the proof slice runs — downstream stories link here.

## Risk

Low. Five files, six drift values, no shared subclasses, no cross-file
state. The risk is mis-locking a translation rule that the rest of the
sweep then has to undo — mitigation is to keep the table conservative
(prefer exact-match substitutions; don't generalize from a single
example).

## Rollback

`git revert <commit>` — single-area scope, no cross-file dependencies.
