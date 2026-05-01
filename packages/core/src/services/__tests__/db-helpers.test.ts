import { describe, expect, it, vi } from "vitest";
import { loadOrThrow } from "../db-helpers.js";

describe("loadOrThrow", () => {
  it("returns the row when fetch resolves a non-null value", async () => {
    const row = { id: "note-1", text: "hello" };
    const fetch = vi.fn().mockResolvedValue(row);
    const result = await loadOrThrow(fetch, { entity: "note", op: "create", id: "note-1" });
    expect(result).toBe(row);
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("throws with formatted message when fetch returns null", async () => {
    const fetch = vi.fn().mockResolvedValue(null);
    await expect(
      loadOrThrow(fetch, { entity: "flashcard", op: "update", id: "fc-99" }),
    ).rejects.toThrow("flashcard not found after update: fc-99");
  });

  it("logs ghost-write at warn level when logger is provided and row is null", async () => {
    const fetch = vi.fn().mockResolvedValue(null);
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await expect(
      loadOrThrow(fetch, { entity: "note", op: "create", id: "note-missing", log }),
    ).rejects.toThrow();
    expect(log.warn).toHaveBeenCalledWith("ghost-write detected", {
      entity: "note",
      op: "create",
      id: "note-missing",
    });
  });

  it("does not call log when row is found", async () => {
    const row = { id: "gate-1" };
    const fetch = vi.fn().mockResolvedValue(row);
    const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    await loadOrThrow(fetch, { entity: "gate", op: "override", id: "gate-1", log });
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("works without a logger (log is optional)", async () => {
    const fetch = vi.fn().mockResolvedValue(null);
    await expect(
      loadOrThrow(fetch, { entity: "lesson", op: "update", id: "lesson-1" }),
    ).rejects.toThrow("lesson not found after update: lesson-1");
  });
});
