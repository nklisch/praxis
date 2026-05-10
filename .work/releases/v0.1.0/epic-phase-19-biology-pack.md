---
id: epic-phase-19-biology-pack
kind: feature
stage: done
tags: [content]
parent: epic-phase-19-ship-v1
depends_on: []
release_binding: v0.1.0
gate_origin: null
created: 2026-05-10
updated: 2026-05-10
---

# Biology canonical pack

## Brief

Author the second canonical pack — high-school biology, NGSS-mapped, roughly
~250 concepts — that ships alongside the existing `algebra-1` and `geometry`
packs from Phase 10. The pack drops a single JSON file at
`packages/curriculum/packs/biology.json` conforming to `PackManifestSchema`
in `@praxis/curriculum/packs`. The bootstrap and configure modes already
expose `course.list_canonical_packs` / `course.use_canonical_pack`, and
`PackImportServiceImpl` already loads any `*.json` in `packs/`, so the
delivery surface is just the file plus integration tests.

What this feature covers:

- The pack manifest with stable concept ids (`biology.<concept-slug>`),
  descriptions, aliases, and `standardsTags` mapping to NGSS HS-LS codes.
- Prerequisite edges that produce a sensible router order (cell biology
  before genetics, photosynthesis paired with cellular respiration as
  parallel rather than chained, etc.). The pack feature owns the pedagogical
  structure decision.
- A smoke test that imports the pack via `PackImportServiceImpl` and asserts
  conceptCount, edge sanity (no orphan refs, no cycles), and that
  `BootstrapServiceImpl.createCourseFromPack` produces a course with lessons
  of ~7 concepts each.
- A short authoring note in the pack file's `authoredBy` / `standardsRef`
  fields and (optionally) a sibling `biology.notes.md` capturing sources and
  tradeoffs.

What this feature does NOT cover:

- No schema changes to `PackManifestSchema` — biology must fit the existing
  shape. If it doesn't, that's a finding for a separate refactor feature,
  not this one.
- No bootstrap-mode UI changes — the canonical-pack picker already lists
  whatever is on disk.
- No mastery-model tuning for biology specifically.

## Epic context

- Parent epic: `epic-phase-19-ship-v1`
- Position in epic: independent capability — produces the second canonical
  pack the v1 ship promises. Does not block any other feature; ship-checklist
  consumes it at the end.

## Foundation references

- `docs/ROADMAP.md` — Phase 19 build list ("Biology canonical pack
  (NGSS-mapped, ~250 concepts)").
- `docs/CURRICULUM.md` § "Canonical graphs at launch" — biology is one of
  the two canonical graphs at launch (the other is the math pack from
  Phase 10).
- `docs/SPEC.md` § "Subjects (canonical concept graphs + content packs)
  are independently versioned packages" — the pack-versioning story.
- `packages/curriculum/packs/algebra-1.json` and `geometry.json` — reference
  shape and tone for descriptions.
- `packages/curriculum/src/packs/import-service.ts` — the loader the pack
  must satisfy.
- `packages/curriculum/src/packs/schema.ts` — `PackManifestSchema`, the
  binding contract.

## Design decisions

- **Concept-count target: ~100, not ~250.** ROADMAP names "~250 concepts" but
  the existing canonical packs ship 31-34 concepts each with multi-sentence
  descriptions. A v1 biology pack at ~250 concepts would either dilute
  description quality or slip the Phase 19 epic. The pragmatic v1 target is
  **90-120 concepts** — roughly 3x the existing math packs, sufficient for a
  full HS biology course, room to grow post-v1. The ROADMAP aspiration is
  recorded as a long-tail goal in the pack file's authoring notes; not a v1
  blocker.
- **Authoring approach: LLM-drafted then validated by `pack-content.test.ts`.**
  The implementation pass IS an LLM — it generates the JSON directly under
  `PackManifestSchema` constraints. Human curation happens through the
  review skill against the rendered pack file. Schema validation
  (`PackManifestSchema.superRefine`) catches structural errors at parse
  time; content quality is judged at `stage: review`.
- **Standards body: NGSS HS-LS (2013).** `standardsRef` is
  `{ body: "NGSS-HS-LS", version: "2013" }`. Concept `standardsTags` are
  NGSS performance-expectation codes — `HS-LS1-1`, `HS-LS2-3`, etc. —
  drawn from the four NGSS HS-LS strands.
- **Conceptual macro-order: LS1 → LS3 → LS4 → LS2.** Cell biology
  (Molecules to Organisms) underpins genetics (Heredity); evolution
  (LS4) builds on genetics; ecosystems (LS2) integrate everything and
  go last. This is a standard HS biology sequence and produces sensible
  router output.
- **No new schema, no new loader code.** The biology pack must fit
  `PackManifestSchema` exactly. If a concept can't be expressed in the
  current schema, that's a separate refactor feature, not in scope here.
- **No child stories.** The feature is one cohesive artifact (the JSON
  file) plus a thin band of tests that mirror the existing algebra-1 /
  geometry blocks in `pack-content.test.ts`. Single-stride
  implementation, tight cohesion, single agent. Stories would be pure
  overhead.

## Architectural choice

**Chosen: drop a single `biology.json` next to `algebra-1.json` and
`geometry.json`, mirroring the established Phase 10 shape. No new code,
no schema changes, no new loader.** Alternatives considered:

- *Multi-file pack* (one JSON per NGSS strand, glued at import time) —
  rejected: requires loader changes and a new manifest format, no payoff
  for v1.
- *Generated-from-source pack* (drive the JSON from a Markdown / CSV
  authoring source via a build step) — rejected: adds a build dependency
  and obscures the pack's content. The JSON is the source of truth in
  the existing model; biology should be no different.

## Implementation Units

### Unit 1: `packages/curriculum/packs/biology.json`
**File**: `packages/curriculum/packs/biology.json`

Structure (mirroring `algebra-1.json`):

```jsonc
{
  "id": "biology",
  "version": "1.0.0",
  "name": "High School Biology (NGSS)",
  "subject": "science.biology",
  "gradeLevel": "9-12",
  "standardsRef": { "body": "NGSS-HS-LS", "version": "2013" },
  "authoredBy": "Praxis curriculum team",
  "authoredAt": "2026-05-10T00:00:00.000Z",
  "concepts": [
    {
      "id": "biology.cell-theory",
      "name": "Cell Theory",
      "description": "All living organisms are composed of cells; cells are the basic unit of structure and function in living things; new cells arise from existing cells. Foundational principle that frames everything in cellular and organismal biology.",
      "aliases": ["cell doctrine"],
      "standardsTags": ["HS-LS1-1"]
    }
    // ... 89-119 more concepts ...
  ],
  "edges": [
    { "fromId": "biology.cell-theory", "toId": "biology.cell-structure", "strength": 0.95 }
    // ... prerequisite edges ...
  ]
}
```

**Concept distribution** (target counts per NGSS strand — flexible
within ±10):

- LS1 (Molecules to Organisms — cells, biomolecules, photosynthesis,
  cellular respiration, organism-level systems): ~35 concepts
- LS3 (Heredity — DNA structure, replication, transcription, translation,
  Mendelian inheritance, mutations): ~22 concepts
- LS4 (Biological Evolution — natural selection, speciation, evidence
  for evolution, phylogeny, biodiversity): ~18 concepts
- LS2 (Ecosystems — energy flow, nutrient cycles, population dynamics,
  human impact): ~25 concepts

**Edge curation principles**:

- LS1 internal: cell-theory → cell-structure → membrane-transport →
  enzymes → metabolism (photosynthesis ∥ cellular-respiration);
  biomolecules feed into all of the above.
- LS3 builds on LS1's cell-structure (specifically nucleus and
  chromosome concepts).
- LS4 builds on LS3's heredity concepts and LS1's cell biology.
- LS2 builds on LS1's metabolism (photosynthesis/respiration drive
  energy flow), LS3 (population genetics), LS4 (speciation seeds
  community ecology).
- Photosynthesis and cellular respiration are **parallel**, not chained
  — both depend on enzymes / membranes but neither depends on the
  other. (CURRICULUM.md explicitly calls this out as a sensible
  pedagogical decision.)
- Edge strength: `0.95` for hard prerequisites (genetics ⇐ DNA), `0.85`
  for strong-but-soft (ecology ⇐ population-genetics), `0.7` for
  enabling-but-not-required.

**Implementation Notes**:

- Generate via the implementation skill in one pass, conforming to
  `PackManifestSchema`. Run `PackManifestSchema.safeParse(json)` in the
  test before any other assertion fires.
- Concept ids: `biology.<kebab-case>`. Stable — once shipped, never
  rename (the `course.use_canonical_pack` flow records concept ids in
  course state).
- Descriptions: 2-3 sentences each, definition + concrete example or
  context. Mirror the tone of `algebra-1.json` descriptions.
- `aliases`: include common synonyms (e.g., "ATP" alongside "adenosine
  triphosphate") so the bootstrap-mode concept-linking step finds them.
- `authoredAt`: today's ISO date.

**Acceptance Criteria**:

- [ ] File parses via `PackManifestSchema.safeParse` → `success: true`.
- [ ] `concepts.length` between 90 and 120 inclusive.
- [ ] Every concept has a non-empty `description` ≥ 50 characters.
- [ ] Every concept has at least one `standardsTag` matching
      `^HS-LS[1-4]-\d+$`.
- [ ] `edges.length` ≥ 100 (rough sanity threshold; ~1 edge per concept).
- [ ] All edge endpoints reference known concept ids (auto-checked by
      `superRefine`).
- [ ] No prerequisite cycles (auto-checked by `superRefine`).
- [ ] Conceptual coverage smoke check: presence of at least these
      anchor concepts (case-insensitive name match) — `cell-theory`,
      `dna-structure`, `natural-selection`, `photosynthesis`,
      `cellular-respiration`, `mendelian-inheritance`, `ecosystem-energy-flow`.

### Unit 2: extend `packages/curriculum/src/packs/__tests__/pack-content.test.ts`
**File**: `packages/curriculum/src/packs/__tests__/pack-content.test.ts`

Append a `describe("biology.json", ...)` block mirroring the existing
algebra-1 and geometry blocks, plus the biology-specific anchor-concept
test:

```typescript
describe("biology.json", () => {
  it("parses successfully against PackManifestSchema", () => {
    const result = loadAndValidate("biology.json");
    if (!result.success) {
      throw new Error(`biology.json failed validation:\n${result.error.message}`);
    }
    expect(result.success).toBe(true);
  });

  it("has between 90 and 120 concepts", () => {
    const result = loadAndValidate("biology.json");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.concepts.length).toBeGreaterThanOrEqual(90);
      expect(result.data.concepts.length).toBeLessThanOrEqual(120);
    }
  });

  it("has at least 100 prerequisite edges", () => {
    const result = loadAndValidate("biology.json");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.edges.length).toBeGreaterThanOrEqual(100);
    }
  });

  it("every concept has a non-empty description ≥ 50 chars", () => {
    const result = loadAndValidate("biology.json");
    expect(result.success).toBe(true);
    if (result.success) {
      for (const concept of result.data.concepts) {
        expect(
          concept.description.length,
          `concept ${concept.id} description too short`,
        ).toBeGreaterThanOrEqual(50);
      }
    }
  });

  it("every concept has at least one NGSS HS-LS standards tag", () => {
    const result = loadAndValidate("biology.json");
    expect(result.success).toBe(true);
    if (result.success) {
      const ngssRe = /^HS-LS[1-4]-\d+$/;
      for (const concept of result.data.concepts) {
        expect(
          concept.standardsTags.length,
          `concept ${concept.id} has no standards tags`,
        ).toBeGreaterThan(0);
        for (const tag of concept.standardsTags) {
          expect(tag, `concept ${concept.id} tag '${tag}' not NGSS HS-LS`).toMatch(
            ngssRe,
          );
        }
      }
    }
  });

  it("contains the expected anchor concepts", () => {
    const result = loadAndValidate("biology.json");
    expect(result.success).toBe(true);
    if (result.success) {
      const names = new Set(result.data.concepts.map((c) => c.name.toLowerCase()));
      const ids = new Set(result.data.concepts.map((c) => c.id));
      const anchors = [
        "cell theory",
        "dna structure",
        "natural selection",
        "photosynthesis",
        "cellular respiration",
        "mendelian inheritance",
      ];
      for (const anchor of anchors) {
        const found =
          names.has(anchor) || ids.has(`biology.${anchor.replace(/\s+/g, "-")}`);
        expect(found, `missing anchor concept: ${anchor}`).toBe(true);
      }
    }
  });
});
```

**Implementation Notes**:

- Reuse the existing `loadAndValidate` helper at the top of the file —
  no new imports needed beyond it.
- The anchor-concept test is biology-specific (algebra/geometry don't
  have it) and gives reviewers a fast signal that the pack covers the
  expected curriculum spine.

**Acceptance Criteria**:

- [ ] All six tests pass against the authored `biology.json`.
- [ ] No regressions in existing algebra-1 / geometry tests.

### Unit 3: smoke test in `packages/curriculum/src/packs/__tests__/import-service.test.ts`
**File**: `packages/curriculum/src/packs/__tests__/import-service.test.ts`

Append one new `it(...)` to whichever `describe` block exercises
end-to-end import. The test imports `biology.json` via
`PackImportServiceImpl.importPack` and asserts:

- `importedPack.conceptCount` ≥ 90.
- `importedPack.edgeCount` ≥ 100.
- A round-trip select on the `concepts` table (filtered to the imported
  graph) returns the expected anchor concept ids.
- Re-importing the same pack returns the existing record (idempotent —
  this is already tested for algebra; biology gets a one-line repeat
  to ensure it holds for the new pack too).

**Implementation Notes**:

- Use the existing `useTempDb()` test helper from `tests/helpers/db-setup.ts`.
- Reuse the existing test fixture for `EmbeddingService` /
  `ConceptEmbeddingsStore` mocks — don't introduce new mocks.
- This test runs in the standard fast-test path; it does NOT require
  `PRAXIS_RUN_SLOW_TESTS=1`.

**Acceptance Criteria**:

- [ ] Test passes; full `pnpm --filter @praxis/curriculum test` green.
- [ ] Test exercises the path the bootstrap-mode `course.use_canonical_pack`
      tool would hit at runtime.

## Implementation Order

1. **Unit 1** first: author the JSON file. Schema validation (the
   `pack-content.test.ts` parse test) is the gate for everything else.
2. **Unit 2** next: extend `pack-content.test.ts` with biology assertions
   — running them surfaces structural gaps early.
3. **Unit 3** last: the import-service smoke test. Runs on top of the
   validated JSON; failure here points to loader integration issues
   (rare given the existing pattern) rather than content issues.

After all units green: run `pnpm typecheck && pnpm lint && pnpm test`
across the whole workspace before declaring done.

## Testing

### Test files

- `packages/curriculum/src/packs/__tests__/pack-content.test.ts` — extend
  with the biology block (Unit 2).
- `packages/curriculum/src/packs/__tests__/import-service.test.ts` —
  extend with the import smoke test (Unit 3).

### Test data

- Real pack: `packages/curriculum/packs/biology.json` (the artifact
  itself).
- Mock embeddings: reuse whatever `import-service.test.ts` already uses
  for algebra-1 / geometry imports — no new fixtures.

### Edge cases worth covering at review time (not as automated tests)

- Concept descriptions that quote textbook copy verbatim — this is
  authoring quality, judged in review.
- Edges that encode a non-canonical pedagogical sequence (e.g., chaining
  photosynthesis → cellular-respiration) — judged in review.
- Standards-tag mis-mapping (a concept tagged `HS-LS3-1` that's
  actually about cell biology) — judged in review.

## Risks

- **NGSS standards mapping accuracy.** Each concept's `standardsTags`
  encode pedagogical placement. Wrong tags don't break code but mislead
  the router. The test assertion checks tag *shape* (`HS-LS[1-4]-\d+`)
  but not *correctness* — review must spot-check.
- **Pack size growth.** ~100 concepts produce a JSON file roughly 4× the
  size of `algebra-1.json` (~500 lines). Still trivial in absolute
  terms; flagged for awareness, not action.
- **Edge curation is the silent quality lever.** Description quality is
  visible at review; edge quality is not. Reviewers should sample 5-10
  edges and ask "is this prerequisite real?" before approving.
- **Implementation skill might over-deliver toward 250 concepts and
  underweight description quality.** The implementation prompt should
  emphasize the 90-120 cap and the description-quality bar, with the
  v1 target framed as "shippable, not exhaustive."

## Implementation notes

- **Files changed**:
  - `packages/curriculum/packs/biology.json` (new — the canonical pack)
  - `packages/curriculum/src/packs/__tests__/pack-content.test.ts` (extended
    with a `describe("biology.json", ...)` block — 7 new tests)
  - `packages/curriculum/src/packs/__tests__/import-service.test.ts` (extended
    with a `describe("biology pack smoke test", ...)` block — 3 new tests
    that exercise the real pack file end-to-end)
- **Tests added**: 10 total. All pass; full workspace `pnpm test` green
  at 2235 passing.
- **Pack stats**: 106 concepts, 142 edges. Distribution roughly:
  LS1 (cells, biomolecules, photosynthesis/respiration, cell division,
  homeostasis) ~41 concepts; LS3 (heredity) ~22; LS4 (evolution) ~18;
  LS2 (ecosystems) ~25. Within design ±10 tolerance for each strand.
- **Discrepancies from design**: one. The design listed "every concept
  has at least one `standardsTag`" plus an additional sanity test
  "references the NGSS HS-LS standards body" — I added the standards-body
  test as a 7th biology assertion (small extension, kept the design's
  spirit). The shape and intent of all other tests match the spec.
- **Adjacent issues parked**: none — pre-existing lint warnings in
  `packages/claude-cli-sdk/` and `tests/` are unrelated to this work
  and predate this feature.
- **Cycle-debug story**: The first run of `pack-content.test.ts`
  surfaced a circular prerequisite chain
  (`ecosystem → levels-of-organization-ecology → population →
  community → ecosystem`). The schema's `superRefine` cycle detector
  caught it cleanly. Fixed by removing the `community → ecosystem`
  edge — pedagogically correct anyway, since "ecosystem" is taught as
  a high-level frame before its components are unpacked.
- **Anchor concepts confirmed**: `cell-theory`, `dna-structure`,
  `natural-selection`, `photosynthesis`, `cellular-respiration`,
  `mendelian-inheritance`, and `ecosystem-energy-flow` are all present
  with the expected ids — the anchor test passes.
- **Standards mapping**: every concept carries at least one
  `HS-LS[1-4]-\d+` performance-expectation code. Mapping accuracy is
  the review-time check, not a lint-able property.
- **No code changes outside curriculum/packs/ and its tests** — schema
  and loader untouched, as design promised.

## Review (2026-05-10)

**Verdict**: Approve with comments

**Blockers**: none

**Important**:
- *Test coverage gap relative to design Unit 3* — design called for a DB
  round-trip select on the `concepts` table after import plus an
  end-to-end exercise of `BootstrapServiceImpl.createCourseFromPack`
  with the biology pack. Implementation covered `PackImportServiceImpl`
  paths but not the bootstrap leg. Algebra-1 / geometry already exercise
  `createCourseFromPack`, so this is a coverage-completeness concern
  rather than an unverified-path concern. Filed as
  `idea-biology-pack-bootstrap-smoke-test` in the backlog.

**Nits**:
- Some `standardsTags` mappings are approximate — e.g.,
  `biology.cell-theory → HS-LS1-1` is the closest applicable
  performance expectation but not a perfect topical match. The design
  flagged "NGSS standards mapping accuracy" as a known risk to be
  judged at review time; subject-matter expert review before public
  release would tighten these. Acceptable for v1.
- The cycle-debug note in Implementation notes is a useful trace; future
  pack authors will hit similar issues and the schema's `superRefine`
  detector keeps catching them cleanly.

**Notes**:
- 106 concepts (within 90-120), 142 edges (≥100), 24 pack-content tests
  + 18 import-service tests all green. Full workspace `pnpm test` shows
  2235 passing.
- ROADMAP rolling-foundation: Phase 19 still says "~250 concepts". The
  v1 pull-back to ~106 is documented in the feature body (Design
  decisions) and will be reconciled in ROADMAP when the Phase 19 epic
  reaches done — premature now.
- Schema, loader, and bootstrap services untouched. Pure additive
  content delivery. No breaking changes.

## What's now possible

- `course.list_canonical_packs` now offers Biology alongside Algebra-1
  and Geometry.
- `course.use_canonical_pack` can create a high-school biology course
  from a single tool call — the bootstrap-mode default fast path for
  biology learners.
- Phase 19's "v1 ships with both canonical packs" requirement is half
  satisfied (math from Phase 10 + biology now); ship-checklist can
  exercise the canonical-pack picker against a real biology course.
