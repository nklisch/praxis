/**
 * Unit tests for noteBriefAwarenessFragment.
 *
 * Verifies the fragment has the correct identity and contains the key
 * behavioural guidance expected by the note-to-tutor-brief flow.
 */

import { describe, expect, it } from "vitest";
import { noteBriefAwarenessFragment } from "../note-brief-awareness.js";

describe("noteBriefAwarenessFragment — shape", () => {
  it("has id 'context.note-brief-awareness'", () => {
    expect(noteBriefAwarenessFragment.id).toBe("context.note-brief-awareness");
  });

  it("is positioned in 'context'", () => {
    expect(noteBriefAwarenessFragment.position).toBe("context");
  });

  it("is not customizable (system-owned behaviour)", () => {
    expect(noteBriefAwarenessFragment.customizable).toBe(false);
  });
});

describe("noteBriefAwarenessFragment — template content", () => {
  it("references the <note-cue> tag so the tutor recognises briefed sessions", () => {
    expect(noteBriefAwarenessFragment.template).toContain("<note-cue>");
  });

  it("references the <note-body> tag", () => {
    expect(noteBriefAwarenessFragment.template).toContain("<note-body>");
  });

  it("instructs the tutor to address the cue directly", () => {
    expect(noteBriefAwarenessFragment.template).toContain("addressing the cue directly");
  });

  it("instructs the tutor to offer note.update at session close", () => {
    expect(noteBriefAwarenessFragment.template).toContain("note.update");
  });

  it("contains the offer-to-update wording", () => {
    expect(noteBriefAwarenessFragment.template).toContain(
      "Want me to add what we worked out to your note?",
    );
  });
});

describe("noteBriefAwarenessFragment — teach mode inclusion", () => {
  it("is present in the teach mode promptFragments list", async () => {
    const { teachMode } = await import("../../teach.js");
    const ids = teachMode.promptFragments.map((f) => f.id);
    expect(ids).toContain("context.note-brief-awareness");
  });
});
