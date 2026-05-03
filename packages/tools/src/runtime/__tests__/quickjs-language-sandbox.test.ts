import { describe, expect, it } from "vitest";
import { QuickJsLanguageSandbox } from "../quickjs-language-sandbox.js";

const sandbox = new QuickJsLanguageSandbox();

function run(code: string, overrides?: { timeoutMs?: number; memoryLimitMb?: number }) {
  return sandbox.run({
    code,
    timeoutMs: overrides?.timeoutMs ?? 5_000,
    memoryLimitMb: overrides?.memoryLimitMb ?? 128,
  });
}

describe("QuickJsLanguageSandbox", () => {
  it("hello world: console.log output", async () => {
    const r = await run('console.log("hi")');
    expect(r.stdout).toBe("hi\n");
    expect(r.stderr).toBe("");
    expect(r.exitCode).toBe(0);
    expect(r.timedOut).toBe(false);
  });

  it("console.log(2+2) produces '4\\n'", async () => {
    const r = await run("console.log(2+2)");
    expect(r.stdout).toBe("4\n");
    expect(r.exitCode).toBe(0);
  });

  it("code that throws: exitCode 1 and guestError contains message", async () => {
    const r = await run('throw new Error("boom")');
    expect(r.exitCode).toBe(1);
    expect(r.timedOut).toBe(false);
    expect(r.guestError).toBeDefined();
    expect(r.guestError).toContain("boom");
  });

  it("infinite loop with short timeout: timedOut: true, exitCode: null", async () => {
    const r = await run("while(true){}", { timeoutMs: 100 });
    expect(r.timedOut).toBe(true);
    expect(r.exitCode).toBeNull();
  }, 5_000);

  it("no require in guest — throws a guest error", async () => {
    const r = await run('require("fs")');
    // require is not defined in the QuickJS global scope
    expect(r.exitCode).toBe(1);
    expect(r.guestError).toBeDefined();
  });

  it("no process in guest — throws a guest error", async () => {
    const r = await run("process.exit(0)");
    expect(r.exitCode).toBe(1);
    expect(r.guestError).toBeDefined();
  });

  it("console.error lands in stderr, not stdout", async () => {
    const r = await run('console.error("e")');
    expect(r.stderr).toContain("e");
    expect(r.stdout).toBe("");
  });

  it("console.warn lands in stdout", async () => {
    const r = await run('console.warn("w")');
    expect(r.stdout).toContain("w");
    expect(r.stderr).toBe("");
  });

  it("output truncation: large output sets truncated.stdout: true and keeps stdout ≤ 1MB", async () => {
    // 200k iterations of "x\n" = ~400KB if 2 bytes each; use longer string to exceed 1MB
    const r = await run(`for (let i = 0; i < 200000; i++) console.log("xxxxxxxxxxxxxxxx")`, {
      timeoutMs: 30_000,
    });
    expect(r.truncated.stdout).toBe(true);
    // Total stdout bytes must be ≤ 1MB (1_000_000 bytes)
    expect(Buffer.byteLength(r.stdout, "utf8")).toBeLessThanOrEqual(1_000_000);
  }, 30_000);

  it("returns truncated: { stdout: false, stderr: false } for normal output", async () => {
    const r = await run('console.log("hello")');
    expect(r.truncated).toEqual({ stdout: false, stderr: false });
  });

  it("durationMs is a positive number", async () => {
    const r = await run("1+1");
    expect(r.durationMs).toBeGreaterThan(0);
  });

  it("disposal: 10 sequential run() calls don't crash", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await run(`console.log(${i})`);
      expect(r.exitCode).toBe(0);
    }
  });
});
