---
id: feature-language-sandbox-registry
kind: feature
stage: done
tags: [refactor]
parent: null
depends_on: [feature-phase-4-verification-tools]
release_binding: v0
gate_origin: null
created: 2026-05-09
updated: 2026-05-09
---

# Language sandbox registry — QuickJS replaces isolated-vm

Retro-released into v0 on 2026-05-09. Original design: `docs/designs/language-sandbox-registry.md`.

**Goal that shipped:** Replace the broken `isolated-vm` JavaScript sandbox with `quickjs-emscripten` (WASM, no native binding) and reshape the surrounding code as a per-language registry so future coding-lesson languages plug in as adapters.

**Notes:** `LanguageSandbox` port + `CodeSandboxImpl` registry replacing `LocalCodeSandbox`. `QuickJsLanguageSandbox` adapter + retained `PyodideLanguageSandbox`. `code_sandbox` tool's input enum derived from registry's `availableLanguages` — single source of truth. Removed 8+ `vi.mock("isolated-vm", ...)` workarounds.
