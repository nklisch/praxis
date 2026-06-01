---
id: bug-scan-pdf-page-keeps-old-image
kind: story
stage: review
tags: [bug, state]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-05-31
bug_origin: scan
bug_severity: medium
bug_domain: state
bug_location: packages/ui/src/components/document-viewer/pdf-renderer.tsx:55
---

# PDF page component keeps old image when its document changes

**Location**: `packages/ui/src/components/document-viewer/pdf-renderer.tsx:55` · **Severity**: medium · **Pattern**: ref gate captures old load state across prop changes

`fetchedRef` is never reset when `documentId` or `page` changes, so a reused `PdfPage` can skip fetching and keep showing the old blob URL. Key by document and page, or reset the fetch ref, blob URL, loading, and error state on prop change.

```ts
const fetchedRef = useRef(false);

useEffect(() => {
  if (!visible || fetchedRef.current) return;
  fetchedRef.current = true;
client.documents.pageImage({ documentId, page });
}, [client, documentId, page, visible]);
```

## Implementation notes

- Changed `packages/ui/src/components/document-viewer/pdf-renderer.tsx` to key page image state by `documentId:page`, reset fetch/image/error state on page identity changes, and render images only when the blob URL belongs to the current page.
- `PdfRenderer` now keys `PdfPage` instances by document plus page, so a changed document cannot reuse a page component with stale image state.
- Added regression coverage in `packages/ui/src/components/document-viewer/__tests__/pdf-renderer.test.tsx`.
