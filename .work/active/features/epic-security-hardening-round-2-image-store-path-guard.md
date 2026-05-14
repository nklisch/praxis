---
id: epic-security-hardening-round-2-image-store-path-guard
kind: feature
stage: done
tags: [security]
parent: epic-security-hardening-round-2
depends_on: []
release_binding: v0.1.2
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

## Design decisions (2026-05-14)

- **Failure mode**: throw. Both `dirFor` and `pathFor` are synchronous
  helpers used inside `save`/`read`/`deleteByDocumentId` paths that
  already throw on fs errors. Returning a `Result` would add a new error
  channel for callers (PptxIngestor, DocxIngestor, VisionPdfIngestor,
  DocumentsServiceImpl) to thread through — throw stays consistent with
  the existing `Error(...)` style at the FS boundary.
- **Guard placement**: shared module `packages/core/src/ingestion/document-id-guard.ts`
  (not inlined in each store) so the rules stay single-source. Both
  `FsEmbeddedImageStore` and `FsPageImageStore` import and call
  `assertSafeDocumentId(documentId)` from `dirFor`, `read`, and
  `deleteByDocumentId` (validate before the try/catch in `read` so
  traversal attempts surface as errors rather than silent `null`).
- **Rejection rules**: forward slash `/`, backslash `\`, parent-dir
  `..`, null byte `\0`, tilde prefix `~`, Windows drive-letter prefix
  `[A-Z]:`. UUIDv7 and `_pending_<uuid>` (the two first-party id shapes
  the ingestion pipeline produces) pass through.
- **No child stories**: single-stride implementation, tight cohesion
  (every test exercises the same guard function across two stores),
  natural decomposition would only be "embedded vs page" which is just
  the two store classes. Stories would be pure overhead.

## Architectural choice

**Shared guard module + call at FS-boundary.** Alternatives considered:

1. **Inline regex in each `dirFor`** — rejected. Duplicates the rule set
   in two files; future divergence is a security regression.
2. **Brand-typed `DocumentId`** — rejected. Would require typing
   propagation through the ingestion pipeline, IPC contracts, and
   service layer; pays for itself only if untrusted ids start flowing
   in. Today every id source is controlled. Defense-in-depth doesn't
   need a type system change.
3. **`Result<string, "invalid-doc-id">`** — rejected. Adds an error
   channel callers must thread through, with no functional gain over
   throw (callers already wrap fs ops in try/catch).
4. **Shared guard + throw** — chosen. One module, one assertion, called
   from every store method that path-joins a documentId. The cost is one
   regex test per call (microseconds); the benefit is uniform enforcement
   at the trust boundary that any future caller (including ones not yet
   written) crosses.

## Implementation Units

### Unit 1: Shared guard module
**File**: `packages/core/src/ingestion/document-id-guard.ts`

```typescript
/**
 * Validates that a documentId cannot be used for filesystem path traversal.
 * Throws Error("Invalid documentId: ...") on rejection.
 */
export function assertSafeDocumentId(documentId: string): void;
```

**Implementation Notes**:
- Single function, exported from the module file directly (no class).
- Rule set: contains `/`, `\`, `..`, `\0`, OR starts with `~`, OR matches
  `/^[A-Za-z]:/`.
- Error message includes the offending id literal (helpful for
  debugging; the id is by definition not a secret since the guard fires
  before it touches the filesystem).

**Acceptance Criteria**:
- [x] Function exists at the documented path and exports `assertSafeDocumentId`.
- [x] All six rejection rules fire with `Error(/Invalid documentId/)`.
- [x] UUIDv7 and `_pending_<uuid>` ids pass without throwing.

### Unit 2: Wire guard into FsEmbeddedImageStore
**File**: `packages/core/src/ingestion/embedded-images.ts`

```typescript
import { assertSafeDocumentId } from "./document-id-guard.js";

dirFor(input: { documentId: string }): string {
  assertSafeDocumentId(input.documentId);
  return join(this.baseDir, input.documentId);
}

async read(input: { documentId: string; imageName: string }): Promise<Buffer | null> {
  assertSafeDocumentId(input.documentId); // before try/catch — traversal must surface
  try { return await readFile(this.pathFor(input)); } catch { return null; }
}

async deleteByDocumentId(documentId: string): Promise<void> {
  assertSafeDocumentId(documentId);
  await rm(join(this.baseDir, documentId), { recursive: true, force: true });
}
```

**Implementation Notes**:
- `pathFor` delegates to `dirFor`, so no separate guard call needed there.
- `save` goes through `pathFor` → `dirFor` → guard, so it's covered.
- The pre-try-catch placement in `read` is load-bearing: without it the
  bare `catch {}` would swallow `Invalid documentId` and return `null`,
  hiding the security event.

**Acceptance Criteria**:
- [x] `dirFor`, `read`, `deleteByDocumentId` all call `assertSafeDocumentId`.
- [x] `pathFor` inherits the guard via `dirFor`.

### Unit 3: Wire guard into FsPageImageStore
**File**: `packages/core/src/ingestion/page-images.ts`

Same pattern as Unit 2 — `dirFor`, `read` (before try/catch), and
`deleteByDocumentId` all call `assertSafeDocumentId`.

**Acceptance Criteria**:
- [x] Mirror of Unit 2 applied to `FsPageImageStore`.

## Implementation Order

1. Unit 1 (guard module) — no deps.
2. Unit 2 + Unit 3 (wire into both stores) — depend on Unit 1; parallelizable.
3. Tests for both stores (added alongside unit work).

## Testing

### Unit tests
- **`packages/core/src/ingestion/__tests__/embedded-images.test.ts`** —
  `describe("FsEmbeddedImageStore — documentId path-traversal guard")`
  with 9 cases: forward-slash, backslash, `..`, null byte, tilde prefix,
  Windows drive letter, traversal in `deleteByDocumentId`, UUIDv7 allow,
  `_pending_<uuid>` allow.
- **`packages/core/src/__tests__/page-images.test.ts`** — identical
  `describe` block mirroring all 9 cases for `FsPageImageStore`.
- Existing save/read/delete tests continue to pass with the guard in
  place (UUIDv7-shape and `_pending_` ids are unaffected).

### Integration points
- PPTX/DOCX ingestors call `store.save(...)` with synthetic
  `_pending_<uuid>` ids — those ids match the allowlist, no integration
  test change needed.
- `DocumentsServiceImpl` has its own service-layer guard call (added in
  the same security pass) — separate test file.

## Risks

- **Synthetic `_pending_` ids must remain guard-safe**. If a future
  ingestor changes the prefix to contain `/` or `..` the guard will
  reject. Mitigation: the synthetic-id construction is `\`_pending_${randomUUID()}\``
  in two places (pptx-ingestor, docx-ingestor) — `randomUUID()` produces
  hex+dashes only. Guard tests pin the allow-case explicitly.
- **`canonicalize` (path normalization) was not added**. The guard is a
  syntactic blocklist, not a `path.resolve` round-trip check. This is
  acceptable because the rule set is strict enough that no string
  passing the guard can decompose into a parent-escaping path under
  `join(baseDir, ...)`. Re-evaluate if symlinks under `baseDir` become
  a thing (they aren't today).

## Retroactive-capture note (2026-05-14)

This feature's scope was implemented ahead of feature-design by a
sibling security story — commit **`aeb3c59 implement:
gate-security-document-id-path-traversal`** (the original gate
finding's story-form). That commit added:

- `packages/core/src/ingestion/document-id-guard.ts` — shared
  `assertSafeDocumentId` helper with the six rejection rules.
- Guard wired into `FsEmbeddedImageStore.dirFor` / `read` /
  `deleteByDocumentId` (`packages/core/src/ingestion/embedded-images.ts:41-75`).
- Guard wired into `FsPageImageStore.dirFor` / `read` /
  `deleteByDocumentId` (`packages/core/src/ingestion/page-images.ts:36-65`).
- 9 guard tests in `embedded-images.test.ts`, 9 mirror tests in
  `page-images.test.ts`, plus parallel coverage in
  `documents-service.test.ts`.

Per `/agile-workflow:feature-design` guidance ("Retroactive capture of
already-done work… just land it under the feature; stories are pure
overhead"), this feature documents the realized design above and skips
straight to `stage: review` — no implement pass needed. The review
skill will verify acceptance criteria against the shipped code.

## Review (2026-05-14)

**Verdict**: Approve

**Blockers**: none
**Important**: none
**Nits**: none

**Notes**:
- Verified shipped code at `packages/core/src/ingestion/document-id-guard.ts`
  matches the documented design exactly — all six rejection rules
  (`/`, `\`, `..`, `\0`, `~` prefix, `[A-Z]:` prefix) present with
  `Error("Invalid documentId: ...")` throw.
- Verified guard wired into both `FsEmbeddedImageStore` and
  `FsPageImageStore` at `dirFor`, `read` (before try/catch — the
  load-bearing placement), and `deleteByDocumentId`. `pathFor`
  inherits the guard via `dirFor` delegation as designed.
- Test files exercise the guard: 9 traversal-guard cases each in
  `page-images.test.ts` and `embedded-images.test.ts` covering all
  six rejection rules + traversal-through-delete + UUIDv7 allow +
  `_pending_<uuid>` allow. Total: 46 tests pass (18 guard + 28
  pre-existing save/read/delete) in 157ms.
- Defense-in-depth posture is correctly scoped: today's id sources
  (`randomUUID()`, DB-issued UUIDv7) cannot produce traversal strings,
  but the guard now sits at the FS trust boundary for any future
  caller. Risks section's note on canonicalize-vs-blocklist trade-off
  is reasonable given current symlink-free baseDir layout.
- Parent epic `epic-security-hardening-round-2` has two sibling
  features still at `stage: implementing`, so no parent advancement
  triggered by this review.
