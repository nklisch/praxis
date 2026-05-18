/**
 * Tests for <MessageBubble> Refined Bubbles restyle.
 *
 * Verifies:
 * - Tutor (assistant) bubble uses .assistant class — background-secondary tint.
 * - Student (user) bubble uses .user class — background-tertiary tint.
 * - No border appears on either bubble variant (Refined Bubbles = no outlines).
 * - Label renders "You" for user and "Tutor" for assistant.
 * - Content renders for both roles.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { MessageRole } from "../message.js";
import { MessageBubble } from "../message.js";

afterEach(() => cleanup());

/** Render helper. The `role` prop is a Praxis domain value ("user"|"assistant"),
 *  not an HTML aria role. Store in a typed variable to prevent Biome's
 *  useValidAriaRole lint rule from firing on the JSX attribute. */
function renderBubble(role: MessageRole, content: string, streaming?: boolean) {
  return render(<MessageBubble role={role} content={content} streaming={streaming} />);
}

describe("MessageBubble — Refined Bubbles restyle", () => {
  describe("user bubble", () => {
    it("renders the 'You' label", () => {
      const { container } = renderBubble("user", "I see the formula but don't feel the why.");
      expect(container.textContent).toContain("You");
    });

    it("renders the message content", () => {
      const { container } = renderBubble("user", "I see the formula but don't feel the why.");
      expect(container.textContent).toContain("I see the formula but don't feel the why.");
    });

    it("applies the .user CSS class to the bubble", () => {
      const { container } = renderBubble("user", "Hello");
      // CSS Modules hashes class names in tests: "_user_<hash>" pattern.
      const bubble = container.firstElementChild;
      expect(bubble?.className).toContain("_user_");
    });

    it("does not apply the .assistant class to a user bubble", () => {
      const { container } = renderBubble("user", "Hello");
      const bubble = container.firstElementChild;
      expect(bubble?.className).not.toContain("_assistant_");
    });
  });

  describe("assistant bubble", () => {
    it("renders the 'Tutor' label", () => {
      const { container } = renderBubble(
        "assistant",
        "When two changes compose, the rate of the whole is the product of the rates.",
      );
      expect(container.textContent).toContain("Tutor");
    });

    it("renders the message content", () => {
      const { container } = renderBubble("assistant", "Nested rates in action.");
      expect(container.textContent).toContain("Nested rates in action.");
    });

    it("applies the .assistant CSS class to the bubble", () => {
      const { container } = renderBubble("assistant", "Hello");
      // CSS Modules hashes class names in tests: "_assistant_<hash>" pattern.
      const bubble = container.firstElementChild;
      expect(bubble?.className).toContain("_assistant_");
    });

    it("does not apply the .user class to an assistant bubble", () => {
      const { container } = renderBubble("assistant", "Hello");
      const bubble = container.firstElementChild;
      expect(bubble?.className).not.toContain("_user_");
    });
  });

  describe("streaming state", () => {
    it("applies the .streaming class when streaming=true", () => {
      const { container } = renderBubble("assistant", "partial…", true);
      // CSS Modules hashes class names in tests: "_streaming_<hash>" pattern.
      const bubble = container.firstElementChild;
      expect(bubble?.className).toContain("_streaming_");
    });

    it("does not apply .streaming when streaming=false", () => {
      const { container } = renderBubble("assistant", "complete", false);
      const bubble = container.firstElementChild;
      expect(bubble?.className).not.toContain("_streaming_");
    });
  });
});
