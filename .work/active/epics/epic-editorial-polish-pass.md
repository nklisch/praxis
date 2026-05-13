---
id: epic-editorial-polish-pass
kind: epic
stage: drafting
tags: [ui, editorial, configure]
parent: null
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Editorial polish pass — bring the chrome and the editors in line with the design system

## Brief

The editorial design system (RouteHeader, LibrarySection, EmptyState,
`composes: editorial from global;`, COPY module) settled during the v0.1.1
work and now covers most of the major surfaces — but five visible
inconsistencies remain. The top menu bar still reads "Chat" instead of
"Tutor," renders the Praxis wordmark in default text styling, and
doesn't match the editorial system's spacing/typography. The teaching-
style section in the configurator sits at the bottom of the form even
though it's the highest-frequency knob users touch. The prompt-editing
surface has too many parallel preview shapes (global / append /
composed / full-fragment) that drift out of sync. The gates editor (and
course editor) leaks raw concept IDs instead of human-readable names.
Side panels are fixed-width with no resize handle, forcing one-size-fits-
all density on every workflow.

None of these is a feature; each is a polish move. Bundled, they form a
coherent "the chrome and the editors now look as considered as the
content" pass — exactly the kind of work that is twice as effective as a
batch than scattered across six PRs.

## Scope absorbed from backlog

Five ideas in `.work/backlog/`:

- `idea-top-menu-bar-styling` — three issues in one: rename "Chat" →
  "Tutor", stylise the Praxis wordmark, and bring the top bar in line
  with the editorial design tokens (RouteHeader typography,
  border/background, brand mark).
- `idea-teaching-style-top-of-prompt-config` — move the teaching-style
  section to the top of the prompt configuration form (currently
  buried at the bottom; it's the highest-signal knob). Possibly
  revisit the whole ordering by frequency-of-use.
- `idea-unified-prompt-preview-blocks` — unify global / append /
  composed / full-fragment previews onto a single block-oriented view
  with a toggle for the composed assembled output. Global prompt
  becomes just another block in the stack.
- `idea-resizable-side-panels` — give the sidebar / documents pane /
  workspace rail drag handles + per-panel persisted widths (config_kv
  or localStorage). Respect min/max bounds.
- `idea-gates-editor-show-concept-names-not-ids` — replace raw concept
  IDs with concept names everywhere in editing UIs (gates editor and
  course editor); reorganize the gates editor layout from cramped
  single-line into a readable wrap/stack with a zoom/expand affordance.

## Anchors (current implementation)

- Top menu bar / app chrome — `packages/ui/src/router.tsx`,
  `packages/ui/src/components/AppChrome.tsx` (or equivalent — find the
  shell wrapper rendered above `<Outlet />`).
- Editorial primitives — `packages/ui/src/components/editorial/`;
  `composes: editorial from global;` in CSS modules. Pattern:
  `editorial-ui-primitives`.
- Configurator panel — `packages/ui/src/routes/configure*.tsx` and the
  prompt-config fragments rendered there.
- Prompt-editing previews — `packages/ui/src/components/` (search for
  "Preview", "AppendPreview", "ComposedPreview", "FullFragmentView").
  Related to `epic-prompt-editing-surface-v2` (done) — this is v3.
- Side panels — sidebar in chat workspace; documents pane (chat-scoped
  sidebar); workspace rail. Layout in chat-tab-body / chat-route.
- Gates editor — `packages/ui/src/routes/courses/*/gates*` (or
  equivalent). Concept rendering needs the artifact name lookup.
- Course editor — same area; same concept-ID-vs-name problem.

## Why now

Two of these (top bar + prompt preview unification) are visible on every
session — the kind of polish that compounds because users see them
every time. Three (config ordering, panel sizing, concept names) are
friction points that an author hits the second they open the
configurator or the gates editor. None of them is on a critical path,
which means they'll keep slipping unless bundled — and they're all
small enough that one design pass + one orchestrated implement pass
should clear them.

## Decomposition direction (for epic-design)

Likely splits into 3–4 child features:

- **App chrome refresh** — top-menu-bar-styling. Single surface,
  contained.
- **Configurator ordering + preview unification** — teaching-style-top
  + unified-prompt-preview-blocks. Both touch the configurator and the
  prompt-editing surface; designing them together avoids a second
  rework when the preview redesign forces a layout decision.
- **Editor concept-name surfacing** — gates-editor-show-concept-names
  applied across all concept-displaying UIs (gates editor + course
  editor).
- **Resizable side panels** — resizable-side-panels. Cross-cutting
  layout primitive; standalone because it touches every panel host.

The "v3" framing for the prompt-preview work is real — it follows
`epic-prompt-editing-surface-v2` (done). Worth referencing that epic
during design rather than starting from scratch.

## Decomposition risks

- **Tab title rename "Chat → Tutor" interacts with prior tutor-tab
  rename work** — `epic-tutor-session-feel-tutor-tab-rename` (done)
  already moved tab titles to `Mode.displayName` SSOT. The top-menu
  rename probably means a different thing (the route header / app
  title, not the tab strip). Identify the exact surface during design.
- **Concept name lookup may need a new resolver hook** — concepts live
  in the curriculum knowledge graph; rendering names everywhere needs
  efficient lookup. Avoid N+1 fetches; might warrant a
  `useConceptNames(ids)` batched hook.
- **Side-panel resize persistence has a config-vs-local choice** —
  config_kv syncs across machines (if/when we have sync); localStorage
  is per-device. Design call.
- **Prompt-preview unification may not be additive** — replacing four
  preview shapes with one block-oriented view is a breaking change to
  the configurator's information architecture. Verify the unified view
  can do everything each existing preview does (especially the append
  highlight) before committing.
- **Configurator section reorder may have hidden coupling** — if
  section position is hardcoded vs. driven by a registry, the reorder
  is either a one-line change or a per-section migration. Check first.
