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
 * - When isStreaming=true, the Stop button renders and fires onCancel.
 * - Enter during streaming fires neither onSend nor onCancel.
 * - Textarea accepts input regardless of isStreaming.
 * - No `disabled` prop on ComposerProps.
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

/** Default no-op props for tests that only care about one aspect. */
const defaultProps = {
  value: "",
  onChange: vi.fn(),
  onSend: vi.fn(),
  isStreaming: false,
  onCancel: vi.fn(),
} as const;

describe("Composer — Send mode (isStreaming=false)", () => {
  it("renders the italic serif textarea with the editorial placeholder", () => {
    render(<Composer {...defaultProps} />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeDefined();
    expect(textarea.getAttribute("placeholder")).toBe(COPY.composer.placeholder);
  });

  it("renders the mono hint strip", () => {
    render(<Composer {...defaultProps} />);
    // The hint text is uppercase in CSS but the raw DOM text is lowercase.
    const hint = screen.getByText(COPY.composer.hints);
    expect(hint).toBeDefined();
  });

  it("send button is disabled when the textarea value is empty", () => {
    render(<Composer {...defaultProps} value="" />);
    const sendBtn = screen.getByRole("button", { name: /send/i });
    expect(sendBtn.hasAttribute("disabled")).toBe(true);
  });

  it("send button is enabled when the textarea has non-whitespace text", () => {
    render(<Composer {...defaultProps} value="hello" />);
    const sendBtn = screen.getByRole("button", { name: /send/i });
    expect(sendBtn.hasAttribute("disabled")).toBe(false);
  });

  it("clicking Send calls onSend with the trimmed value", () => {
    const onSend = vi.fn();
    render(<Composer {...defaultProps} value="  hello world  " onSend={onSend} />);
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("hello world", undefined);
  });

  it("pressing Enter submits the message", () => {
    const onSend = vi.fn();
    render(<Composer {...defaultProps} value="chain rule" onSend={onSend} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", shiftKey: false });
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith("chain rule", undefined);
  });

  it("pressing Shift+Enter does NOT submit", () => {
    const onSend = vi.fn();
    render(<Composer {...defaultProps} value="half a thought" onSend={onSend} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", shiftKey: true });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("does not submit when value is only whitespace", () => {
    const onSend = vi.fn();
    render(<Composer {...defaultProps} value="   " onSend={onSend} />);
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", shiftKey: false });
    expect(onSend).not.toHaveBeenCalled();
  });

  it("textarea is not disabled when isStreaming=false", () => {
    render(<Composer {...defaultProps} value="hello" />);
    expect(screen.getByRole("textbox").hasAttribute("disabled")).toBe(false);
  });
});

describe("Composer — Stop mode (isStreaming=true)", () => {
  it("renders the Stop button (with --stop class and correct aria-label) when isStreaming=true", () => {
    render(<Composer {...defaultProps} isStreaming={true} />);
    const stopBtn = screen.getByRole("button", { name: COPY.composer.stopAriaLabel });
    expect(stopBtn).toBeDefined();
    expect(stopBtn.className).toMatch(/composer__send--stop/);
  });

  it("does NOT render the Send button when isStreaming=true", () => {
    render(<Composer {...defaultProps} isStreaming={true} />);
    expect(screen.queryByRole("button", { name: /send/i })).toBeNull();
  });

  it("clicking Stop fires onCancel exactly once", () => {
    const onCancel = vi.fn();
    const onSend = vi.fn();
    render(
      <Composer
        {...defaultProps}
        value="hello"
        isStreaming={true}
        onCancel={onCancel}
        onSend={onSend}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: COPY.composer.stopAriaLabel }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it("pressing Enter during streaming fires neither onSend nor onCancel", () => {
    const onSend = vi.fn();
    const onCancel = vi.fn();
    render(
      <Composer
        {...defaultProps}
        value="hello"
        isStreaming={true}
        onSend={onSend}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter", shiftKey: false });
    expect(onSend).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("textarea accepts input regardless of isStreaming (textarea is never disabled)", () => {
    render(<Composer {...defaultProps} value="typing" isStreaming={true} />);
    expect(screen.getByRole("textbox").hasAttribute("disabled")).toBe(false);
  });
});
