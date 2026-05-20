# Structure Rule: services-folder-by-feature

> New service modules go into feature subfolders inside
> `packages/core/src/services/` (e.g., `services/artifacts/`,
> `services/course-create/`) — not as another top-level file. Existing
> top-level service files are migration targets, not the model to copy.

## Motivation

`packages/core/src/services/` holds ~15,000 LoC across 15+ service
classes at the top level (`artifacts-service.ts`,
`course-create-service.ts`, `notes-service.ts`, etc.) plus a handful of
already-split feature folders (`memory/`, `graders/`, `course-create/`,
`indexers/`, `session/`). The split folders show the target shape; the
top-level files are the residual.

The composition root for the service layer (`SessionServiceImpl`) is
load-bearing — it imports `@praxis/engines` + `@praxis/tools` (the only
place in `@praxis/core` that does, per the Phase 3 exception). Keeping
*every* service at the top level makes that composition root harder to
follow because the imports compete with 15 sibling files.

Per-feature subfolders also let each feature own its types, helpers,
and tests cohesively.

## What Counts

A site triggers this rule when:

1. A new service file is being added directly under
   `packages/core/src/services/` instead of in a feature subfolder.
2. An existing top-level service file is large (>500 LoC) or has
   internal section comments suggesting natural sub-features.

It does NOT trigger when:

- The service is genuinely cross-feature glue (e.g., `db-helpers.ts`,
  `activity-registry.ts`, `notify-listeners-helper.ts`) — those stay
  at the top level.
- The service is the composition root (`session-service.ts` /
  `engine-session-manager.ts`) — these legitimately depend on every
  feature.

## Before / After

### From this codebase: existing top-level services that should move

**Before**
```
packages/core/src/services/
  artifacts-service.ts          (1062 LoC)
  course-create-service.ts      (1155 LoC)
  notes-service.ts
  flashcards-service.ts
  library-service.ts
  authoring-service.ts
  assignment-service.ts
  config-service.ts
  ...
  memory/                       (already split — model to copy)
  graders/                      (already split)
  course-create/                (partially split)
  indexers/                     (already split)
  session/                      (already split)
```

**After**
```
packages/core/src/services/
  artifacts/
    ├─ index.ts
    ├─ courses.ts
    ├─ lessons.ts
    ├─ assignments.ts
    └─ gates.ts
  course-create/                (existing folder absorbs the megafile)
    ├─ drafter.ts
    ├─ attachments.ts
    └─ ...
  notes/
  flashcards/
  library/
  authoring/
  config/
  ...
  memory/ graders/ indexers/ session/  (unchanged)
  db-helpers.ts                  (still top-level — cross-feature glue)
  session-service.ts             (still top-level — composition root)
```

### Synthetic example: when to keep top-level

`packages/core/src/services/notify-listeners-helper.ts` — a 10-line
helper used by every service. Keeping it at the top level is correct;
moving it into a feature folder would force cross-folder coupling.

## Exceptions

- **Cross-feature glue and helpers** (`db-helpers.ts`,
  `activity-registry.ts`, `notify-listeners-helper.ts`) stay at the
  top level.
- **Composition roots** (`session-service.ts`,
  `engine-session-manager.ts` — the Phase 3 exception). These import
  across features by design.
- **One-file services** under ~150 LoC with no natural sub-features.
  Forced splitting adds noise.

## Scope

- **Applies to**: `packages/core/src/services/*.ts` (top level).
- **Does NOT apply to**:
  - Already-split folders (`memory/`, `graders/`, etc.) — internal
    organization is up to them.
  - Services in other packages (`packages/curriculum/src/`, etc.) —
    those have their own structural patterns.
  - Tests.

## Detection

```bash
ls -l packages/core/src/services/*.ts \
  | awk '{print $5, $NF}' | sort -nr | head -20
```

Cross-check each top-level service file:
- **High Value**: file is >500 LoC and clearly splittable by feature
  (internal section comments, distinct method clusters).
- **Worth Considering**: file is 200-500 LoC and split would help, but
  the file is cohesive enough that the win is moderate.
- **Not Worth It**: cross-feature glue or composition root — keep
  top-level.

For High Value entries: cite the file, current LoC, target folder
name, proposed file split (which methods/types go where), and confirm
the `services/` folder's `index.ts` (if any) gets updated so external
importers don't break. Bundle related splits — splitting
`artifacts-service.ts` likely co-occurs with splitting
`packages/core/src/types/artifacts.ts` (the file-size-under-800-loc
rule).
