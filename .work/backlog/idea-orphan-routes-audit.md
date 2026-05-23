---
id: idea-orphan-routes-audit
created: 2026-05-23
tags: [ui, cleanup, navigation]
---

Audit all routes registered in `packages/ui/src/router.tsx` against
actual inbound navigation links to find pages with no user-reachable
path. Top-nav covers only 5 destinations (/, /workspace, /concept-maps,
/progress, /configure) but the router defines ~18 routes including
`/settings`, `/courses` redirect, `/packs` redirect, course detail /
map / concepts pages, the workspace note editor, etc.

Find:
- Routes registered but unreachable from any link/CTA
- Routes reachable only via deep-link / URL bar (no UI affordance)
- Routes that should be promoted to a top-nav or contextual nav surface

Produce either fix-stories (add inbound links / remove dead routes) or
a single roll-up feature depending on what's found.

Surfaced during `/agile-workflow:feature-design --only-questions` on
`epic-course-create-readiness-unified-landing` (2026-05-23) — adjacent
to the /packs disposition decision.
