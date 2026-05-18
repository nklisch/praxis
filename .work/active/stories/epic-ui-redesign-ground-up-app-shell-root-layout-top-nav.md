---
id: epic-ui-redesign-ground-up-app-shell-root-layout-top-nav
kind: story
stage: implementing
tags: [ui]
parent: epic-ui-redesign-ground-up-app-shell
depends_on: [epic-ui-redesign-ground-up-design-system-token-swap]
release_binding: null
gate_origin: null
created: 2026-05-17
updated: 2026-05-17
---

# Root layout — swap left-rail for top horizontal nav

## Scope

Rebuild `RootLayout` in `packages/ui/src/router.tsx` to the locked
Index shape: top horizontal nav (wordmark + five surface links +
right-aligned section for tabs/theme), no left sidebar, full-width
content beneath.

See parent feature
`.work/active/features/epic-ui-redesign-ground-up-app-shell.md`.

## Implementation steps

1. Edit `packages/ui/src/router.tsx`:
   - Replace left-rail nav layout with a top-nav layout.
   - Wordmark on left; five surface links (Library / Workspace /
     Concept maps / Progress / Configure) center-left; reserved
     space on right for tabs strip + theme toggle (mounted by sibling
     stories).
   - Full-width content area below.

2. New `packages/ui/src/components/top-nav.{tsx,module.css}` if
   extraction simplifies. Otherwise inline in `router.tsx`.

3. Match the locked mock typography + spacing
   (`.mockups/screens/.../-app-shell/option-3.html`).

4. Tests: `router.test.tsx` covering top-nav rendering and active-link
   state.

5. `pnpm typecheck && pnpm lint && pnpm test` green.

## Acceptance criteria

- [ ] RootLayout uses top horizontal nav matching the locked mock.
- [ ] Five surface links render with editorial typography from the
      tokens.
- [ ] Active link state visible.
- [ ] All quality checks green.

## Out of scope

- Status strip (Story 2).
- Tabs strip (Story 4).
- Theme toggle (mounted by Story 3 + sibling backend-fills bundle).
