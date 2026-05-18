/**
 * Tests for <Composer> — italic serif input, accent send button, mono hints.
 *
 * Verifies:
 * - Renders the textarea with the editorial placeholder.
 * - Renders the mono hint strip.
 * - Send button is disabled when the textarea is empty.
 * - Send button becomes enabled when the textarea has text.
 * - Pressing Enter calls onSend with the current value.
 * - Pressing Shift+Enter does NOT call onSend (multiline intent).
 * - Clicking Send calls onSend.
 * - disabled prop disables both textarea and send button.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Composer } from "../components/composer.js";
import { COPY } from "../lib/copy.js";

afterEach(() => cleanup());

// tldraw uses canvas APIs not available in jsdom — stub it so ComposerSketch
// doesn't crash when sketchEnabled is true.
vi.mock("tldraw", () => ({
  Tldraw: () => <div data-testid="tldraw-canvas" />,
}));
vi.mock("tldraw/tldraw.css", () => ({}));

describe("Composer", () => {
  it("renders the italic serif textarea with the editorial placeholder", () => {
    const onSend = vi.fn();
    render(<Composer value="" onChange={vi.fn()} onSend={onSend} />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeDefined();
    expect(textarea.getAttribute("placeholder")).toBe(COPY.composer.placeholder);
  });

  it("renders the mono hint strip", () => {
    render(<Composer value="" onChange={vi.fn()} onSend={vi.fn()} />);
    // The hint text is uppercase in CSS but the raw DOM text is lowercase.
    const hint = screen.getByText(COPY.composer.hints);
    expect(hint).toBeDefined();
  });

  it("send button is disabled when the textarea value is empty", () => {
    render(<Composer value="" onChange={vi.fn()} onSend={vi.fn()} />);
    const sendBtn = screen.getByRole("button", { name: /send/i });
    expect(sendBtn.hasAttribute("disabled")).toBe(true);
  });

  it("send button is enabled when the textarea has non-whitespace text", () => {
    render(<Composer value="hello" onChange={vi.fn()} onSend={vi.fn()} />);
    const sendBtn = screen.getByRole("button", { name: /send/i });
    expect(sendBtn.hasAttribute("disabled")).toBe(false);
  });

  it("clicking Send calls onSend with the trimmed value", () => {
    const onSend = vi.fn();
    render(<Composer value="  hello world  " onChange={vi.fn()} onSend={onSend} />);
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("hello world", undefined);
  });

  it("pressing Enter submits the message", () => {
    const onSend = vi.fn();
    render(<Composer value="chain rule" onChange={vi.fn()} onSend={onSend} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", shiftKey: false });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("chain rule", undefined);
  });

  it("pressing Shift+Enter does NOT submit", () => {
    const onSend = vi.fn();
    render(<Composer value="half a thought" onChange={vi.fn()} onSend={onSend} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not submit when value is only whitespace", () => {
    const onSend = vi.fn();
    render(<Composer value="   " onChange={vi.fn()} onSend={onSend} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", shiftKey: false });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("disabled prop disables the textarea and send button", () => {
    render(<Composer value="hello" onChange={vi.fn()} onSend={vi.fn()} disabled />);
    expect(screen.getByRole("textbox").hasAttribute("disabled")).toBe(true);
    expect(screen.getByRole("button", { name: /send/i }).hasAttribute("disabled")).toBe(true);
  });
});
