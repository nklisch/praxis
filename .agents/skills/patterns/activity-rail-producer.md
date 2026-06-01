# Pattern: Activity Rail Producer

Long-running services inject `ActivityRegistry` via `ServiceDeps.activity`; producers call `ctx.activity?.start({ label, metadata? })` → hold `ActivityHandle` → call `handle.update(patch)` / `handle.finish("done"|"failed")`; items surface in `<StatusStrip>` after their `quietPeriodMs` threshold (default 800ms for indexers). Never create a blocking modal for background work — use the strip instead.

Imported from the legacy Claude rules index. The fuller related reference was previously listed as `service-deps-injection.md`.

<!-- agile-workflow:provenance src-sha256=06a6febf8829223040d3b7a977f786f778da2278dd9bcf638bf23c7304e3b7d3 -->
