# Pattern: Slow-Test Gating

Integration tests that spin up expensive runtimes (Pyodide) are gated behind `process.env.PRAXIS_RUN_SLOW_TESTS === "1"` using Vitest's `describe.skipIf`. The fast CI lane skips them; the slow lane runs all.

## Rationale

Pyodide takes 3-5 seconds to cold-load. Running real sympy operations takes additional time. These tests verify that the Python runtime works correctly with sympy — valuable but not needed on every commit. The flag lets developers opt in explicitly.

## Examples

### Example 1: `pyodide-host.test.ts` — gating the whole describe block
**File**: `packages/tools/src/runtime/__tests__/pyodide-host.test.ts`
```typescript
const runSlowTests = process.env.PRAXIS_RUN_SLOW_TESTS === "1";

vi.mock("pyodide", () => ({ loadPyodide: vi.fn() /* ... */ }));  // fast mock for skipped tests

describe("PyodideHost (unit — mocked pyodide)", () => {
  // ... fast unit tests (always run) using the mocked loadPyodide
});

describe.skipIf(!runSlowTests)(
  "PyodideHost (integration — real Pyodide)",
  { timeout: 120_000 },  // generous timeout for cold load
  () => {
    it("loads and returns an interpreter", async () => {
      const host = new PyodideHost({ packages: ["sympy"] });
      const py = await host.get();
      expect(py).toBeDefined();
    });
  },
);
```

### Example 2: `sympy-service.test.ts` — same gate, different describe
**File**: `packages/tools/src/math/__tests__/sympy-service.test.ts`
```typescript
const runSlowTests = process.env.PRAXIS_RUN_SLOW_TESTS === "1";

describe.skipIf(!runSlowTests)(
  "PyodideSymPyService (integration — real Pyodide)",
  { timeout: 120_000 },
  () => {
    let service: PyodideSymPyService;
    beforeAll(async () => {
      const host = new PyodideHost({ packages: ["sympy"] });
      service = new PyodideSymPyService(host);
      await host.preload();  // warm up once for all tests in the block
    });

    it("checkSolution: 2x+5=11, x=3 → correct", async () => {
      const r = await service.checkSolution({ equation: "2*x + 5 = 11", variable: "x", proposedValue: "3" });
      expect(r.correct).toBe(true);
    });
  },
);
```

## When to Use

- Any integration test that requires Pyodide, a real Codex CLI, a real Claude Code CLI, or any other expensive external runtime
- Fast unit tests should mock the runtime (e.g., `vi.mock("pyodide", ...)`) — they don't need gating

## When NOT to Use

- Don't gate tests that only take <1s — only tests with genuinely expensive setup need gating
- Don't gate tests that mock the expensive part — mock-based tests should always run

## Running slow tests

```bash
# Run fast tests only (normal CI):
pnpm test

# Run fast + slow tests:
PRAXIS_RUN_SLOW_TESTS=1 pnpm test

# Run only the slow tests for a specific package:
PRAXIS_RUN_SLOW_TESTS=1 pnpm --filter @praxis/tools test
```

## Common Violations

- Placing real Pyodide calls in the fast describe block — any call that imports a live host without mocking will slow the test suite for everyone; always mock in the fast block
- Missing `timeout: 120_000` on slow describe — Vitest's default 5s timeout will fire before Pyodide loads; always set a generous timeout on slow blocks
