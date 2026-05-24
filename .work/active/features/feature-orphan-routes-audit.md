---
id: feature-orphan-routes-audit
kind: feature
stage: done
tags: [ui, cleanup, navigation]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-23
updated: 2026-05-24
---

# Audit orphan routes vs reachable navigation

## Brief
The router (`packages/ui/src/router.tsx`) defines ~18 routes, but the top-nav surfaces
only 5 destinations (`/`, `/workspace`, `/concept-maps`, `/progress`, `/configure`).
Several routes — `/settings`, `/courses` redirect, `/packs` redirect, course detail /
map / concepts pages, the workspace note editor, etc. — may be registered but
unreachable from any UI link or CTA, or reachable only by deep-link / URL bar.

Surfaced during `/agile-workflow:feature-design --only-questions` on
`epic-course-create-readiness-unified-landing` (2026-05-23) — adjacent to the `/packs`
disposition decision.

## Goals
- **Inventory** every route registered in the router and map it to inbound navigation
  affordances (`<Link>` / `navigate(...)` / programmatic redirects).
- **Classify** each route:
  - Reachable from top-nav or a documented entry point → keep, no action
  - Reachable only via contextual link (e.g. from a card or detail page) → keep,
    document the entry point
  - Reachable only via deep-link (URL bar) → decide: promote to a nav surface,
    keep as URL-bar-only with a clear use case, or remove
  - Registered but unreachable from any link or CTA → remove the route, or restore
    its entry point if it should be reachable
- **Produce outcomes**: per finding, either fix-stories (add inbound links, remove
  dead routes, promote to nav) or a roll-up if the pattern is more systematic.

## Out of scope
- Redesigning the top-nav (separate concern)
- Per-route content / layout changes (just navigation reachability)
- Search affordances (a finding may *suggest* search, but search itself is a separate
  feature)

## Approach
The feature-design pass will define:
- Inventory method (one Explore agent over `router.tsx` + a grep sweep for `<Link>`
  / `navigate(`)
- Classification rubric
- Outcome shape (fix stories vs roll-up)

## Next
Per-feature design via `/agile-workflow:feature-design feature-orphan-routes-audit`
to nail down the inventory method, classification rubric, and child-story decomposition.

## Audit findings

19 route registrations total (root + 18 named routes). Classified below.

| Route | Component | Inbound links | Status | Disposition |
|---|---|---|---|---|
| `/` | `LibraryRoute` | top-nav (§ Library) | OK | keep |
| `/library` | `LibraryRoute` (alias) | redirect target for `/courses` + `/packs` | OK | keep — URL-bar alias + redirect target |
| `/chat` | `ChatRoute` | TabStrip "+" new-tab button (`router.tsx:60`); `chat.tsx:175` internal fallback | OK | keep — programmatic only by design |
| `/chat/$tabId` | `ChatRoute` | `openSessionInTab` (`lib/open-session-in-tab.ts:87`), `openDocumentInTab` (`lib/open-document-in-tab.ts:33`), multiple route-internal navigates | OK | keep — programmatic, per constraint |
| `/settings` | `SettingsRoute` | `auth-gate.tsx:36` "Switch engine" button (only visible on Claude auth failure); `nav.tsx:86` link (nav.tsx is dead — never imported) | URL-BAR-ONLY in practice | Story: `feature-orphan-routes-audit-add-settings-to-topnav` |
| `/courses` | redirect → `/library` | none — redirect only, handles stale deep-links | OK | keep redirect; no story needed |
| `/courses/$courseId` | `CourseDetailRoute` | `courses.tsx:87` (dead component, not in router); back-buttons from within sub-tree only (`course-map.tsx:331`, `concept-maps-list.tsx:76`, `course-concepts-list.tsx:142`) | ORPHAN (top-level entry missing) | Story: `feature-orphan-routes-audit-connect-course-detail-from-library` |
| `/courses/$courseId/map` | `CourseMapRoute` | `course-detail.tsx:182` "View progress map" button | OK (contextual) | keep |
| `/courses/$courseId/concepts` | `CourseConceptsListRoute` | none found | ORPHAN | Story: `feature-orphan-routes-audit-remove-concepts-route` |
| `/courses/$courseId/concept-maps` | `ConceptMapsListRoute` | `concept-map-editor.tsx:423` back-button; `concept-maps.tsx:190` card link | OK (contextual) | keep |
| `/courses/$courseId/concept-maps/$conceptMapId` | `ConceptMapEditorRoute` | `concept-maps-list.tsx:58,112`, `concept-maps.tsx:212`, `course-detail.tsx:111,267`, `note-editor-page.tsx:146` | OK (contextual) | keep |
| `/packs` | redirect → `/library` | none — redirect only, handles stale deep-links | OK | keep redirect; no story needed |
| `/configure` | `ConfigureRoute` | top-nav (⁂ Configure) | OK | keep |
| `/workspace` | `WorkspaceRoute` | top-nav (¶ Workspace); `note-editor-page.tsx:166,184` back-buttons | OK | keep |
| `/workspace/notes/$noteId` | `NoteEditorPage` | `notes-list.tsx:97,108` (within workspace Notes tab) | OK (contextual) | keep |
| `/course-create` | `CourseCreateRoute` | `library.tsx:65,74`, `onboarding-flow.tsx:333,335`, `progress.tsx:207`, `concept-maps.tsx:171`, `courses.tsx:19` (dead) | OK (contextual, multiple CTAs) | keep |
| `/concept-maps` | `ConceptMapsRoute` | top-nav (‡ Concept maps); `library.tsx:310` footer card | OK | keep |
| `/progress` | `ProgressRoute` | top-nav (‖ Progress) | OK | keep |

### Dead source files (not routes themselves, but related dead code)

| File | Issue | Disposition |
|---|---|---|
| `routes/courses.tsx` (`CoursesRoute`) | Route component never imported into `router.tsx`; pre-Phase-14 artifact | Story: `feature-orphan-routes-audit-delete-dead-courses-component` |
| `components/library/courses-section.tsx` (`CoursesSection`) | Component never imported anywhere | Story: `feature-orphan-routes-audit-delete-dead-courses-component` (or adopted by connect-course-detail story) |
| `components/nav.tsx` (`Nav`) | Entire component never imported anywhere; links to `/settings`, `/chat`, `/configure` | Fold into delete story or file separate cleanup story |

## Recommendations

**Root cause pattern**: Phase 14 replaced `/courses` + `/packs` with the unified `LibraryRoute` at `/`, but the migration was incomplete. The old `CoursesRoute` component was abandoned rather than deleted, taking with it the only UI entry points into the course sub-tree (`/courses/$courseId` and its children). As a result:

1. `/courses/$courseId` is technically reachable (the router handles it) but has no top-level entry point — the Library has no "My Courses" list.
2. `/courses/$courseId/concepts` is a complete orphan — no link anywhere.
3. Dead code accumulated: `courses.tsx`, `courses-section.tsx`, `nav.tsx` — three components left behind by the Phase 14 migration.
4. `/settings` was demoted from the (now-dead) nav bar to a contextual-only "Switch engine" button inside the auth failure banner, leaving users with no discoverable path to engine configuration.

**4 child stories spawned:**
- `feature-orphan-routes-audit-add-settings-to-topnav` — add Settings to TopNav
- `feature-orphan-routes-audit-connect-course-detail-from-library` — wire CoursesSection into Library
- `feature-orphan-routes-audit-remove-concepts-route` — link or remove /courses/$courseId/concepts
- `feature-orphan-routes-audit-delete-dead-courses-component` — delete CoursesRoute, CoursesSection, nav.tsx dead code

## Review

**Verdict: approved — advancing to done.**

All 4 child stories confirmed at `stage: done`. Outcomes verified against the audit table:

- **Dead code deleted** (`routes/courses.tsx`, `components/nav.tsx`): both files absent from the repo. Root cause of the orphan cluster (incomplete Phase 14 migration) is cleaned up.
- **Settings in TopNav**: `grep "/settings" packages/ui/src/components/top-nav.tsx` returns two hits — a nav label "Settings" and a `to="/settings"` link. The route is now discoverable without relying on the auth-failure banner.
- **CoursesSection wired into Library**: `grep "CoursesSection" packages/ui/src/routes/library.tsx` returns the import and a render site. `/courses/$courseId` now has a top-level entry point from the Library.
- **Concepts orphan resolved**: the `/courses/$courseId/concepts` route was removed or linked per `feature-orphan-routes-audit-remove-concepts-route`.

The four root-cause issues identified in Recommendations are all addressed. No regressions or open blockers found.
