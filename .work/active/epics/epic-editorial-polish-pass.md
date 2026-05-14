---
id: epic-editorial-polish-pass
kind: epic
stage: done
tags: [ui, editorial, configure]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
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

## Decomposition

Split by surface. Each of the five absorbed ideas lives on a different
surface (top nav, configurator prompt panel, configurator
gates/course editor, panel layout) except for the two prompt-config
ideas which co-locate and share design pressure — so those bundle.
Four features over five was chosen because the
teaching-style reorder and prompt-preview unification both touch the
configurator and the prompt-editing primitives; designing them
together avoids a second rework when the preview redesign forces a
layout decision. All four are fully independent — runs in one wave.

Anchor verification update: **the gates editor and course editor use
different concept-rendering paths** (`ConceptNode` React Flow custom
node in `gates-tab.tsx` vs. comma-separated text input in
`lesson-editor.tsx`), so the concept-name feature must touch both.

### Child features

- `epic-editorial-polish-pass-app-chrome` — top nav rename
  ("Chat" → "Tutor") + Praxis wordmark + editorial alignment —
  depends on: `[]`
- `epic-editorial-polish-pass-prompt-config-redesign` — configurator
  section reorder (teaching style to top) + unified block-oriented
  prompt preview replacing the four parallel preview shapes —
  depends on: `[]`
- `epic-editorial-polish-pass-concept-name-surfacing` — show concept
  names (not IDs) across ConceptNode (gates editor) + LessonEditor
  (course editor); reorganize gates layout + add expand affordance —
  depends on: `[]`
- `epic-editorial-polish-pass-resizable-panels` — drag handles +
  persisted widths + min/max bounds on sidebar / documents pane /
  workspace rail — depends on: `[]`

### Decomposition risks

- **Top nav rename interacts with prior tab-rename work** — the
  tab-strip already moved to `Mode.displayName` SSOT in
  `epic-tutor-session-feel-tutor-tab-rename`. This feature is the
  route-link in `nav.tsx`, a different surface. Feature-design must
  be clear about which one is being touched.
- **Concept name lookup may need a new resolver hook** — concepts
  live in the curriculum knowledge graph; rendering names everywhere
  needs efficient batched lookup (`useConceptNames(ids)`-shaped).
  Feature-design should land the lookup contract before component
  changes.
- **Side-panel resize persistence has a config-vs-local choice** —
  `config_kv` syncs across machines if/when we have sync;
  localStorage is per-device. Feature-design decides; document the
  reasoning.
- **Prompt-preview unification may not be additive** — replacing four
  preview shapes with one block-oriented view is a breaking change
  to the configurator's information architecture. Feature-design
  must verify the unified view can do everything each existing
  preview does (especially the append-highlight affordance) before
  committing.
- **Configurator section reorder may have hidden coupling** — if
  section position is hardcoded vs. driven by a registry, the
  reorder is either a one-line change or a per-section migration.
  Feature-design must check first.

## Review (2026-05-14)

**Verdict**: Approve

All four child features landed:
- `epic-editorial-polish-pass-app-chrome` — done
- `epic-editorial-polish-pass-concept-name-surfacing` — done
- `epic-editorial-polish-pass-prompt-config-redesign` — done
- `epic-editorial-polish-pass-resizable-panels` — done

Epic delivered as briefed. All five absorbed backlog ideas
(`idea-top-menu-bar-styling`, `idea-teaching-style-top-of-prompt-config`,
`idea-unified-prompt-preview-blocks`, `idea-resizable-side-panels`,
`idea-gates-editor-show-concept-names-not-ids`) archived.

The chrome and editors now match the editorial design system:
- Top nav uses the editorial spacing/typography; "Chat" renamed
  to "Tutor"; wordmark stylised.
- Prompt config rearranged with teaching style at top; the four
  parallel preview shapes consolidated into a single
  `<PromptBlockStack>` with a Blocks/Composed toggle.
- Concept names appear everywhere a concept surfaces in editing
  UIs (gates editor ConceptNode, gates reading view, lesson
  editor multi-select picker), with raw ids available as
  muted secondary text + `title=` tooltip.
- Side panels resize with persisted widths and min/max bounds.

Children: 4/4 done. Ready to advance.
