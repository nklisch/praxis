---
id: idea-consolidate-debug-replay-helper-with-core-loader
created: 2026-06-01
tags: [tests]
---

The failure-replay helper in `tests/helpers/replay-runner.ts` intentionally duplicates the production debug bundle loader and DB snapshot restore path so the CLI/test helper can run without hitting stale project-reference `dist/` artifacts. Once the package export/build constraint is solved, consolidate the helper back onto the production loader/restore code so bundle validation, path normalization, and snapshot schema behavior have one source of truth.
