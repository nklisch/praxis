---
id: gate-docs-shared-test-fakes-rename-document-scopes
kind: story
stage: review
tags: [documentation]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: docs
created: 2026-05-14
updated: 2026-05-14
---

# `shared-test-fake-factories` pattern (and patterns index) name `noopCourseDocuments` but the factory is `noopDocumentScopes`

## Drift category
pattern-skill-staleness

## Location
- Doc: `.claude/skills/patterns/shared-test-fake-factories.md:3,50`
- Doc: `.claude/rules/patterns.md:44`
- Code: `tests/helpers/mocks.ts:76`

## Current doc text
- skill line 3: > `tests/helpers/mocks.ts` holds factory functions — `inMemorySecretStorage()`, `noopLogger()`, `noopLockService()`, `noopCourseDocuments()`, `recordingLogger()` — each returning a port interface satisfied with no-op or in-memory behavior.
- skill line 50: > `export function noopCourseDocuments(): CourseDocumentsService { /* … */ }`
- index line 44: > `Port test doubles live as factory functions in tests/helpers/mocks.ts (noopLogger, noopLockService, inMemorySecretStorage, unavailableSecretStorage, noopCourseDocuments, recordingLogger)`

## Reality
`tests/helpers/mocks.ts:76` exports
`noopDocumentScopes(): DocumentScopesService`. `CourseDocumentsService`
no longer exists as a port.

## Required edit
In both files, replace `noopCourseDocuments` → `noopDocumentScopes`
and update the example signature to
`noopDocumentScopes(): DocumentScopesService`.

## Implementation

- `.claude/rules/patterns.md` line 47: already read `noopDocumentScopes` — no edit needed.
- `.claude/skills/patterns/shared-test-fake-factories.md` line 3: replaced `noopCourseDocuments()` with `noopDocumentScopes()` in the factory enumeration.
- `.claude/skills/patterns/shared-test-fake-factories.md` line 50: replaced `export function noopCourseDocuments(): CourseDocumentsService` with `export function noopDocumentScopes(): DocumentScopesService` in the example snippet.
- Verified against `tests/helpers/mocks.ts:76`: export is `noopDocumentScopes(): import("@praxis/core/types").DocumentScopesService`.
