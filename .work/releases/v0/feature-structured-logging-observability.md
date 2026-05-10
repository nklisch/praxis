---
id: feature-structured-logging-observability
kind: feature
stage: done
tags: [cleanup]
parent: null
depends_on: [feature-phase-3-ui-shell]
release_binding: v0
gate_origin: null
created: 2026-05-09
updated: 2026-05-09
---

# Structured logging & observability

Retro-released into v0 on 2026-05-09. Original design: `docs/designs/structured-logging-observability.md`.

**Goal that shipped:** A `pino`-backed structured logger across main + renderer; one unified log stream; child-logger correlation (`sessionId`, `streamId`, `turnIndex`); JSONL file rotation under `userData/logs/`; redaction of secrets and prompt content; an IPC error-wrapping helper that ends silent-failure; migration of every bare `console.*` call site in non-script code.

**Notes:** Renderer `ErrorBoundary` + `LoggerProvider` + `useLogger()` hook follow the established context-hook-pair shape. Default log level is `debug` in dev (`isPackaged=false`).
