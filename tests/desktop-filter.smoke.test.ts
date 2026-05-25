/**
 * Smoke test: `pnpm --filter @praxis/desktop test` exits 0.
 *
 * Story: gate-tests-vitest-filter-desktop-ci-smoke
 *
 * Acceptance criterion:
 *   `pnpm --filter @praxis/desktop test` exits 0 (or with real test
 *   failures only, not a missing-dir error).
 *
 * Gap: infrastructure-config fix — a future workspace-config tweak that
 * re-breaks the per-package filter would not be caught by the workspace-wide
 * `pnpm test`. This test runs via `pnpm test` (workspace root) so it catches
 * the filter-level failure in CI even when the individual package tests pass.
 *
 * Implementation note: we run the filter command as a child process and assert
 * exit code 0. A vitest `--run` flag is added so the child never enters watch
 * mode. Timeout is generous (60 s) to allow for module resolution + test
 * execution in a cold environment.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(import.meta.dirname, "..");

describe("desktop vitest filter smoke", () => {
  it("pnpm --filter @praxis/desktop test --run exits 0", () => {
    // Run the per-package filter command synchronously and capture output.
    // If it throws, execFileSync re-throws with the child's stderr — which is
    // exactly the failure signal we want (e.g. "No test files found" from a
    // misconfigured include path, or a test failure).
    let stdout = "";
    let stderr = "";
    try {
      stdout = execFileSync("pnpm", ["--filter", "@praxis/desktop", "test", "--run"], {
        cwd: REPO_ROOT,
        encoding: "utf-8",
        // 60 s wall-clock budget; desktop tests are unit-level so this is
        // generous, but keep it finite so CI isn't blocked on a hang.
        timeout: 60_000,
      });
    } catch (err) {
      // execFileSync throws on non-zero exit. Re-shape the error to include
      // the child output so the test failure message is actionable.
      const child = err as { stdout?: string; stderr?: string; message?: string };
      stderr = child.stderr ?? "";
      stdout = child.stdout ?? "";
      // Surface both streams in the assertion failure.
      throw new Error(
        `pnpm --filter @praxis/desktop test --run exited non-zero.\n` +
          `stdout:\n${stdout}\n` +
          `stderr:\n${stderr}`,
      );
    }

    // Basic sanity: the runner produced some output (i.e., it actually ran).
    expect(stdout.length + stderr.length).toBeGreaterThan(0);
  }, 90_000);
});
