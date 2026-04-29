import { describe, expect, it } from "vitest";

// Real Pyodide integration tests — only runs when PRAXIS_RUN_SLOW_TESTS=1
const runSlowTests = process.env.PRAXIS_RUN_SLOW_TESTS === "1";

describe.skipIf(!runSlowTests)(
  "PyodideSymPyService (integration — real Pyodide)",
  { timeout: 120_000 },
  () => {
    // We dynamically import to avoid loading pyodide in the fast test lane
    it("checkSolution: 2*x + 5 = 11 with x=3 is correct", async () => {
      const { PyodideHost } = await import("../../runtime/pyodide-host.js");
      const { PyodideSymPyService } = await import("../sympy-service.js");
      const host = new PyodideHost({ packages: ["sympy"] });
      const svc = new PyodideSymPyService(host);

      const result = await svc.checkSolution({
        equation: "2*x + 5 = 11",
        variable: "x",
        proposedValue: "3",
      });
      expect(result.correct).toBe(true);
      expect(result.proposedValue).toBe("3");
      expect(result.expectedSolutions).toContain("3");
    });

    it("checkSolution: 2*x + 5 = 11 with x=4 is incorrect", async () => {
      const { PyodideHost } = await import("../../runtime/pyodide-host.js");
      const { PyodideSymPyService } = await import("../sympy-service.js");
      const host = new PyodideHost({ packages: ["sympy"] });
      const svc = new PyodideSymPyService(host);

      const result = await svc.checkSolution({
        equation: "2*x + 5 = 11",
        variable: "x",
        proposedValue: "4",
      });
      expect(result.correct).toBe(false);
      expect(result.expectedSolutions).toContain("3");
    });

    it("solveEquation: x**2 - 4 = 0 has solutions -2 and 2", async () => {
      const { PyodideHost } = await import("../../runtime/pyodide-host.js");
      const { PyodideSymPyService } = await import("../sympy-service.js");
      const host = new PyodideHost({ packages: ["sympy"] });
      const svc = new PyodideSymPyService(host);

      const result = await svc.solveEquation({
        equation: "x**2 - 4 = 0",
        variable: "x",
      });
      expect(result.solutions).toHaveLength(2);
      expect(result.solutions).toContain("2");
      expect(result.solutions).toContain("-2");
    });

    it("simplify: (x+1)**2 - x**2 - 1 simplifies to 2*x", async () => {
      const { PyodideHost } = await import("../../runtime/pyodide-host.js");
      const { PyodideSymPyService } = await import("../sympy-service.js");
      const host = new PyodideHost({ packages: ["sympy"] });
      const svc = new PyodideSymPyService(host);

      const result = await svc.simplify({ expression: "(x+1)**2 - x**2 - 1" });
      expect(result.simplified).toBe("2*x");
    });

    it("checkEquivalent: (x+1)**2 is equivalent to x**2 + 2*x + 1", async () => {
      const { PyodideHost } = await import("../../runtime/pyodide-host.js");
      const { PyodideSymPyService } = await import("../sympy-service.js");
      const host = new PyodideHost({ packages: ["sympy"] });
      const svc = new PyodideSymPyService(host);

      const result = await svc.checkEquivalent({
        expression1: "(x+1)**2",
        expression2: "x**2 + 2*x + 1",
      });
      expect(result.equivalent).toBe(true);
      expect(result.difference).toBe("0");
    });

    it("bad input returns needsHumanReview: true and no throw", async () => {
      const { PyodideHost } = await import("../../runtime/pyodide-host.js");
      const { PyodideSymPyService } = await import("../sympy-service.js");
      const host = new PyodideHost({ packages: ["sympy"] });
      const svc = new PyodideSymPyService(host);

      const result = await svc.checkSolution({
        equation: "garbage!!!",
        variable: "x",
        proposedValue: "1",
      });
      expect(result.needsHumanReview).toBe(true);
      expect(result.parseError).toBeDefined();
      expect(result.correct).toBe(false);
    });
  },
);

// Fast unit test — just verifies the class is importable and constructable
describe("PyodideSymPyService (unit)", () => {
  it("is importable without loading pyodide", async () => {
    // This import will succeed even without pyodide installed
    // because we only import the class, not load it
    const module = await import("../sympy-service.js");
    expect(module.PyodideSymPyService).toBeDefined();
  });
});
