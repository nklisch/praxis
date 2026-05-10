import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MessageBubble, type MessageBubbleProps } from "../components/message.js";

afterEach(() => cleanup());

// Helper: passing `role` literally on a JSX element trips Biome's a11y rule
// because it reads `role` as the ARIA `role` attribute. The MessageBubble
// component uses `role` as a domain prop (speaker), not the ARIA attribute.
// Spreading the props object sidesteps the JSX-attribute static check.
function renderBubble(props: MessageBubbleProps) {
  return render(<MessageBubble {...props} />);
}

describe("MessageBubble", () => {
  it("user bubble renders content as plain text (no markdown)", () => {
    const { container } = renderBubble({ role: "user", content: "**not bold**" });
    expect(container.querySelector("strong")).toBeNull();
    expect(container.textContent).toContain("**not bold**");
  });

  it("assistant bubble renders content as markdown", () => {
    const { container } = renderBubble({ role: "assistant", content: "**bold** text" });
    expect(container.querySelector("strong")?.textContent).toBe("bold");
  });

  it("assistant bubble renders fenced code", () => {
    const fenced = "```js\nconst x = 1;\n```";
    const { container } = renderBubble({ role: "assistant", content: fenced });
    expect(container.querySelector("pre code")?.textContent).toContain("const x = 1;");
  });

  it("assistant bubble renders inline math via KaTeX", () => {
    const { container } = renderBubble({ role: "assistant", content: "Solve $x^2 = 4$." });
    expect(container.querySelector(".katex")).not.toBeNull();
  });

  it("renders streaming cursor when streaming=true", () => {
    const { container } = renderBubble({
      role: "assistant",
      content: "partial",
      streaming: true,
    });
    const cursor = container.querySelector('[aria-hidden="true"]');
    expect(cursor).not.toBeNull();
  });

  it("does not render cursor when not streaming", () => {
    const { container } = renderBubble({ role: "assistant", content: "settled" });
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
  });

  it("citation chip click invokes the scroll handler", () => {
    const scrollSpy = vi.fn();
    const target = document.createElement("div");
    target.id = "citation-1";
    target.scrollIntoView = scrollSpy;
    document.body.appendChild(target);

    const { container } = renderBubble({
      role: "assistant",
      content: "See [1] please.",
      citations: [
        {
          chunkId: "chunk-1" as never,
          documentId: "doc-1" as never,
          documentTitle: "Doc",
          page: 1,
          score: 0.9,
          snippet: "snippet",
        },
      ],
    });

    const chip = container.querySelector("button");
    if (!chip) throw new Error("expected a citation-chip button");
    fireEvent.click(chip);
    expect(scrollSpy).toHaveBeenCalled();

    document.body.removeChild(target);
  });

  it("user role label renders 'You'", () => {
    renderBubble({ role: "user", content: "hi" });
    expect(screen.getByText("You")).toBeDefined();
  });

  it("assistant role label renders 'Tutor'", () => {
    renderBubble({ role: "assistant", content: "hi" });
    expect(screen.getByText("Tutor")).toBeDefined();
  });
});
