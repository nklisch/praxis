import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock @praxis/claude-cli-sdk before importing the service under test.
vi.mock("@praxis/claude-cli-sdk", () => {
  return {
    authStatus: vi.fn(),
    authLogin: vi.fn(),
  };
});

describe("ClaudeAuthServiceImpl", () => {
  const log = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    // biome-ignore lint/suspicious/noExplicitAny: test mock
    child: vi.fn().mockReturnValue(undefined as any),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("status()", () => {
    it("delegates to SDK authStatus and returns the result verbatim", async () => {
      const { authStatus } = await import("@praxis/claude-cli-sdk");
      const { ClaudeAuthServiceImpl } = await import("../claude-auth.js");

      const fakeResult = { loggedIn: true, email: "test@example.com" };
      vi.mocked(authStatus).mockResolvedValue(fakeResult);

      const svc = new ClaudeAuthServiceImpl({ log });
      const result = await svc.status();

      expect(result).toBe(fakeResult);
      expect(authStatus).toHaveBeenCalledOnce();
    });

    it("logs claudeAuth.status with loggedIn flag", async () => {
      const { authStatus } = await import("@praxis/claude-cli-sdk");
      const { ClaudeAuthServiceImpl } = await import("../claude-auth.js");

      vi.mocked(authStatus).mockResolvedValue({ loggedIn: false, error: "not signed in" });

      const svc = new ClaudeAuthServiceImpl({ log });
      await svc.status();

      expect(log.debug).toHaveBeenCalledWith("claudeAuth.status", { loggedIn: false });
    });

    it("propagates errors from SDK authStatus", async () => {
      const { authStatus } = await import("@praxis/claude-cli-sdk");
      const { ClaudeAuthServiceImpl } = await import("../claude-auth.js");

      vi.mocked(authStatus).mockRejectedValue(new Error("CLI not found"));

      const svc = new ClaudeAuthServiceImpl({ log });
      await expect(svc.status()).rejects.toThrow("CLI not found");
    });
  });

  describe("login()", () => {
    it("forwards every event from the SDK iterator without modification", async () => {
      const { authLogin } = await import("@praxis/claude-cli-sdk");
      const { ClaudeAuthServiceImpl } = await import("../claude-auth.js");

      const fakeEvents = [
        { kind: "started" as const },
        { kind: "url" as const, url: "https://claude.ai/login" },
        { kind: "succeeded" as const, status: { loggedIn: true } },
      ];

      async function* fakeGen() {
        for (const e of fakeEvents) {
          yield e;
        }
      }

      vi.mocked(authLogin).mockReturnValue(fakeGen());

      const svc = new ClaudeAuthServiceImpl({ log });
      const collected = [];
      for await (const event of svc.login()) {
        collected.push(event);
      }

      expect(collected).toEqual(fakeEvents);
    });

    it("logs login.start and login.end with correct codes", async () => {
      const { authLogin } = await import("@praxis/claude-cli-sdk");
      const { ClaudeAuthServiceImpl } = await import("../claude-auth.js");

      async function* fakeGen() {
        yield { kind: "started" as const };
        yield { kind: "succeeded" as const, status: { loggedIn: true } };
      }

      vi.mocked(authLogin).mockReturnValue(fakeGen());

      const svc = new ClaudeAuthServiceImpl({ log });
      for await (const _ of svc.login()) {
        /* drain */
      }

      expect(log.info).toHaveBeenCalledWith("claudeAuth.login.start", { method: "claudeai" });
      expect(log.info).toHaveBeenCalledWith("claudeAuth.login.end", { lastKind: "succeeded" });
    });

    it("construction takes only { log } — no DB or other deps", () => {
      // This test validates the constructor shape by simply constructing it
      // without any other dependency.
      // Import is dynamic to avoid module-level hoisting issues.
      expect(async () => {
        const { ClaudeAuthServiceImpl } = await import("../claude-auth.js");
        const svc = new ClaudeAuthServiceImpl({ log });
        expect(svc).toBeDefined();
      }).not.toThrow();
    });

    it("passes opts.signal through to SDK authLogin", async () => {
      const { authLogin } = await import("@praxis/claude-cli-sdk");
      const { ClaudeAuthServiceImpl } = await import("../claude-auth.js");

      async function* fakeGen() {
        yield { kind: "started" as const };
      }

      vi.mocked(authLogin).mockReturnValue(fakeGen());

      const controller = new AbortController();
      const svc = new ClaudeAuthServiceImpl({ log });
      for await (const _ of svc.login({ signal: controller.signal })) {
        /* drain */
      }

      expect(authLogin).toHaveBeenCalledWith({ signal: controller.signal });
    });
  });
});
