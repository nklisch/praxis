---
id: feature-orphan-routes-audit-add-settings-to-topnav
kind: story
stage: implementing
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
