/**
 * Unit tests for loadConversationHistory — verifies that user_message,
 * model_message, and system_note events are surfaced correctly and in order.
 */

import { openDb } from "@praxis/core/db";
import { describe, expect, it } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import { appendEpisodic, createSession } from "../episodic.js";
import { loadConversationHistory } from "../history.js";

describe("loadConversationHistory", () => {
  const db = useTempDb();

  it("returns empty array for session with no events", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const sessionId = createSession({
      db: client,
      studentId: "student-1",
      modeId: "teach",
      engineId: "direct.anthropic",
    });

    const turns = loadConversationHistory({ db: client, sessionId });
    expect(turns).toEqual([]);
  });

  it("surfaces user_message and model_message as conversation turns", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const sessionId = createSession({
      db: client,
      studentId: "student-2",
      modeId: "teach",
      engineId: "direct.anthropic",
    });

    appendEpisodic({
      db: client,
      sessionId,
      studentId: "student-2",
      engineId: "direct.anthropic",
      modeId: "teach",
      turnIndex: 0,
      event: { type: "user_message", content: "Hello" },
    });
    appendEpisodic({
      db: client,
      sessionId,
      studentId: "student-2",
      engineId: "direct.anthropic",
      modeId: "teach",
      turnIndex: 0,
      event: { type: "model_message", content: "Hi there", partial: false },
    });

    const turns = loadConversationHistory({ db: client, sessionId });
    expect(turns).toEqual([
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ]);
  });

  it("surfaces system_note as a synthetic user turn with [Praxis] prefix", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const sessionId = createSession({
      db: client,
      studentId: "student-3",
      modeId: "teach",
      engineId: "direct.anthropic",
    });

    appendEpisodic({
      db: client,
      sessionId,
      studentId: "student-3",
      engineId: "direct.anthropic",
      modeId: "teach",
      turnIndex: 0,
      event: {
        type: "system_note",
        content: "The student submitted the quiz.",
        origin: { kind: "system", topic: "test" },
      },
    });

    const turns = loadConversationHistory({ db: client, sessionId });
    expect(turns).toHaveLength(1);
    expect(turns[0]).toEqual({
      role: "user",
      content: "[Praxis] The student submitted the quiz.",
    });
  });

  it("preserves turn order: system_note before user_message in same turn", () => {
    const { db: client } = openDb({ path: db.dbPath });
    const sessionId = createSession({
      db: client,
      studentId: "student-4",
      modeId: "teach",
      engineId: "direct.anthropic",
    });

    // Turn 0: normal user/model exchange
    appendEpisodic({
      db: client,
      sessionId,
      studentId: "student-4",
      engineId: "direct.anthropic",
      modeId: "teach",
      turnIndex: 0,
      event: { type: "user_message", content: "First message" },
    });
    appendEpisodic({
      db: client,
      sessionId,
      studentId: "student-4",
      engineId: "direct.anthropic",
      modeId: "teach",
      turnIndex: 0,
      event: { type: "model_message", content: "First reply", partial: false },
    });

    // Turn 1: system_note appended (e.g. assignment submitted while user was idle)
    appendEpisodic({
      db: client,
      sessionId,
      studentId: "student-4",
      engineId: "direct.anthropic",
      modeId: "teach",
      turnIndex: 1,
      event: {
        type: "system_note",
        content: "Student submitted quiz: 4/5.",
        origin: {
          kind: "assignment_submission",
          assignmentId: "assign-1",
          childSessionId: "child-session-1",
          gradeTotal: 0.8,
          submittedAt: Date.now(),
        },
      },
    });

    // Turn 2: user types next message
    appendEpisodic({
      db: client,
      sessionId,
      studentId: "student-4",
      engineId: "direct.anthropic",
      modeId: "teach",
      turnIndex: 2,
      event: { type: "user_message", content: "Thanks for the feedback!" },
    });

    const turns = loadConversationHistory({ db: client, sessionId });
    expect(turns).toHaveLength(4);
    expect(turns[0]).toEqual({ role: "user", content: "First message" });
    expect(turns[1]).toEqual({ role: "assistant", content: "First reply" });
    expect(turns[2]).toMatchObject({
      role: "user",
      content: expect.stringContaining("[Praxis] Student submitted quiz: 4/5."),
    });
    expect(turns[3]).toEqual({ role: "user", content: "Thanks for the feedback!" });
  });
});
