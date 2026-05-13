---
id: epic-document-library-multi-file-folder-picker
kind: feature
stage: drafting
tags: [ui, ingestion, configure]
parent: epic-document-library
depends_on: []
release_binding: null
gate_origin: null
created: 2026-05-13
updated: 2026-05-13
---

# Multi-file and folder document picker

## Brief

Today the file picker invoked from the document attach button opens a
single-file dialog: `dialog.showOpenDialog` is called with `properties:
["openFile"]` at `packages/desktop/electron/main/ingest-channel.ts:34`. The
`IngestionService.ingest()` signature
(`packages/core/src/ingestion/service.ts:65`) takes a single
`IngestionRequest`. Attaching a folder of materials means clicking the
button N times.

This feature extends the picker and the ingestion orchestration to support
multi-file selection (`multiSelections` property) and folder selection
(`openDirectory` property; recursive walk with MIME-type filtering against
the registered ingestors in `packages/tools/src/runtime/ingestion/registry.ts`).
Multiple ingestions stream progress to the `ActivityRail` as separate
items so the user can see per-file state. The state machine in the
`useIngestion` hook (`packages/ui/src/hooks/use-ingestion.ts`) handles the
multi-file lifecycle.

This feature is **independent of the scoping primitive** — it lands in
parallel with `document-scopes-primitive`. Once both ship, the attach flow
naturally writes scope rows for whichever scope the UI hands in.

## Epic context

- Parent epic: `epic-document-library`
- Position in epic: independent UX improvement; wave 1 alongside
  `document-scopes-primitive` and `rename-retrieve-from-documents`.

## Foundation references

- `docs/ARCHITECTURE.md` — "Ingestion pipeline" section names the
  `Ingestor` port and per-format adapters; this feature doesn't change the
  port, only the entry orchestration above it.

## Anchors

- Electron picker handler — `packages/desktop/electron/main/ingest-channel.ts:33-47`
  (current `properties: ["openFile"]`)
- Ingestion entry — `packages/core/src/ingestion/service.ts:65`
  (`ingest(req, signal?)` — single-file)
- Adapter registry — `packages/tools/src/runtime/ingestion/registry.ts`
- Per-format adapters — `packages/tools/src/runtime/ingestion/*.ts`
- UI hook — `packages/ui/src/hooks/use-ingestion.ts`
- Add button — `packages/ui/src/components/add-document-button.tsx:13-42`
- ActivityRegistry integration — `packages/core/src/ingestion/service.ts:7,35,68`

## Design notes for feature-design

- Folder walk: depth cap, symlink policy, hidden-file filter, MIME-type
  filter against supported ingestors.
- ActivityRail: one item per file, or one batch item with N children?
  Today `ActivityRegistry` supports both shapes — pick one and stay
  consistent.
- Cancellation: cancel a single file vs. cancel the whole batch.
- Failure: partial-success expected — one file fails, others succeed.
  Report per-file outcome.
