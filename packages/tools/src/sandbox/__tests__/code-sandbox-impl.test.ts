import type {
  LanguageSandbox,
  LanguageSandboxRunOptions,
  LanguageSandboxRunResult,
} from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { CodeSandboxImpl } from "../code-sandbox-impl.js";

// ── Fake adapters ─────────────────────────────────────────────────────────────

function makeAdapter(
  language: string,
  opts?: {
    supportsStdin?: boolean;
    result?: Partial<LanguageSandboxRunResult>;
  },
): LanguageSandbox & { runSpy: ReturnType<typeof vi.fn> } {
  const base: LanguageSandboxRunResult = {
    stdout: "ok\n",
    stderr: "",
    exitCode: 0,
    timedOut: false,
    durationMs: 5,
    truncated: { stdout: false, stderr: false },
    ...opts?.result,
  };
  const runSpy = vi.fn().mockResolvedValue(base);
  return {
    language,
    displayName: language,
    supportsStdin: opts?.supportsStdin ?? false,
    run: runSpy,
    runSpy,
  };
}

// ── Construction ──────────────────────────────────────────────────────────────

describe("CodeSandboxImpl construction", () => {
  it("constructs with an empty adapter set", () => {
    const s = new CodeSandboxImpl({ adapters: [] });
    expect(s.availableLanguages).toEqual([]);
  });

  it("throws on duplicate language", () => {
    expect(
      () =>
        new CodeSandboxImpl({
          adapters: [makeAdapter("javascript"), makeAdapter("javascript")],
        }),
    ).toThrow(/duplicate adapter for language "javascript"/);
  });

  it("availableLanguages is sorted", () => {
    const s = new CodeSandboxImpl({
      adapters: [makeAdapter("python"), makeAdapter("javascript")],
    });
    expect(s.availableLanguages).toEqual(["javascript", "python"]);
  });

  it("availableLanguages reflects the adapter set", () => {
    const s = new CodeSandboxImpl({
      adapters: [makeAdapter("ruby"), makeAdapter("lua"), makeAdapter("javascript")],
    });
    expect(s.availableLanguages).toEqual(["javascript", "lua", "ruby"]);
  });
});

// ── Dispatch ──────────────────────────────────────────────────────────────────

describe("CodeSandboxImpl dispatch", () => {
  it("routes to the correct adapter by language", async () => {
    const js = makeAdapter("javascript");
    const py = makeAdapter("python");
    const s = new CodeSandboxImpl({ adapters: [js, py] });

    await s.run({ language: "python", code: "print(1)" });
    expect(py.runSpy).toHaveBeenCalledOnce();
    expect(js.runSpy).not.toHaveBeenCalled();
  });

  it("throws with a helpful message for unknown language", async () => {
    const s = new CodeSandboxImpl({
      adapters: [makeAdapter("javascript"), makeAdapter("python")],
    });
    await expect(s.run({ language: "ruby", code: "puts 1" })).rejects.toThrow(
      /no adapter for language "ruby"/,
    );
  });

  it("error message lists available languages", async () => {
    const s = new CodeSandboxImpl({
      adapters: [makeAdapter("javascript"), makeAdapter("python")],
    });
    await expect(s.run({ language: "ruby", code: "" })).rejects.toThrow(
      /Available: javascript, python/,
    );
  });
});

// ── Timeout clamp ─────────────────────────────────────────────────────────────

describe("CodeSandboxImpl timeout clamping", () => {
  it("clamps timeoutMs to MAX_TIMEOUT_MS (30_000)", async () => {
    const js = makeAdapter("javascript");
    const s = new CodeSandboxImpl({ adapters: [js] });

    await s.run({ language: "javascript", code: "1", timeoutMs: 999_999 });
    const call = js.runSpy.mock.calls[0]?.[0] as LanguageSandboxRunOptions;
    expect(call.timeoutMs).toBe(30_000);
  });

  it("clamps timeoutMs to minimum of 1", async () => {
    const js = makeAdapter("javascript");
    const s = new CodeSandboxImpl({ adapters: [js] });

    await s.run({ language: "javascript", code: "1", timeoutMs: 0 });
    const call = js.runSpy.mock.calls[0]?.[0] as LanguageSandboxRunOptions;
    expect(call.timeoutMs).toBe(1);
  });

  it("uses DEFAULT_TIMEOUT_MS (5000) when not specified", async () => {
    const js = makeAdapter("javascript");
    const s = new CodeSandboxImpl({ adapters: [js] });

    await s.run({ language: "javascript", code: "1" });
    const call = js.runSpy.mock.calls[0]?.[0] as LanguageSandboxRunOptions;
    expect(call.timeoutMs).toBe(5_000);
  });
});

// ── Stdin gating ──────────────────────────────────────────────────────────────

describe("CodeSandboxImpl stdin gating", () => {
  it("adapter with supportsStdin: false never sees stdin", async () => {
    const js = makeAdapter("javascript", { supportsStdin: false });
    const s = new CodeSandboxImpl({ adapters: [js] });

    await s.run({ language: "javascript", code: "1", stdin: "hello" });
    const call = js.runSpy.mock.calls[0]?.[0] as LanguageSandboxRunOptions;
    expect(call.stdin).toBeUndefined();
  });

  it("adapter with supportsStdin: true receives stdin", async () => {
    const py = makeAdapter("python", { supportsStdin: true });
    const s = new CodeSandboxImpl({ adapters: [py] });

    await s.run({ language: "python", code: "input()", stdin: "hi" });
    const call = py.runSpy.mock.calls[0]?.[0] as LanguageSandboxRunOptions;
    expect(call.stdin).toBe("hi");
  });

  it("adapter with supportsStdin: true but no stdin provided — undefined", async () => {
    const py = makeAdapter("python", { supportsStdin: true });
    const s = new CodeSandboxImpl({ adapters: [py] });

    await s.run({ language: "python", code: "print(1)" });
    const call = py.runSpy.mock.calls[0]?.[0] as LanguageSandboxRunOptions;
    expect(call.stdin).toBeUndefined();
  });
});

// ── Truncation passthrough ────────────────────────────────────────────────────

describe("CodeSandboxImpl truncation passthrough", () => {
  it("no truncated field when both are false", async () => {
    const js = makeAdapter("javascript", {
      result: { truncated: { stdout: false, stderr: false } },
    });
    const s = new CodeSandboxImpl({ adapters: [js] });

    const r = await s.run({ language: "javascript", code: "1" });
    expect(r).not.toHaveProperty("truncated");
  });

  it("truncated field present when stdout is true", async () => {
    const js = makeAdapter("javascript", {
      result: { truncated: { stdout: true, stderr: false } },
    });
    const s = new CodeSandboxImpl({ adapters: [js] });

    const r = await s.run({ language: "javascript", code: "1" });
    expect(r.truncated).toEqual({ stdout: true, stderr: false });
  });

  it("truncated field present when stderr is true", async () => {
    const js = makeAdapter("javascript", {
      result: { truncated: { stdout: false, stderr: true } },
    });
    const s = new CodeSandboxImpl({ adapters: [js] });

    const r = await s.run({ language: "javascript", code: "1" });
    expect(r.truncated).toEqual({ stdout: false, stderr: true });
  });
});

// ── Guest error formatting ────────────────────────────────────────────────────

describe("CodeSandboxImpl guest error formatting", () => {
  it("guestError: 'boom' appears in stderr", async () => {
    const js = makeAdapter("javascript", {
      result: { stderr: "", guestError: "boom" },
    });
    const s = new CodeSandboxImpl({ adapters: [js] });

    const r = await s.run({ language: "javascript", code: "throw new Error('boom')" });
    expect(r.stderr).toContain("boom");
  });

  it("guestError appended to existing stderr", async () => {
    const js = makeAdapter("javascript", {
      result: { stderr: "existing error\n", guestError: "boom" },
    });
    const s = new CodeSandboxImpl({ adapters: [js] });

    const r = await s.run({ language: "javascript", code: "throw 1" });
    expect(r.stderr).toContain("existing error");
    expect(r.stderr).toContain("boom");
  });

  it("adapter internal throw becomes stderr result", async () => {
    const js: LanguageSandbox = {
      language: "javascript",
      displayName: "JS",
      supportsStdin: false,
      run: vi.fn().mockRejectedValue(new Error("engine init failed")),
    };
    const s = new CodeSandboxImpl({ adapters: [js] });

    const r = await s.run({ language: "javascript", code: "1" });
    expect(r.exitCode).toBeNull();
    expect(r.stderr).toContain("engine init failed");
  });
});
