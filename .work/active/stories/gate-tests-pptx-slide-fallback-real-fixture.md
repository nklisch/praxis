---
id: gate-tests-pptx-slide-fallback-real-fixture
kind: story
stage: implementing
tags: [testing]
parent: null
depends_on: []
release_binding: null
gate_origin: tests
created: 2026-05-12
updated: 2026-05-17
---

# `tryChunkBySlide` fallback to `ast.toText()` is mock-only — no real-fixture coverage

## Priority
Low

## Spec reference
Item: `feature-powerpoint-ingestion-text-extraction` (Risks: "AST shape for slide boundaries is unverified... if no clean slide signal exists, fall back to `ast.toText()` + `chunkMarkdown`.")
Acceptance criterion: Existing unit test covers fallback with a mock AST. No real-fixture or integration test exists for a PPTX that lacks the slide-number signal.

## Gap type
adversarial-spec-silent / real-fixture coverage gap

## Suggested test
Either commit a second fixture PPTX exported by a non-officeparser-tested tool that exercises the fallback, OR document that the fallback is mock-only by intention. Current mock-only path won't catch real AST-shape regressions.

## Test location (suggested)
`packages/tools/src/runtime/ingestion/__tests__/pptx-ingestor-integration.test.ts`
