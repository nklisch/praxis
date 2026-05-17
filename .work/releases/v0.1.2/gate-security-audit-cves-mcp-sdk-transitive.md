---
id: gate-security-audit-cves-mcp-sdk-transitive
kind: story
stage: done
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

## Implementation

**Approach**: `pnpm.overrides` in root `package.json` (SDK bump not viable).

`@modelcontextprotocol/sdk` was already at the latest version (`^1.29.0`). Checked `1.29.0` transitive deps: it still declares `hono: ^4.11.4` and `ajv: ^8.17.1` (with `fast-uri: ^3.0.1`), so no SDK release resolves the chain yet.

Added three overrides to `pnpm.overrides` in `/package.json`:
- `"fast-uri": ">=3.1.2"` — resolves GHSA-q3j6-qgpj-74h6 + GHSA-v39h-62p7-jpjc (high)
- `"hono": ">=4.12.18"` — resolves GHSA-qp7p-654g-cw7p + GHSA-p77w-8qqv-26rm + GHSA-hm8q-7f3q-5f36 (moderate + low)
- `"ip-address": ">=10.1.1"` — resolves GHSA-v2v4-37r5-5v8g (moderate)

Lockfile resolved to: `fast-uri@3.1.2`, `hono@4.12.18`, `ip-address@10.2.0`.

**Verification**:
- `pnpm audit` after: 1 remaining advisory (`esbuild` via `drizzle-kit`, unrelated to this story — out of scope).
- `pnpm typecheck`: passes (no API breakage from bumped transitive deps).
- `pnpm --filter @praxis/claude-cli-sdk test`: 51 tests pass; 1 pre-existing WIP failure (`tool-server-auth.test.ts` "no frame within auth timeout window") from an in-progress envelope-migration feature's new test case — not caused by these changes.
- `pnpm install`: succeeded.

## Review

**Verdict: approved.**

Reviewed commit `950c02f`.

**Correctness**: `pnpm audit` now reports exactly 1 advisory (`esbuild` via `drizzle-kit`), which is explicitly out of scope per the story. All three target chains are resolved. Lockfile confirms single resolutions: `fast-uri@3.1.2`, `hono@4.12.18`, `ip-address@10.2.0` — matching the pinned ranges. The `pnpm.overrides` block in `package.json` uses `>=` semver ranges (not exact pins), which is the right posture — future SDK releases that naturally satisfy the ranges will inherit them without friction.

**Behavior preservation**: `pnpm --filter @praxis/claude-cli-sdk typecheck` passes clean. All 52 tests pass (the previously-noted WIP failure for `tool-server-auth.test.ts` has since resolved — no regressions from the bumped transitive deps). The bumped packages are deep transitive consumers of `@modelcontextprotocol/sdk` internals; none surface APIs to Praxis first-party code.

**Foundation**: `pnpm.overrides` is the correct mechanism for this pattern. The story notes that when `@modelcontextprotocol/sdk` next bumps these deps, the overrides become a no-op and can be removed — that is a follow-up, not a concern here.

No blockers. Stage advanced to done.
