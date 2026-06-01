---
name: refactor-conventions
description: >
  Project-specific refactor conventions for Praxis. Auto-loads when
  agile-workflow refactor-design scans or designs refactors. Extends
  refactor-design's default smell scan with team-confirmed style and structural
  preferences; does not replace the defaults and does not create standalone plan
  docs.
user-invocable: false
allowed-tools: Read, Glob, Grep
---

# Refactor Conventions

This is a reference catalog consumed by `/agile-workflow:refactor-design`.
Run refactor-design's built-in scan first, then use these conventions as an
additional lens for project-specific consistency.

## Style Rules

Source of truth: `CLAUDE.md` -> `## Refactor Style Conventions`.
Summaries here are an index only; if this file conflicts with the canonical
instruction file, the instruction file wins.

| Rule | Summary | Reference |
|---|---|---|
| no-temporal-comments | Comments describe what the code IS now — no phase numbers, recency markers, rename provenance, or backward-compat narrative. | [details](references/style/no-temporal-comments.md) |
| no-restating-code-comments | Comments explain WHY, not WHAT. Don't paraphrase the next line; let well-named identifiers carry the meaning. | [details](references/style/no-restating-code-comments.md) |
| no-stale-todos | Every `TODO`/`FIXME` carries either an owner+link or a concrete trigger condition — no "TODO eventually" or milestone-tagged TODOs. | [details](references/style/no-stale-todos.md) |
| any-needs-justification | Every `: any` and `as any` carries a `// biome-ignore lint/suspicious/noExplicitAny: <reason>` comment. | [details](references/style/any-needs-justification.md) |
| use-load-or-throw | After `insert/update/delete`, use the `loadOrThrow(...)` helper — never inline `if (!row) throw new Error(...)`. | [details](references/style/use-load-or-throw.md) |
| prefer-discriminated-result-unions | For per-item or recoverable failures in tool/mutation contracts, return `{ ok: true, ... } \| { ok: false, reason: string }` instead of throwing. | [details](references/style/prefer-discriminated-result-unions.md) |
| early-returns-over-nested-ifs | Prefer guard clauses + early returns; cap function body nesting at 2 levels. | [details](references/style/early-returns-over-nested-ifs.md) |

## Structural Refactor Rules

| Rule | Summary | Reference |
|---|---|---|
| file-size-under-800-loc | Source files stay under 800 LoC. Type modules and service classes are not exceptions — split by sub-feature. | [details](references/structure/file-size-under-800-loc.md) |
| prefer-drizzle-inferred-types | Use `typeof table.$inferSelect` / `$inferInsert` instead of parallel hand-rolled `Row` interfaces in `types/`. | [details](references/structure/prefer-drizzle-inferred-types.md) |
| ui-components-feature-folders | New UI components go in feature subfolders (`components/chat/`, `components/library/`) — don't add to the flat `components/` root. | [details](references/structure/ui-components-feature-folders.md) |
| services-folder-by-feature | New service modules go in feature subfolders (`services/artifacts/`, `services/memory/`) — not as another top-level file in `services/`. | [details](references/structure/services-folder-by-feature.md) |
| tests-colocated-not-scattered | Per-package tests in `packages/<pkg>/src/__tests__/`. Integration tests at repo-root `tests/`. No other locations. | [details](references/structure/tests-colocated-not-scattered.md) |

## How To Use

- Do not emit work just because a rule is technically violated.
- High-value convention drift can become substrate items through
  `/agile-workflow:refactor-design`.
- Small, surgical fixes become stories at `stage: implementing`.
- Multi-file or policy-heavy changes become `[refactor]` features at
  `stage: drafting`.
- Marginal churn belongs in "not worth it" notes, not in `.work/`.
