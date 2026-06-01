# Pattern: Service Facade with Sibling Helper Directory

When a service grows beyond ~400 LoC or accumulates pure helpers, split it into a thin facade at `services/<name>-service.ts` and a sibling directory `services/<name>/` containing pure helpers, dispatch registries, prompt sidecars, and sub-services; barrel-export from `services/index.ts` so consumers stay unaware of the internal split.

## Rationale

Service decomposition refactors (memory, course-create, assignment graders, indexers, session) all converged on the same shape: the facade keeps the public class + DI seam, while pure logic, prompt strings, row mappers, and per-variant dispatch modules live in the sibling dir. Consumers continue to import from `@praxis/core/services` — the barrel hides the directory split.

## Examples

### Example 1: graders (registry + per-kind grader + prompts)

**Facade**: `packages/core/src/services/assignment-service.ts:35`
**Sibling dir**: `packages/core/src/services/graders/`

```
services/
  assignment-service.ts           ← facade (uses GradingOrchestrator)
  graders/
    index.ts                      ← barrel for the dir
    types.ts                      ← shared port: ItemGrader, GraderContext
    registry.ts                   ← kind→adapter map
    short-answer-grader.ts, math-grader.ts, code-grader.ts, …
    rubric-agent.ts, approach-feedback.ts        ← LLM agents
    rubric-prompt.ts, approach-prompt.ts         ← prompt sidecars
    grading-orchestrator.ts, submission-helpers.ts
```

### Example 2: memory (facade + pure helpers + row mapper)

**Facade**: `packages/core/src/services/memory/memory-service.ts`
**Barrel**: `packages/core/src/services/index.ts:123`

```
memory/
  memory-service.ts        ← facade MemoryServiceImpl
  bkt.ts, decay.ts         ← pure math
  mastery-row-mapper.ts    ← Drizzle row → domain object
  mastery-queries.ts, mastery-writes.ts  ← read/write split
```

### Example 3: course-create (facade + mutations + persistence + validator)

**Facade**: `packages/core/src/services/course-create-service.ts:31`
**Sibling dir**: `packages/core/src/services/course-create/`

```
course-create-service.ts                     ← facade
course-create/
  index.ts, helpers.ts, draft-validator.ts
  draft-mutations.ts, draft-mutators.ts, draft-queries.ts
  draft-persistence.ts, draft-confirmer.ts
  pack-course-creator.ts
```

### Example 4: indexers (orchestrator + per-indexer class + prompt sidecars)

**Sibling dir**: `packages/core/src/services/indexers/`

- `orchestrator.ts` runs all indexers
- `affective-indexer.ts` + `affective-prompt.ts`
- `misconception-indexer.ts` + `misconception-prompt.ts`
- `concept-map-divergence-indexer.ts` + `concept-map-divergence-prompt.ts`

### Example 5: session (manager + promoter + spawner + sweep + registry)

**Facade**: `packages/core/src/services/session-service.ts`
**Sibling dir**: `packages/core/src/services/session/`

- `engine-session-manager.ts`, `session-promoter.ts`, `session-spawner.ts`
- `session-promotion-registry.ts`, `session-sweep-indexer.ts`

## When to Use

- A service file is approaching ~400 LoC and contains 3+ concerns that could each be tested in isolation.
- The work splits cleanly into pure helpers (no DB / IO) plus a thin orchestrating class.
- You have per-variant dispatch (kind→handler, schedule→indexer) that benefits from a registry module (see `kind-adapter-registry`).

## When NOT to Use

- The service is small (<300 LoC) and cohesive — adding a directory is premature structure.
- Helpers are truly one-off (used only by one method) — keep them as private methods/file-scope functions until a second caller arrives.

## Common Violations

- Putting the facade class file *inside* the sibling dir — keep `<name>-service.ts` at `services/` level so it's discoverable from the package barrel.
- Skipping the `index.ts` barrel inside the sibling dir — every consumer ends up writing deep paths like `./graders/short-answer-grader.js`; instead re-export from `services/graders/index.ts` and let `services/index.ts` re-re-export.
- Cyclic import between facade and sibling helper — helpers must not import from the facade file.
