# Structure Rule: ui-components-feature-folders

> New UI components go into feature subfolders inside
> `packages/ui/src/components/` (e.g., `components/chat/`,
> `components/library/`, `components/course-create/`). Don't add new
> top-level files to the flat `components/` directory.

## Motivation

`packages/ui/src/components/` currently holds 50+ flat files. Finding
the right component to extend (and avoiding duplicating one) is a slow
visual scan over an unsorted list, and the flatness encourages
copy-paste creation of near-duplicates. The repo already has natural
feature boundaries — chat workspace, library, course-create, gates,
sketch, concept-map — and grouping by feature shrinks each browse-target
to 5-10 files.

Components in the flat root that are genuinely cross-feature (the
editorial primitives `RouteHeader`, `LibrarySection`, `EmptyState`,
etc.) stay at the root or move to a `components/editorial/` subfolder.

## What Counts

A component triggers this rule when:

1. It lives directly under `packages/ui/src/components/` (not in a
   subfolder).
2. It is **only used by one feature surface** (chat, library,
   course-create, gates, sketch, concept-map, configure, study-skills,
   workspace).
3. Its name is feature-coded (`QuizTabBody.tsx`, `HomeworkTabBody.tsx`,
   `CourseCreateTabBody.tsx` etc.) or it imports primarily from a
   feature-specific hook.

A component is **acceptable at the root** (or in `components/editorial/`)
when:

- It's used by 3+ feature surfaces.
- It's an editorial primitive (`RouteHeader`, `LibrarySection`,
  `EmptyState`, `LoadingState`, `ErrorMessage`).
- It's the `<TopNav>` / `<StatusStrip>` / `<ActivityRail>` chrome.

## Before / After

### From this codebase: per-mode tab bodies

**Current** — these all sit at the flat root:
```
packages/ui/src/components/
  QuizTabBody.tsx
  HomeworkTabBody.tsx
  ExamTabBody.tsx
  CourseCreateTabBody.tsx
  StudySkillsTabBody.tsx
  ...
```

**After**
```
packages/ui/src/components/
  chat/
    ├─ ChatTabBody.tsx
    ├─ QuizTabBody.tsx
    ├─ HomeworkTabBody.tsx
    ├─ ExamTabBody.tsx
    ├─ StudySkillsTabBody.tsx
    └─ index.ts         # re-exports
  course-create/
    ├─ CourseCreateTabBody.tsx
    ├─ DraftPreview.tsx
    └─ index.ts
  library/
    └─ ...
  editorial/             # shared primitives
    ├─ RouteHeader.tsx
    ├─ LibrarySection.tsx
    ├─ EmptyState.tsx
    └─ index.ts
```

Imports update from `"../components/QuizTabBody.js"` to
`"../components/chat/QuizTabBody.js"` (or barrel-imported via the
folder `index.ts`).

### Synthetic example: shared component staying at root

A `<Modal>` primitive used by 5 surfaces stays at `components/Modal.tsx`
(or `components/editorial/Modal.tsx`). The rule is about feature
grouping; cross-cutting primitives are explicitly out of scope.

## Exceptions

- **Editorial / chrome primitives** — `<TopNav>`, `<StatusStrip>`,
  `<Modal>`, `<RouteHeader>`. These either stay flat or move to a
  `components/editorial/` folder, never to a feature folder.
- **Single-component features** — if a feature only has one component,
  promoting it to its own folder adds noise without value. Use the
  flat root.
- **TanStack Router route files** — those live in
  `packages/ui/src/routes/`, not `components/`. Not in scope.

## Scope

- **Applies to**: `packages/ui/src/components/*.tsx` (top level only).
- **Does NOT apply to**:
  - Components already inside a feature subfolder.
  - Routes (`packages/ui/src/routes/`).
  - Hooks (`packages/ui/src/hooks/`) — these have their own
    organization concerns.
  - Tests.

## Detection

```bash
ls -1 packages/ui/src/components/*.tsx \
  | awk -F'/' '{print $NF}' \
  | sort
```

Cross-check each top-level file against the **What Counts** criteria.
Components used by exactly one feature surface are High Value
candidates; components used by 2-3 surfaces are **Worth Considering**
(could go either way); components used by 3+ are **Not Worth It**
(they belong at the root).

For High Value entries: cite the file, name the target feature folder,
list every importer (`rg "from .*components/<file>"`), and propose the
move. Bundle multiple related moves into one substrate item — moving
all five tab-bodies together is one refactor, not five.
