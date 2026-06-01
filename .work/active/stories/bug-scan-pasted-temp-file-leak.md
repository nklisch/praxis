---
id: bug-scan-pasted-temp-file-leak
kind: story
stage: implementing
tags: [bug, resource-leak]
parent: epic-big-bug-squash
depends_on: []
release_binding: null
gate_origin: null
created: 2026-06-01
updated: 2026-06-01
bug_origin: scan
bug_severity: low
bug_domain: resource-leak
bug_location: packages/desktop/electron/main/ingest-channel.ts:163
---

# Pasted-text ingestion writes temp files without deleting them

**Location**: `packages/desktop/electron/main/ingest-channel.ts:163` · **Severity**: low · **Pattern**: temp file created and never unlinked

The paste flow stores user-provided text in the OS temp directory and returns the path for ingestion, but no owner deletes it afterward. Create an owned temp file or directory and remove it in a `finally` after ingestion succeeds or fails.

```ts
const safeFilename = payload.filename.replace(/[/\\?%*:|"<>]/g, "_");
const tmpPath = path.join(tmpdir(), safeFilename);
writeFileSync(tmpPath, payload.content, "utf8");
return tmpPath;
```
