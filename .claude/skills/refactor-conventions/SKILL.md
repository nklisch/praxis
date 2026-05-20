---
name: refactor-conventions
description: >
  Praxis refactoring conventions. Proactively scans the codebase for
  style and structural drift, classifies findings, and writes a
  prioritized refactor plan as a substrate story. Triggers when the
  user asks to "find refactor opportunities", "scan for conventions",
  "audit comment hygiene", or invokes this skill explicitly.
user-invocable: true
allowed-tools: Read, Glob, Grep, Bash, Agent, Write
---

# Refactor Conventions

Scan the Praxis codebase for opportunities to apply the team's preferred
conventions. Each rule has a reference file with motivation, real
before/after examples, exceptions, scope, and a ripgrep recipe. **Always
read the reference file** before flagging under a rule.

## Style Rules

| Rule | One-line summary | Reference |
|------|------------------|-----------|
| no-temporal-comments | Comments describe what the code IS now — no phase numbers, recency markers, rename provenance, or backward-compat narrative. | [details](references/style/no-temporal-comments.md) |
| no-restating-code-comments | Comments explain WHY, not WHAT. Don't paraphrase the next line; let well-named identifiers carry the meaning. | [details](references/style/no-restating-code-comments.md) |
| no-stale-todos | Every `TODO`/`FIXME` carries either an owner+link or a concrete trigger condition — no "TODO eventually" or milestone-tagged TODOs. | [details](references/style/no-stale-todos.md) |
| any-needs-justification | Every `: any` and `as any` carries a `// biome-ignore lint/suspicious/noExplicitAny: <reason>` comment. | [details](references/style/any-needs-justification.md) |
| use-load-or-throw | After `insert/update/delete`, use the `loadOrThrow(...)` helper — never inline `if (!row) throw new Error(...)`. | [details](references/style/use-load-or-throw.md) |
| prefer-discriminated-result-unions | For per-item or recoverable failures in tool/mutation contracts, return `{ ok: true, ... } \| { ok: false, reason: string }` instead of throwing. | [details](references/style/prefer-discriminated-result-unions.md) |
| early-returns-over-nested-ifs | Prefer guard clauses + early returns; cap function body nesting at 2 levels. | [details](references/style/early-returns-over-nested-ifs.md) |

## Structure Rules

| Rule | One-line summary | Reference |
|------|------------------|-----------|
| file-size-under-800-loc | Source files stay under 800 LoC. Type modules and service classes are not exceptions — split by sub-feature. | [details](references/structure/file-size-under-800-loc.md) |
| prefer-drizzle-inferred-types | Use `typeof table.$inferSelect` / `$inferInsert` instead of parallel hand-rolled `Row` interfaces in `types/`. | [details](references/structure/prefer-drizzle-inferred-types.md) |
| ui-components-feature-folders | New UI components go in feature subfolders (`components/chat/`, `components/library/`) — don't add to the flat `components/` root. | [details](references/structure/ui-components-feature-folders.md) |
| services-folder-by-feature | New service modules go in feature subfolders (`services/artifacts/`, `services/memory/`) — not as another top-level file in `services/`. | [details](references/structure/services-folder-by-feature.md) |
| tests-colocated-not-scattered | Per-package tests in `packages/<pkg>/src/__tests__/`. Integration tests at repo-root `tests/`. No other locations. | [details](references/structure/tests-colocated-not-scattered.md) |

## How to Run

1. Scope: default `packages/*/src/` and `apps/*/src/`; honor a path arg.
2. For each rule, follow the **Detection** section in its reference.
3. Classify findings using the rule's `Exceptions` / `Scope`: **High
   Value** (implement-ready), **Worth Considering** (valid but needs
   judgment), **Not Worth It** (technically a hit but should stay).
4. Write the plan to `.work/active/stories/refactor-<slug>.md` with
   `tags: [refactor]` so `/agile-workflow:refactor-design` picks it up.

## Output Format

```markdown
# Refactor Plan: <scope>

## Style Refactors
### High Value
- **<rule>** — file:line — current → target (one sentence)
  - Acceptance: <what "done" looks like>
### Worth Considering
- **<rule>** — file:line — rationale
### Not Worth It
- **<rule>** — file:line — why this should stay

## Structure Refactors
(same shape)
```

Keep High Value entries implement-ready: file, line, exact target text,
one-sentence acceptance. Don't bulk-list every match — curate.

## Anti-Patterns

- Don't bundle formatting (semicolons, quotes, indentation) — Biome owns that.
- Don't flag matches inside `docs/`, `.work/`, `.mockups/`, `.claude/`,
  `drizzle/meta/`, generated code, or `node_modules/` unless a rule's Scope
  overrides.
- Don't auto-apply fixes — produce the substrate item; let the user (or
  `/agile-workflow:refactor-design`) drive implementation.
