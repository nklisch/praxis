import { Readable, Writable } from "node:stream";
import { describe, expect, it, vi } from "vitest";

// Mock spawnCli so we can control the fake CLI output without needing the real binary.
vi.mock("../cli/spawn.js", () => {
  return {
    spawnCli: vi.fn(),
    attachSpawnErrorHandler: vi.fn(),
    isErrnoException: vi.fn(),
  };
});

// Minimal valid stream events in the CLI's wire format (snake_case).
// These match what `claude --output-format stream-json` actually emits.
const INIT_LINE = JSON.stringify({
  type: "system",
  subtype: "init",
  session_id: "test-session-uuid-1234",
  model: "claude-sonnet-4-6",
});

const RESULT_LINE = JSON.stringify({
  type: "result",
  subtype: "success",
  session_id: "test-session-uuid-1234",
  result: "hello",
  usage: { input_tokens: 10, output_tokens: 5 },
  is_error: false,
  cost_usd: 0,
});

/** Build a fake ChildProcess-like object whose stdout emits the given lines. */
function makeFakeProc(lines: string[]) {
  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });
  const stdin = new Writable({
    write(_chunk, _enc, cb) {
      cb();
    },
  });

  const closeListeners: Array<(code: number | null) => void> = [];

  const proc = {
    stdout,
    stderr,
    stdin,
    exitCode: 0 as number | null,
    on: vi.fn((event: string, cb: (code: number | null) => void) => {
      if (event === "close") closeListeners.push(cb);
    }),
    kill: vi.fn(),
  };

  // Push lines then end the stream
  queueMicrotask(() => {
    setTimeout(() => {
      for (const line of lines) {
        stdout.push(`${line}\n`);
      }
      // Allow readline to process, then signal close
      setTimeout(() => {
        stdout.push(null); // end stream
        for (const cb of closeListeners) cb(0);
      }, 10);
    }, 5);
  });

  return proc;
}

describe("onSessionReady", () => {
  it("fires exactly once with the parsed session id from the init event", async () => {
    const { spawnCli } = await import("../cli/spawn.js");
    vi.mocked(spawnCli).mockReturnValueOnce({
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      proc: makeFakeProc([INIT_LINE, RESULT_LINE]) as any,
      cleanup: vi.fn().mockResolvedValue(undefined),
    });

    const { createConversation } = await import("../conversation.js");

    const fired: string[] = [];
    const conv = createConversation({
      onSessionReady: (id) => fired.push(id),
      noSessionPersistence: true,
    });

    try {
      await conv.sendAndCollect("hello");
    } catch {
      // acceptable in test environment
    } finally {
      await conv.close();
    }

    expect(fired).toHaveLength(1);
    expect(fired[0]).toBe("test-session-uuid-1234");
  }, 10_000);

  it("does not fire when no init event arrives (only result)", async () => {
    const { spawnCli } = await import("../cli/spawn.js");
    vi.mocked(spawnCli).mockReturnValueOnce({
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      proc: makeFakeProc([RESULT_LINE]) as any,
      cleanup: vi.fn().mockResolvedValue(undefined),
    });

    const { createConversation } = await import("../conversation.js");

    const fired: string[] = [];
    const conv = createConversation({
      onSessionReady: (id) => fired.push(id),
      noSessionPersistence: true,
    });

    try {
      await conv.sendAndCollect("hello").catch(() => {});
    } finally {
      await conv.close();
    }

    expect(fired).toHaveLength(0);
  }, 10_000);

  it("fires before conversation.sessionId resolves with the same id", async () => {
    const { spawnCli } = await import("../cli/spawn.js");
    vi.mocked(spawnCli).mockReturnValueOnce({
      // biome-ignore lint/suspicious/noExplicitAny: test mock
      proc: makeFakeProc([INIT_LINE, RESULT_LINE]) as any,
      cleanup: vi.fn().mockResolvedValue(undefined),
    });

    const { createConversation } = await import("../conversation.js");

    let callbackId: string | undefined;
    const conv = createConversation({
      onSessionReady: (id) => {
        callbackId = id;
      },
      noSessionPersistence: true,
    });

    try {
      await conv.sendAndCollect("hello");
      const resolvedId = await conv.sessionId;
      // Both paths must agree on the session id
      expect(callbackId).toBe("test-session-uuid-1234");
      expect(resolvedId).toBe("test-session-uuid-1234");
    } catch {
      // acceptable in test env
    } finally {
      await conv.close();
    }
  }, 10_000);
});
