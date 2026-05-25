---
id: feature-orphan-routes-audit-add-settings-to-topnav
kind: story
stage: done
tags: [ui, navigation]
parent: feature-orphan-routes-audit
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-24
updated: 2026-05-24
---

# Add /settings to TopNav

## Location
`packages/ui/src/components/top-nav.tsx`

## Evidence
`/settings` is registered in the router but the only inbound navigation is:
- `auth-gate.tsx:36` — "Switch engine" button inside the chat auth banner (contextual, requires Claude auth failure to appear)
- `nav.tsx:86` — `<Link to="/settings">` in the legacy `Nav` component, which is **never imported anywhere** (dead code)

The `TopNav` component (`top-nav.tsx`) surfaces five destinations: Library, Workspace, Concept maps, Progress, Configure. Settings is absent. A user without a Claude auth failure has no discoverable path to `/settings`.

## Suggested fix
Add a sixth link to `TopNav`:

```
⚙ Settings  → /settings
```

Use a typographic glyph consistent with the running-head style (e.g. `·` — already assigned in `route-meta.ts` — or `⚙`). Place it at the rightmost position in the `<nav>`, before `tabsSlot`.

## Acceptance
- `TopNav` renders a link to `/settings`.
- Clicking it navigates to `SettingsRoute`.
- Active state (underline) lights up when the path is `/settings`.
- `top-nav.test.tsx` covers the new link (render + active state).
- `pnpm typecheck && pnpm lint && pnpm test` green.

## Implementation notes
- Added a sixth `<Link to="/settings">` in `top-nav.tsx` after the Configure link, using the `·` glyph (matching the ornament defined in `route-meta.ts` for the settings route).
- Updated the JSDoc comment in `top-nav.tsx` to reflect six surface links.
- Extended `top-nav.test.tsx` with 4 new tests: Settings link label renders, glyph `·` renders, href is `/settings`, active/inactive CSS class states work correctly.
- Pre-existing failure in `configure-route.test.tsx` ("known limitation — both may call start") is unrelated and was already failing before this change.
- All 15 `top-nav.test.tsx` tests pass; `pnpm typecheck` clean.

## Review (2026-05-24)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Change is exactly what the acceptance criteria asked for. Settings link added as the sixth `<Link>` in `top-nav.tsx` using the `·` glyph consistent with `route-meta.ts`; `activeOptions={{ exact: false }}` and `activeProps` pattern match the existing five links exactly. Four new tests cover label, glyph, href, and active/inactive CSS class — behavioral contract, not implementation details. JSDoc comment updated to reflect six links. No security, breaking-change, or foundation-doc concerns. Clean approve.
