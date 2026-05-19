---
id: gate-cruft-bootstrap-explorer-stale-comment-sweep
kind: story
stage: done
tags: [cleanup]
parent: null
depends_on: []
release_binding: v0.1.3
gate_origin: cruft
created: 2026-05-18
updated: 2026-05-18
---

# Sweep stale `bootstrap` / `explorer` / "explore agent" references in JSDoc and copy

## Confidence
High

## Category
stale comment / residual-rename

## Location
~30 files across `packages/core`, `packages/curriculum`, `packages/tools`,
`packages/ui`, `packages/engines`, `packages/artifacts`, `packages/client`.

## Evidence
The bundle's `refactor-rename-bootstrap-and-explorer` family renamed the
`bootstrap` mode to `course-create` and the `explorer` agent (with its tool
`course.start_exploration`) to `drafter` (`course.start_drafting`). The
`cleanup-stale-explorer-comments-sweep` archived story did one pass but
missed `bootstrap`-flavored residue and a smaller `explorer` tail. ~109
occurrences remain in comments, JSDoc, log-key cross-reference comments,
test-helper docs, and one user-visible copy string.

Cluster (representative, not exhaustive):

- `packages/ui/src/lib/copy.ts:45` — user-visible string: "Run a bootstrap session to populate the course with concepts." → must be `course-create`-flavored copy.
- `packages/core/src/services/course-create-service.ts:116` — comment claims it pairs with `bootstrap.drafts.forward` IPC log; actual log key is `course-create.drafts.forward` (`desktop/electron/main/course-create-drafts-channel.ts:38`). Cross-reference is broken.
- `packages/engines/src/__tests__/claude-code.test.ts:162-165` — "bootstrap explorer reads large textbook bundles ..."
- `packages/tools/src/course/__tests__/start-drafting.test.ts:9-10,67,95,184,243` — five `explorer` references in test docstrings.
- `packages/tools/src/course/list-library-documents.ts:16-19,39-40` — JSDoc says "bootstrap mode" / "bootstrap session"; tool's `.description` correctly says `course-create`.
- `packages/core/src/services/types.ts:47, 94-97` — "Phase 6 adds artifacts, bootstrap, courseState" / "explore agent's tool-call budget".
- `packages/core/src/types/tool.ts:93, 160-164` — "Phase 16 (bootstrap-session-scoped-attachment)" / "user-tunable bootstrap config" / "explore agent's tool-call budget" / "bootstrap path".
- `packages/core/src/types/tabs.ts:21` — "absent for teach / bootstrap".
- `packages/core/src/types/client.ts:59-61` — "Bootstrap-mode live draft stream ... explore agent ... bootstrap tab body".
- `packages/core/src/types/draft-stream.ts:6, 34` — "bootstrap service" / "bootstrap subscription".
- `packages/core/src/types/document-scopes.ts:8, 89` — "a specific bootstrap session" / "bootstrap-session-scoped-attachment".
- `packages/core/src/services/recommendation-service.ts:46` — "course bootstrapping".
- `packages/core/src/services/assignment-service.ts:367` — "bootstrap-mode grading omit it".
- `packages/core/src/services/session-service.ts:64` — "Bootstrap mode is intentionally NOT gated".
- `packages/core/src/services/session/engine-session-manager.ts:232, 363` — "Bootstrap / configure" / "Bootstrap budget resolver".
- `packages/core/src/services/course-create-service.ts:155, 517, 550-552` — multiple stale references.
- `packages/curriculum/src/course-create/drafter.ts:136, 261, 337, 434` — "bootstrap tab" / "bootstrap mode (no course in)" / "bootstrap service via the drafter's base context".
- `packages/curriculum/src/course-create/__tests__/helpers/scripted-engine.ts:5` — "the explorer's registry".
- `packages/curriculum/src/brief/in-course-behavior.ts:20` — "Bootstrap and configure modes".
- `packages/ui/src/components/draft-card.tsx:11, 15`.
- `packages/ui/src/components/onboarding-flow.tsx:307, 336-337`.
- `packages/ui/src/components/chat-tab-body.tsx:57, 509`.
- `packages/ui/src/components/course-create-tab-body.tsx:117` — "the bootstrap-drafts stream".
- `packages/ui/src/components/library/documents-section.tsx:188, 200, 208, 211, 230` — variable name `activeBootstrapSessionId` and surrounding comments. Variable rename is in-scope.
- `packages/ui/src/hooks/use-derived-scope.ts:13`.
- `packages/ui/src/hooks/use-drafts.ts:9, 17`.
- `packages/ui/src/router.tsx:180`.
- `packages/ui/src/routes/course-create.tsx:6, 16`.
- `packages/artifacts/src/schema.ts:17, 63, 268`.
- `packages/client/src/services/authoring-client.ts:35-36, 49, 62, 65` — rejection messages mention "use bootstrap mode" and a dead `bootstrap()` method name reference.

## Removal
One-pass sed/sd sweep through comments and string-literal copy:
- `bootstrap mode` → `course-create mode`
- `bootstrap session` → `course-create session`
- `bootstrap service` → `course-create service`
- `bootstrap tab` → `course-create tab`
- `bootstrap path` → `course-create path`
- `bootstrap subscription` / `bootstrap-drafts stream` → `course-create drafts stream`
- `explore agent` → `drafter`
- `explorer's registry` → `drafter's registry`
- `(the) explorer` → `(the) drafter` (case-aware)
- Rename local variable `activeBootstrapSessionId` → `activeCourseCreateSessionId` in `documents-section.tsx` and threaded callers.
- Fix the log-key cross-reference in `course-create-service.ts:116` from `bootstrap.drafts.forward` → `course-create.drafts.forward`.

**Leave intact (load-bearing identifiers — these are intentional rename
trade-offs and tracked as follow-ups, not cruft):**
- `services.bootstrap`
- `BootstrapOpts` type
- `kind: "bootstrapped"` discriminator value
- The `bootstrap` key inside `ServiceDeps.toolServices`

After the sweep, re-run `pnpm typecheck && pnpm lint && pnpm test` and grep
to confirm zero residual occurrences outside the load-bearing set.

The `curriculum/src/modes/fragments/__tests__/drafter-configurator-posture.test.ts`
file legitimately uses `explorer` in assertion strings (it enforces that the
word doesn't appear in user-visible copy) — LEAVE IT.

## Implementation notes (2026-05-18)

**Files touched: 53** (33 source, 20 test/fixture files)

Packages covered: `@praxis/artifacts`, `@praxis/claude-cli-sdk`, `@praxis/client`,
`@praxis/core` (services, types), `@praxis/curriculum` (modes, drafter, packs, brief),
`@praxis/engines`, `@praxis/tools`, `@praxis/ui` (components, hooks, routes, tests).

**Leave-intact identifiers confirmed present:**
- `services.bootstrap` field key on `ServiceDeps` / `Services` — preserved
- `BootstrapOpts` type — preserved
- `kind: "bootstrapped"` discriminator value — preserved
- `bootstrap` key in `ServiceDeps.toolServices` — preserved
- `bootstrapEngineResolver`, `bootstrapConfigResolver` — preserved
- Historical docs (`docs/designs/phase-16-bootstrap-explorer.md`) — not touched
- `drafter-configurator-posture.test.ts` — not touched

**Post-edit grep confirms zero stale references** outside the documented
exception list (`tests/helpers/`, `docs/designs/`, `drafter-configurator-posture.test.ts`,
load-bearing identifiers, `/dist/`).

**Tests:** No test failures. 425 test files passed (3 skipped due to
`PRAXIS_RUN_SLOW_TESTS` gate). No test assertions were asserting on the old copy
string — the renamed `copy.ts:concepts` field wasn't tested by literal value.

**Extra finds beyond the story's cluster:** 10 additional stale occurrences
found and fixed in files not listed in the cluster:
- `packages/curriculum/src/packs/import-service.ts` — bootstrap-mode auto-detect comment
- `packages/curriculum/src/packs/types.ts` — bootstrap-mode JSDoc in PackManifest
- `packages/core/src/services/__tests__/course-create-service.session-scope.test.ts` — test module docstring
- `packages/claude-cli-sdk/src/cli/__tests__/stream-timeout.test.ts` — "bootstrap explorer" in regression comment
- `packages/ui/src/__tests__/courses-route.test.tsx`, `resume-draft-picker.test.tsx`, `chat-route.test.tsx`, `tab-strip.test.tsx` — test description strings and tab title fixtures
- `packages/ui/src/components/sub-agent-panel.tsx` — "bootstrap budget" comment
- `packages/ui/src/routes/courses.tsx` — "bootstrap conversation" comment
- `packages/ui/src/routes/library.tsx:72` — inline JSDoc comment on `handleUsePack`

**Log-key cross-reference fixed:** `course-create-service.ts:116` now correctly
references `course-create.drafts.forward` instead of `bootstrap.drafts.forward`.

## Review (2026-05-18)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**: 53 files swept, all stale `bootstrap`/`explorer` references replaced. Spot-checked: copy.ts user-visible string fixed, documents-section.tsx variable renamed correctly, load-bearing identifiers (services.bootstrap, BootstrapOpts, kind:"bootstrapped", bootstrapEngineResolver) confirmed preserved. The drafter-configurator-posture.test.ts correctly left untouched. 425 test files passed.
