# Structure Rule: file-size-under-800-loc

> Source files in `packages/*/src/` and `apps/*/src/` stay under 800
> lines of code. Type modules and service classes are not exceptions
> — split by sub-feature. Tests are exempt.

## Motivation

Audit data: **14 source files exceed 800 LoC**, with the worst offenders
being `course-create-service.ts` (1155), `artifacts.ts` (1144),
`artifacts-service.ts` (1062). These files are the slowest to navigate,
the slowest to typecheck per-edit, and the most likely to attract
unrelated additions because "there's already a place for it." The repo's
own service layout shows the alternative: `services/memory/` and
`services/graders/` are split into focused per-feature files. The
service-feature pattern works; the megafile pattern is residual debt.

800 LoC is the threshold the team picked because it catches the real
outliers without flagging the 500-800 LoC files where service-class
cohesion legitimately demands the bulk.

## What Counts

A file violates this rule when:

1. It lives in `packages/*/src/` or `apps/*/src/`.
2. It is **not** a test file, type declaration, or vendored code.
3. It exceeds 800 lines (count via `wc -l <file>`).

A file is **flagged but acceptable** when:

- It's already split internally (clear `// ─── Section ───` boundaries
  signaling a future split) and the work to split is queued as a
  substrate item.
- It's a single-class file whose class genuinely needs all the methods
  to share private state (rare).

## Before / After

### From this codebase: top offenders to split

`packages/core/src/services/course-create-service.ts` (1155 LoC) —
methods cluster around drafting (start/persist/discard), attachments
(attach/promote), and listing. Split target:
```
packages/core/src/services/course-create/
  ├─ index.ts          (re-exports the public surface)
  ├─ drafter.ts        (start/persist/discard + drafter tools)
  ├─ attachments.ts    (attach/promote/passage-range)
  ├─ listing.ts        (listActiveForStudent + queries)
  └─ shared.ts         (loadOrThrow wiring, helpers)
```

`packages/core/src/types/artifacts.ts` (1144 LoC) — splits cleanly by
artifact kind (courses, lessons, assignments, exams, gates, notes,
flashcards, concept-maps). Target: one file per artifact kind under
`types/artifacts/`.

`packages/core/src/services/artifacts-service.ts` (1062 LoC) — already
has internal section comments for each artifact kind. Split target
mirrors the types split.

### Synthetic example: when NOT to split

A 750-LoC file that's already cohesive (one class, one feature, no
clear seams) is **not** in scope — even if you could split it, the
result would be artificial and add coupling across the new files. The
threshold exists because below 800 LoC, splitting usually costs more
than it gives.

## Exceptions

- **Test files** (`*.test.ts`, `*.test-d.ts`, `*.spec.ts`). The two
  biggest files in the repo are tests (`use-streamed-send.test.tsx`,
  1746 LoC; `drafter.test.ts`, 1260 LoC); they are exempt. Tests grow
  with scenarios, not with feature complexity.
- **`.d.ts` ambient declarations** for third-party libraries.
- **Generated files** (Drizzle metadata, codegen output) — these are
  not hand-edited.
- **Single-class composition roots** where splitting would force
  cross-file `private` exposure. Document the choice with a header
  comment.

## Scope

- **Applies to**: `packages/*/src/**/*.{ts,tsx}` and
  `apps/*/src/**/*.{ts,tsx}` excluding tests.
- **Does NOT apply to**:
  - `packages/*/src/**/__tests__/**`
  - `packages/*/dist/`, `node_modules/`, generated `drizzle/meta/`
  - `*.d.ts`
  - `scripts/` one-shots

## Detection

```bash
find packages/*/src apps/*/src \
  -name '*.ts' -not -name '*.test.ts' -not -name '*.test-d.ts' \
  -not -path '*/__tests__/*' -not -path '*/dist/*' \
  -exec wc -l {} + \
  | awk '$1 > 800' | sort -nr
```

For High Value entries: cite the file and current LoC, propose the
target split structure (folder + file names + which method/type goes
where), and confirm no circular import surfaces. Mark **Worth
Considering** for files in the 800-1000 range that are clearly
cohesive; mark **Not Worth It** if the file is already queued for a
different refactor that will subsume it.
