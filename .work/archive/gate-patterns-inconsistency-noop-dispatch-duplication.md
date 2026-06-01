---
id: gate-patterns-inconsistency-noop-dispatch-duplication
kind: story
stage: done
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: patterns
created: 2026-05-24
updated: 2026-05-25
---

# `noopDispatch` is duplicated literally across 6 LLM-inference sites

## Existing pattern

`one-shot-llm-inference` — background LLM passes use
`runOneShot(engine, { systemPrompt, tools: { list: () => [], dispatch: noopDispatch }, maxSteps: 1 }, userMessage)`
with `noopDispatch` being a no-tool sentinel that returns a friendly
"no_tools" error if the model improvises a tool call.

## Nature of divergence

Every one-shot inference site ships its own private `noopDispatch`
helper with an identical body:

```ts
async function noopDispatch(): Promise<{
  ok: false;
  error: { code: "no_tools"; message: "<varies>"; recoverable: false };
}> {
  return {
    ok: false,
    error: { code: "no_tools", message: "...", recoverable: false },
  };
}
```

Sites:

- `packages/core/src/services/notes-service.ts:351`
- `packages/core/src/services/indexers/affective-indexer.ts:206`
- `packages/core/src/services/indexers/concept-map-divergence-indexer.ts:196`
- `packages/core/src/services/indexers/misconception-indexer.ts:245`
- `packages/core/src/services/graders/rubric-agent.ts:220`
- `packages/core/src/services/graders/approach-feedback.ts:122`

## Required action

Pick one extraction site and replace the 6 copies:

- **Option A (preferred)**: export `noopDispatch` from
  `@praxis/engines` next to `runOneShot` — it's the natural home since
  `runOneShot`'s callers already import from there.
- **Option B**: drop it into a new `packages/core/src/services/llm-helpers.ts`.

Each consumer changes from a local declaration to a single import line.
The message text is allowed to drift per-site (each currently encodes
which agent triggered the error); fold that into a single message
("no tools available in one-shot inference") or accept a `label`
parameter — `noopDispatch("affective-indexer")`.

## Scope

6 files, ~30 lines of duplicated code. Pure refactor; no behavior
change (the dispatch is unreachable unless the model improvises). One
PR.

## Provenance

Surfaced by the v0.1.4 patterns gate rerun (2026-05-24) while codifying
the new `one-shot-llm-inference` pattern.

## Implementation notes (2026-05-25)

Chose Option A. `noopDispatch` exported from `packages/engines/src/types.ts` as a
higher-order function — `noopDispatch(label)` returns the dispatch function with
the correct `ToolRegistry.dispatch` signature `(name, args) => Promise<ToolResult>`:

```ts
export const noopDispatch =
  (label = "one-shot inference") =>
  async (_name: string, _args: unknown): Promise<ToolResult> => ({
    ok: false,
    error: {
      code: "no_tools",
      message: `${label}: model attempted a tool call but no tools are registered`,
      recoverable: false,
    },
  });
```

Re-exported from `packages/engines/src/index.ts`. `packages/engines` rebuilt so `dist/`
is in sync (tests resolve via `dist/` even with `praxis-source` condition active for the
consumer package).

Files changed:
- `packages/engines/src/types.ts` — added `noopDispatch` export + `import type { ToolResult }`
- `packages/engines/src/index.ts` — re-exported `noopDispatch`
- `packages/core/src/services/notes-service.ts` — import + label `"notes-summarizer"`
- `packages/core/src/services/indexers/affective-indexer.ts` — import + label `"affective-indexer"`
- `packages/core/src/services/indexers/concept-map-divergence-indexer.ts` — import + label `"concept-map-divergence-indexer"`
- `packages/core/src/services/indexers/misconception-indexer.ts` — import + label `"misconception-indexer"`
- `packages/core/src/services/graders/rubric-agent.ts` — import + label `"rubric-agent"`
- `packages/core/src/services/graders/approach-feedback.ts` — import + label `"approach-feedback"`
- `packages/core/src/services/indexers/__tests__/affective-indexer.test.ts` — added `noopDispatch: vi.fn(() => vi.fn())` to the `vi.mock("@praxis/engines")` factory (stale mock — didn't include the new export)

## Review (2026-05-25)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: Higher-order shape `noopDispatch(label) => (name, args) => ToolResult` exactly matches `ToolRegistry.dispatch`'s signature; verified at the `affective-indexer.ts` call site (`dispatch: noopDispatch("affective-indexer")`). All 6 private copies removed. The single unified error message format ("<label>: model attempted a tool call but no tools are registered") preserves diagnostic specificity via the label while consolidating the 6 prior message variants. Stale `vi.mock("@praxis/engines")` in `affective-indexer.test.ts` correctly caught and patched. 5399 tests pass. Pre-existing typecheck issues unchanged (Drizzle cross-package duplicate-instance — already parked as `idea-drizzle-cross-package-type-identity`).
