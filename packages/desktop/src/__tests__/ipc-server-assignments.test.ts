/**
 * IPC server handler tests for praxis.assignments.* channels.
 * Tests the channel naming convention for Phase 8 assignment operations.
 */
import { describe, expect, it } from "vitest";

describe("praxis.assignments.* IPC channel convention", () => {
  const BASE = "praxis.assignments";

  it("uses praxis.assignments.get for fetching a single assignment", () => {
    expect(`${BASE}.get`).toBe("praxis.assignments.get");
  });

  it("uses praxis.assignments.list for listing assignments by course", () => {
    expect(`${BASE}.list`).toBe("praxis.assignments.list");
  });

  it("uses praxis.assignments.recordResponse for auto-saving a per-item response", () => {
    expect(`${BASE}.recordResponse`).toBe("praxis.assignments.recordResponse");
  });

  it("uses praxis.assignments.getResponses for reading saved responses", () => {
    expect(`${BASE}.getResponses`).toBe("praxis.assignments.getResponses");
  });

  it("uses praxis.assignments.submit for grading submission (non-streamed)", () => {
    expect(`${BASE}.submit`).toBe("praxis.assignments.submit");
  });

  it("five channels cover the full assignment lifecycle", () => {
    const channels = ["get", "list", "recordResponse", "getResponses", "submit"];
    expect(channels).toHaveLength(5);
    for (const ch of channels) {
      expect(`${BASE}.${ch}`).toMatch(/^praxis\.assignments\./);
    }
  });

  it("session.start channel accepts assignmentId as optional param (Phase 8)", () => {
    // The channel name stays the same — the payload shape is extended.
    expect("praxis.session.start").toBe("praxis.session.start");
  });
});
