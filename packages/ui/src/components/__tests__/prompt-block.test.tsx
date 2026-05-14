import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PromptBlock } from "../prompt-block.js";

afterEach(() => cleanup());

const baseProps = {
	blockId: "role.teach",
	title: "role.teach",
	positionLabel: "role",
	currentText: "you are a tutor",
	defaultText: "you are a tutor",
	hasOverride: false,
	customizable: true,
	locked: false,
	onSave: async () => {},
};

describe("PromptBlock", () => {
	it("view-mode renders currentText", () => {
		render(<PromptBlock {...baseProps} />);
		expect(screen.getByText("you are a tutor")).toBeDefined();
	});

	it("clicking Edit enters edit-mode; Save calls onSave(draft); Cancel reverts", async () => {
		const onSave = vi.fn().mockResolvedValue(undefined);
		render(<PromptBlock {...baseProps} onSave={onSave} />);
		fireEvent.click(screen.getByText("edit"));

		const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
		fireEvent.change(textarea, { target: { value: "new tutor prompt" } });
		fireEvent.click(screen.getByText("save"));

		await new Promise((r) => setTimeout(r, 0));
		expect(onSave).toHaveBeenCalledWith("new tutor prompt");
	});

	it("onDraftChange fires on keystroke and with null on cancel/save", () => {
		const onDraftChange = vi.fn();
		render(<PromptBlock {...baseProps} onDraftChange={onDraftChange} />);
		fireEvent.click(screen.getByText("edit"));
		// initial entry to edit-mode pushes the snapshot
		expect(onDraftChange).toHaveBeenCalledWith("you are a tutor");

		const ta = screen.getByRole("textbox") as HTMLTextAreaElement;
		fireEvent.change(ta, { target: { value: "edited" } });
		expect(onDraftChange).toHaveBeenCalledWith("edited");

		fireEvent.click(screen.getByText("cancel"));
		expect(onDraftChange).toHaveBeenCalledWith(null);
	});

	it("non-customizable hides the Edit button", () => {
		render(<PromptBlock {...baseProps} customizable={false} />);
		expect(screen.queryByText("edit")).toBeNull();
	});

	it("locked hides the Edit button", () => {
		render(<PromptBlock {...baseProps} locked={true} />);
		expect(screen.queryByText("edit")).toBeNull();
	});

	it("Edited badge appears when hasOverride is true", () => {
		const { rerender } = render(<PromptBlock {...baseProps} hasOverride={false} />);
		expect(screen.queryByText("edited")).toBeNull();
		rerender(<PromptBlock {...baseProps} hasOverride={true} />);
		expect(screen.getByText("edited")).toBeDefined();
	});

	it("Diff toggle is visible only when defaultText present and customizable", () => {
		const { rerender } = render(<PromptBlock {...baseProps} />);
		expect(screen.getByText("diff")).toBeDefined();
		// hide defaultText
		rerender(<PromptBlock {...baseProps} defaultText={undefined as unknown as string} />);
		expect(screen.queryByText("diff")).toBeNull();
	});

	it("editEnabled=false disables Edit button (parent enforces single-block edit)", () => {
		render(<PromptBlock {...baseProps} editEnabled={false} />);
		const btn = screen.getByText("edit") as HTMLButtonElement;
		expect(btn.disabled).toBe(true);
	});
});
