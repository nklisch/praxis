import { describe, expect, it } from "vitest";
import { buildTranscriptPreface } from "../util/transcript.js";

describe("buildTranscriptPreface", () => {
  it("returns empty string for empty priorTurns", () => {
    expect(buildTranscriptPreface([])).toBe("");
  });

  it("formats a single user turn", () => {
    const result = buildTranscriptPreface([{ role: "user", content: "hello" }]);
    expect(result).toContain("[Continuing this conversation from earlier:]");
    expect(result).toContain("User: hello");
    expect(result).toContain("[Now continuing — please respond to the next user message.]");
  });

  it("formats user and assistant turns in order", () => {
    const result = buildTranscriptPreface([
      { role: "user", content: "first question" },
      { role: "assistant", content: "first answer" },
      { role: "user", content: "second question" },
    ]);
    expect(result).toContain("User: first question");
    expect(result).toContain("Tutor: first answer");
    expect(result).toContain("User: second question");

    // Order check
    const userIdx = result.indexOf("User: first question");
    const tutorIdx = result.indexOf("Tutor: first answer");
    const user2Idx = result.indexOf("User: second question");
    expect(userIdx).toBeLessThan(tutorIdx);
    expect(tutorIdx).toBeLessThan(user2Idx);
  });

  it("ends with a trailing newline", () => {
    const result = buildTranscriptPreface([{ role: "user", content: "hi" }]);
    expect(result.endsWith("\n")).toBe(true);
  });

  it("labels assistant role as Tutor", () => {
    const result = buildTranscriptPreface([{ role: "assistant", content: "I am the tutor" }]);
    expect(result).toContain("Tutor: I am the tutor");
    expect(result).not.toContain("assistant:");
  });
});
