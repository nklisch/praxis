---
id: gate-patterns-inconsistency-noop-dispatch-duplication
kind: story
stage: implementing
tags: [refactor]
parent: null
depends_on: []
release_binding: null
gate_origin: patterns
created: 2026-05-24
updated: 2026-05-24
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
