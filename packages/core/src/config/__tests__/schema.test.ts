/**
 * Regression tests for EngineConfigSchema.baseUrl — scheme allowlist.
 *
 * The renderer-facing schema must reject any non-http(s) URI at the IPC
 * boundary. The stored schema stays permissive; sanitization happens in the
 * read path (tested in config-service.baseurl-sanitize.test.ts).
 */

import { describe, expect, it } from "vitest";
import { EngineConfigSchema } from "../schema.js";

const BASE = { engineId: "claude-code" } as const;

describe("EngineConfigSchema.baseUrl — scheme allowlist", () => {
  it("accepts a plain https URL", () => {
    const result = EngineConfigSchema.safeParse({
      ...BASE,
      baseUrl: "https://api.example.com",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.baseUrl).toBe("https://api.example.com");
    }
  });

  it("accepts a plain http URL", () => {
    const result = EngineConfigSchema.safeParse({
      ...BASE,
      baseUrl: "http://localhost:11434",
    });
    expect(result.success).toBe(true);
  });

  it("accepts undefined (baseUrl is optional)", () => {
    const result = EngineConfigSchema.safeParse({ ...BASE });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.baseUrl).toBeUndefined();
    }
  });

  it("rejects file:// URIs", () => {
    const result = EngineConfigSchema.safeParse({
      ...BASE,
      baseUrl: "file:///etc/passwd",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toMatch(/http\(s\)/);
    }
  });

  it("rejects javascript: URIs", () => {
    const result = EngineConfigSchema.safeParse({
      ...BASE,
      baseUrl: "javascript:alert(1)",
    });
    expect(result.success).toBe(false);
  });

  it("rejects data: URIs", () => {
    const result = EngineConfigSchema.safeParse({
      ...BASE,
      baseUrl: "data:text/html,foo",
    });
    expect(result.success).toBe(false);
  });

  it("rejects URLs with embedded carriage-return (header injection)", () => {
    const result = EngineConfigSchema.safeParse({
      ...BASE,
      baseUrl: "https://api.example.com\r\nHost: evil.com",
    });
    expect(result.success).toBe(false);
  });
});
