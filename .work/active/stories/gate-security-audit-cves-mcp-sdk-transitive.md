---
id: gate-security-audit-cves-mcp-sdk-transitive
kind: story
stage: drafting
tags: [security]
parent: null
depends_on: []
release_binding: v0.1.2
gate_origin: security
created: 2026-05-14
updated: 2026-05-14
---

# `pnpm audit` reports 2 high + 3 moderate + 1 low transitive vulnerabilities via `@modelcontextprotocol/sdk`

## Severity
Medium

## Domain
Dependencies & Supply Chain

## Location
`pnpm-lock.yaml` — transitive chain:
`packages/claude-cli-sdk → @modelcontextprotocol/sdk → {ajv→fast-uri, hono, express-rate-limit→ip-address}`

## Evidence
```
high     fast-uri  <=3.1.1   path traversal + host confusion (GHSA-q3j6-qgpj-74h6, GHSA-v39h-62p7-jpjc)
moderate hono      <4.12.18  CSS injection, Vary header cache leak, JWT NumericDate (GHSA-qp7p-654g-cw7p, GHSA-p77w-8qqv-26rm, GHSA-hm8q-7f3q-5f36)
moderate ip-address <=10.1.0 XSS in Address6 HTML-emitting methods (GHSA-v2v4-37r5-5v8g)
```

All advisories chain through `@modelcontextprotocol/sdk`, which the
Praxis tool-bridge spawns as the MCP worker. Practical exploitability
inside Praxis: the MCP server is local, stdio-only, never receives
untrusted HTTP traffic, and the renderer never reaches it directly —
the threat surface is genuinely small. The flagging matters because the
next release of the SDK is likely to bump these, and shipping with
surfaced high-severity transitive advisories invites scanner / SBOM noise
from downstream packagers.

## Remediation direction

Bump `@modelcontextprotocol/sdk` to a version whose transitive lockfile
resolves `fast-uri ≥ 3.1.2`, `hono ≥ 4.12.18`, `ip-address ≥ 10.1.1`. If
no SDK release covers them yet, pin the patched versions via
`pnpm.overrides` in the root `package.json` and document the override.
