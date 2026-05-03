/**
 * Tests for ReasoningTextarea component.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReasoningTextarea } from "../components/item-bodies/reasoning-textarea.js";

afterEach(() => {
  cleanup();
});

describe("ReasoningTextarea", () => {
  it("renders the label 'explain your thinking'", () => {
    render(<ReasoningTextarea id="r1" value="" onChange={() => {}} />);
    expect(screen.getByText(/explain your thinking/i)).toBeDefined();
  });

  it("renders a textarea", () => {
    render(<ReasoningTextarea id="r1" value="" onChange={() => {}} />);
    expect(screen.getByRole("textbox")).toBeDefined();
  });

  it("calls onChange with new value", () => {
    const onChange = vi.fn();
    render(<ReasoningTextarea id="r1" value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "because X" } });
    expect(onChange).toHaveBeenCalledWith("because X");
  });

  it("shows validation hint when showValidation=true and value is empty", () => {
    render(<ReasoningTextarea id="r1" value="" onChange={() => {}} showValidation={true} />);
    expect(screen.getByRole("alert")).toBeDefined();
    expect(screen.getByText(/explanation required/i)).toBeDefined();
  });

  it("does NOT show validation hint when value is non-empty", () => {
    render(
      <ReasoningTextarea id="r1" value="some text" onChange={() => {}} showValidation={true} />,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does NOT show validation hint when showValidation=false", () => {
    render(<ReasoningTextarea id="r1" value="" onChange={() => {}} showValidation={false} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("disables textarea when disabled=true", () => {
    render(<ReasoningTextarea id="r1" value="" onChange={() => {}} disabled={true} />);
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(ta.disabled).toBe(true);
  });
});
