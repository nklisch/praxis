import { describe, expect, it } from "vitest";
import { createPraxisClient } from "../client.js";
import type { ClientTransport } from "../transport/types.js";

function makeTransport(): {
  transport: ClientTransport;
  invokedChannels: Array<{ channel: string; args: unknown[] }>;
  streamedChannels: Array<{ channel: string; args: unknown[] }>;
} {
  const invokedChannels: Array<{ channel: string; args: unknown[] }> = [];
  const streamedChannels: Array<{ channel: string; args: unknown[] }> = [];

  const transport: ClientTransport = {
    invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
      invokedChannels.push({ channel, args });
      return Promise.resolve(undefined as unknown as T);
    },
    stream<T>(channel: string, ...args: unknown[]): AsyncIterable<T> {
      streamedChannels.push({ channel, args });
      return {
        [Symbol.asyncIterator]() {
          return {
            next() {
              return Promise.resolve({ done: true, value: undefined as unknown as T });
            },
          };
        },
      };
    },
  };

  return { transport, invokedChannels, streamedChannels };
}

describe("createPraxisClient", () => {
  it("session.active routes to praxis.session.active invoke", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.session.active();
    expect(invokedChannels[0]?.channel).toBe("praxis.session.active");
  });

  it("session.start routes to praxis.session.start invoke", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.session.start({ modeId: "teach" });
    expect(invokedChannels[0]?.channel).toBe("praxis.session.start");
    expect(invokedChannels[0]?.args[0]).toEqual({ modeId: "teach" });
  });

  it("session.send routes to praxis.session.send stream", () => {
    const { transport, streamedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    // biome-ignore lint/suspicious/noExplicitAny: test
    client.session.send("session-1" as any, "hello");
    expect(streamedChannels[0]?.channel).toBe("praxis.session.send");
  });

  it("session.end routes to praxis.session.end invoke", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    // biome-ignore lint/suspicious/noExplicitAny: test
    await client.session.end("session-1" as any);
    expect(invokedChannels[0]?.channel).toBe("praxis.session.end");
  });

  it("config.engineConfig routes to praxis.config.engineConfig invoke", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.config.engineConfig();
    expect(invokedChannels[0]?.channel).toBe("praxis.config.engineConfig");
  });

  it("config.setEngineConfig routes to praxis.config.setEngineConfig invoke", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.config.setEngineConfig({ engineId: "direct.anthropic" });
    expect(invokedChannels[0]?.channel).toBe("praxis.config.setEngineConfig");
    expect(invokedChannels[0]?.args[0]).toEqual({ engineId: "direct.anthropic" });
  });

  it("config.firstRunCompleted routes to praxis.config.firstRunCompleted invoke", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.config.firstRunCompleted();
    expect(invokedChannels[0]?.channel).toBe("praxis.config.firstRunCompleted");
  });

  it("config.markFirstRunComplete routes to praxis.config.markFirstRunComplete invoke", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.config.markFirstRunComplete();
    expect(invokedChannels[0]?.channel).toBe("praxis.config.markFirstRunComplete");
  });

  it("update.checkLatest routes to praxis.update.checkLatest invoke", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.update.checkLatest();
    expect(invokedChannels[0]?.channel).toBe("praxis.update.checkLatest");
  });

  describe("claudeAuth", () => {
    it("claudeAuth.status() routes to praxis.auth.claude.status invoke", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      await client.claudeAuth.status();
      expect(invokedChannels[0]?.channel).toBe("praxis.auth.claude.status");
    });

    it("claudeAuth.login() routes to praxis.auth.claude.login stream", () => {
      const { transport, streamedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      // Calling login() returns the AsyncIterable immediately (no await needed)
      client.claudeAuth.login();
      expect(streamedChannels[0]?.channel).toBe("praxis.auth.claude.login");
    });

    it("claudeAuth.login() passes no extra args to transport.stream", () => {
      const { transport, streamedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      client.claudeAuth.login();
      expect(streamedChannels[0]?.args).toEqual([]);
    });
  });

  describe("shell", () => {
    it("shell.openExternal(url) routes to praxis.shell.openExternal invoke with url arg", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      await client.shell.openExternal("https://example.com");
      expect(invokedChannels[0]?.channel).toBe("praxis.shell.openExternal");
      expect(invokedChannels[0]?.args[0]).toBe("https://example.com");
    });
  });

  describe("tabs (Phase 14)", () => {
    it("tabs.listOpen() routes to praxis.tabs.listOpen with no args", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      await client.tabs.listOpen();
      expect(invokedChannels[0]?.channel).toBe("praxis.tabs.listOpen");
      expect(invokedChannels[0]?.args).toHaveLength(0);
    });

    it("tabs.list() routes to praxis.tabs.list with opts", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      await client.tabs.list({ limit: 10, includeClosed: true });
      expect(invokedChannels[0]?.channel).toBe("praxis.tabs.list");
      expect(invokedChannels[0]?.args[0]).toEqual({ limit: 10, includeClosed: true });
    });

    it("tabs.open() routes to praxis.tabs.open with sessionId only (no studentId)", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      await client.tabs.open({ sessionId: "sess-1" as any, courseTitle: "Math" });
      expect(invokedChannels[0]?.channel).toBe("praxis.tabs.open");
      const payload = invokedChannels[0]?.args[0] as Record<string, unknown>;
      expect(payload.sessionId).toBe("sess-1");
      expect(payload.courseTitle).toBe("Math");
      expect(payload.studentId).toBeUndefined();
    });

    it("tabs.close() routes to praxis.tabs.close", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      await client.tabs.close("tab-1" as any);
      expect(invokedChannels[0]?.channel).toBe("praxis.tabs.close");
      expect(invokedChannels[0]?.args[0]).toBe("tab-1");
    });

    it("tabs.touch() routes to praxis.tabs.touch", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      await client.tabs.touch("tab-1" as any);
      expect(invokedChannels[0]?.channel).toBe("praxis.tabs.touch");
    });

    it("tabs.rename() routes to praxis.tabs.rename with tabId and title", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      await client.tabs.rename("tab-1" as any, "new name");
      expect(invokedChannels[0]?.channel).toBe("praxis.tabs.rename");
      expect(invokedChannels[0]?.args[0]).toEqual({ tabId: "tab-1", title: "new name" });
    });
  });

  describe("session.list (Phase 14)", () => {
    it("session.list() routes to praxis.session.list", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      await client.session.list();
      expect(invokedChannels[0]?.channel).toBe("praxis.session.list");
      expect(invokedChannels[0]?.args[0]).toEqual({});
    });

    it("session.list(opts) passes opts to channel", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      await client.session.list({ includeEnded: false, limit: 20 });
      expect(invokedChannels[0]?.channel).toBe("praxis.session.list");
      expect(invokedChannels[0]?.args[0]).toEqual({ includeEnded: false, limit: 20 });
    });
  });

  describe("conceptMaps (Phase 15b)", () => {
    it("conceptMaps.list() routes to praxis.conceptMaps.list with courseId", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      await client.conceptMaps.list({ courseId: "course-1" as any });
      expect(invokedChannels[0]?.channel).toBe("praxis.conceptMaps.list");
      expect(invokedChannels[0]?.args[0]).toEqual({ courseId: "course-1" });
    });

    it("conceptMaps.create() routes to praxis.conceptMaps.create", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      await client.conceptMaps.create({ courseId: "course-1" as any, title: "My Map" });
      expect(invokedChannels[0]?.channel).toBe("praxis.conceptMaps.create");
      expect(invokedChannels[0]?.args[0]).toEqual({ courseId: "course-1", title: "My Map" });
    });

    it("conceptMaps.get() routes to praxis.conceptMaps.get with id", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      await client.conceptMaps.get("map-1" as any);
      expect(invokedChannels[0]?.channel).toBe("praxis.conceptMaps.get");
      expect(invokedChannels[0]?.args[0]).toBe("map-1");
    });

    it("conceptMaps.delete() routes to praxis.conceptMaps.delete with id", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      await client.conceptMaps.delete("map-1" as any);
      expect(invokedChannels[0]?.channel).toBe("praxis.conceptMaps.delete");
      expect(invokedChannels[0]?.args[0]).toBe("map-1");
    });

    it("conceptMaps.rename() routes to praxis.conceptMaps.rename", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      await client.conceptMaps.rename("map-1" as any, "New Title");
      expect(invokedChannels[0]?.channel).toBe("praxis.conceptMaps.rename");
      expect(invokedChannels[0]?.args[0]).toEqual({ id: "map-1", title: "New Title" });
    });

    it("conceptMaps.listVersions() routes to praxis.conceptMaps.listVersions", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      await client.conceptMaps.listVersions("map-1" as any);
      expect(invokedChannels[0]?.channel).toBe("praxis.conceptMaps.listVersions");
      expect(invokedChannels[0]?.args[0]).toBe("map-1");
    });
  });

  describe("courseDocuments (Phase 16)", () => {
    it("courseDocuments.listForCourse() routes to praxis.courseDocuments.listForCourse with courseId", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      await client.courseDocuments.listForCourse("course-1" as any);
      expect(invokedChannels[0]?.channel).toBe("praxis.courseDocuments.listForCourse");
      expect(invokedChannels[0]?.args[0]).toBe("course-1");
    });

    it("courseDocuments.attach() routes to praxis.courseDocuments.attach with courseId + documentId", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      await client.courseDocuments.attach({
        // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
        courseId: "course-1" as any,
        // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
        documentId: "doc-1" as any,
        source: "manual",
      });
      expect(invokedChannels[0]?.channel).toBe("praxis.courseDocuments.attach");
      const payload = invokedChannels[0]?.args[0] as Record<string, unknown>;
      expect(payload.courseId).toBe("course-1");
      expect(payload.documentId).toBe("doc-1");
      expect(payload.source).toBe("manual");
    });

    it("courseDocuments.attach() without source omits source from payload", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      await client.courseDocuments.attach({
        // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
        courseId: "course-1" as any,
        // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
        documentId: "doc-1" as any,
      });
      const payload = invokedChannels[0]?.args[0] as Record<string, unknown>;
      expect(payload.source).toBeUndefined();
    });

    it("courseDocuments.detach() routes to praxis.courseDocuments.detach with courseId + documentId", async () => {
      const { transport, invokedChannels } = makeTransport();
      const client = createPraxisClient(transport);
      // biome-ignore lint/suspicious/noExplicitAny: branded string passthrough
      await client.courseDocuments.detach({
        courseId: "course-1" as any,
        documentId: "doc-1" as any,
      });
      expect(invokedChannels[0]?.channel).toBe("praxis.courseDocuments.detach");
      const payload = invokedChannels[0]?.args[0] as Record<string, unknown>;
      expect(payload.courseId).toBe("course-1");
      expect(payload.documentId).toBe("doc-1");
    });
  });
});
