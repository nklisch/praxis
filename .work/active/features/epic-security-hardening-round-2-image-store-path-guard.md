---
id: epic-security-hardening-round-2-image-store-path-guard
kind: feature
stage: drafting
tags: [security]
parent: epic-security-hardening-round-2
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-14
---

# Image-store path-traversal guard — defensive `dirFor` validation

## Brief

The embedded image store and the page image store both compute their
on-disk directory from a doc id passed by the ingestion pipeline. The
pipeline currently constructs synthetic ids (`_pending_<uuid>`) for
in-flight ingestions that haven't been bound to a stored Document row
yet. The `dirFor(docId)` helper does no validation on the input — it
just joins the doc id into a base path and writes there. If a doc id
ever contained `..` or an absolute-path component (today it can't
because all id sources are controlled, but the channel is open), the
store would happily write outside its intended root.

This feature adds a defensive guard inside the shared `dirFor` helpers
that rejects any doc id containing path-segment separators, `..`, or
absolute-path roots. The guard is defense-in-depth — no current caller
should ever produce such an id, but the cost is one regex check and the
benefit is that a future caller bug (or a tainted id flowing through an
untrusted boundary we don't have today) can't escalate to a path
traversal.

## Epic context

- Parent epic: `epic-security-hardening-round-2`
- Position in epic: smallest feature, fully independent. Touches only
  the two image-store helpers and their tests.

## Scope absorbed from backlog

- `gate-security-embedded-image-store-dirfor-guard` — defensive guard
  inside `FsEmbeddedImageStore.dirFor` / `FsPageImageStore.dirFor`
  against path traversal via the synthetic `_pending_<uuid>` doc id
  channel.

## Foundation references

- `docs/ARCHITECTURE.md` — ingestion pipeline section; embedded vs page
  image store boundaries.

## Anchors (current implementation)

- Shared embedded image store helper —
  `packages/core/src/ingestion/embedded-images.ts:40-44`
- PPTX ingestor (`FsPageImageStore` use) —
  `packages/tools/src/runtime/ingestion/pptx-ingestor.ts:96`
- DOCX ingestor (mirror of pptx pattern) —
  `packages/tools/src/runtime/ingestion/docx-ingestor.ts:94`
- Existing image-store tests —
  `packages/core/src/__tests__/embedded-images.test.ts` (or equivalent)

## Pre-design decisions (2026-05-14)

- **None surfaced at scope-ambiguity sweep.** This feature is small
  and bounded; feature-design picks the failure mode (throw vs.
  Result<unknown, "invalid-doc-id"> vs. assert-then-fallback) at
  design time based on which call-sites already handle errors.
